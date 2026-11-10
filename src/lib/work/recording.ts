/**
 * 开放模式（用自己的软件做）的过程证据：录屏每 ~20 秒抽一帧，让会看图的模型逐帧描述「在用什么软件、在干什么、有没有查材料 / 问 AI」，
 * 变成和站内工作台同构的事件流（type: screen），再走同一套过程分析。文本类交付文件（txt / md / csv / json）直接读进交付物。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { logTokenUsage } from '@/lib/token-logger';
import type { WorkEvent } from '@/lib/work/grader';
import { labMediaUrl } from '@/lib/media-url';

const FFMPEG = (ffmpegStatic as unknown as string) || path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
const VISION_MODEL = process.env.WORK_VISION_MODEL || 'claude-sonnet-5-5';

export async function framesFromRecording(url: string, everySec = 20, max = 30): Promise<{ t: number; jpeg: Buffer }[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-rec-'));
  const src = path.join(dir, 'rec.webm');
  fs.writeFileSync(src, Buffer.from(await (await fetch(url)).arrayBuffer()));
  // 时长
  let dur = 0;
  if (!fs.existsSync(FFMPEG)) { console.warn('[work] ffmpeg 不存在：', FFMPEG); return []; }
  try { execFileSync(FFMPEG, ['-i', src], { stdio: 'pipe' }); } catch (e: any) { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(e.stderr)); if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); else console.warn('[work] ffmpeg 探测失败：', String(e?.message).slice(0, 200)); }
  if (!dur || !isFinite(dur)) dur = everySec * max;   // webm 没写时长时按上限抽
  const step = Math.max(everySec, dur / max);
  const out: { t: number; jpeg: Buffer }[] = [];
  for (let t = 2; t < dur && out.length < max; t += step) {
    const f = path.join(dir, `f${out.length}.jpg`);
    try { execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-ss', String(t), '-i', src, '-frames:v', '1', '-vf', 'scale=960:-1', '-q:v', '5', f], { stdio: 'pipe' }); if (fs.existsSync(f)) out.push({ t: Math.round(t), jpeg: fs.readFileSync(f) }); else break; } catch (e: any) { console.warn('[work] 抽帧失败 @', t, String(e?.message).slice(0, 200)); break; }
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return out;
}

/** 整屏定时截图（11-05）：列出 lab-media/work/<sid>/shots/ 下全部截图 → [{ t, url }]（按时间排） */
export async function listShots(sid: string): Promise<{ t: number; url: string }[]> {
  const { supabaseAdmin: db } = await import('@/lib/supabase');
  const out: { t: number; url: string }[] = [];
  for (let off = 0; off < 5000; off += 1000) {
    const { data } = await db.storage.from('lab-media').list(`work/${sid}/shots`, { limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } });
    for (const f of data || []) { const t = parseInt(f.name, 10); if (Number.isFinite(t)) out.push({ t, url: labMediaUrl(db.storage.from('lab-media').getPublicUrl(`work/${sid}/shots/${f.name}`).data.publicUrl) }); }
    if (!data || data.length < 1000) break;
  }
  return out.sort((a, b) => a.t - b.t);
}
/** 从截图里均匀挑 max 张下载下来，给 describeFrames 看 */
export async function framesFromShots(shots: { t: number; url: string }[], max = 30): Promise<{ t: number; jpeg: Buffer }[]> {
  const pick = shots.length <= max ? shots : Array.from({ length: max }, (_, i) => shots[Math.round(i * (shots.length - 1) / (max - 1))]);
  const out: { t: number; jpeg: Buffer }[] = [];
  for (const s of pick) { try { out.push({ t: s.t, jpeg: Buffer.from(await (await fetch(s.url)).arrayBuffer()) }); } catch { /* 跳过 */ } }
  return out;
}

/** 逐帧看图 → 事件流（每帧一条 screen 事件：软件 / 动作 / 看到的内容），另给一段总体描述。
 * 11-10 潜历：30 帧一次看，输出超了 max_tokens，JSON 截断解析失败 → 一帧都没进事件流，报告说「没用 AI」（其实全程在 WorkBuddy 里用 AI）。
 * 改成 10 帧一批、每帧一句短话；解析失败时把完整的帧对象一个个捞出来。 */
export async function describeFrames(frames: { t: number; jpeg: Buffer }[], taskBrief: string, institution?: string): Promise<{ events: WorkEvent[]; summary: string }> {
  if (!frames.length) return { events: [], summary: '' };
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const events: WorkEvent[] = []; const sums: string[] = [];
  for (let i = 0; i < frames.length; i += 10) {
    const content: any[] = [{ type: 'text', text: `下面是一位候选人做一道真活时的屏幕截图（每张标了时间）。任务：${taskBrief.slice(0, 500)}\n请逐张写：用的是什么软件（Excel / CAD / IDE / 浏览器 / 聊天 AI / AI 智能体…，认得出名字就写名字）、在做什么、能看出他在看材料、问 AI（问了什么、AI 在干什么）、还是在写交付物；有没有整段粘贴、长时间停顿、切换多个工具交叉验证。action 和 note 各一句、各不超过 60 字。只写看得见的，看不清就写「看不清」。\n隐私：屏幕上的密码、账号、手机号、私人聊天、和这道题无关的个人信息一律不抄，写「个人信息，略」。\n只返回 JSON：{ "frames": [ { "t": 秒, "app": "", "action": "", "note": "" } ], "summary": "两句话总述这一段的工作方式" }` }];
    for (const f of frames.slice(i, i + 10)) { content.push({ type: 'text', text: `[${fmt(f.t)}]（t=${f.t}）` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.jpeg.toString('base64') } }); }
    const res = await client.messages.create({ model: VISION_MODEL, max_tokens: 6000, messages: [{ role: 'user', content }] });
    const u = res.usage;
    await logTokenUsage({ tool_name: 'work', task_name: 'Grade · 录屏看图', institution: institution || '', model_id: VISION_MODEL, usageMetadata: { promptTokenCount: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0), candidatesTokenCount: u.output_tokens || 0, totalTokenCount: (u.input_tokens || 0) + (u.output_tokens || 0) }, stage: 'use' } as any).catch(() => {});
    const { frames: fr, summary } = parseFrames(res.content.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map(b => b.text).join('\n'));
    for (const f of fr) events.push({ t: Number(f.t) || 0, type: 'screen', note: [f.app, f.action, f.note].filter(Boolean).join(' · ').slice(0, 240) });
    if (summary) sums.push(summary);
  }
  return { events: events.sort((a, b) => a.t - b.t), summary: sums.join(' ').slice(0, 900) };
}

/** 模型回的 JSON 常带 ```json 围栏、偶尔被截断：先整段解析，不行就把完整的 {"t":…} 帧对象一个个捞出来 */
export function parseFrames(text: string): { frames: any[]; summary: string } {
  try { const p = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); if (Array.isArray(p?.frames)) return { frames: p.frames, summary: String(p.summary || '') }; } catch { /* 往下捞 */ }
  const frames: any[] = [];
  for (const m of text.matchAll(/\{\s*"t"\s*:[^{}]*\}/g)) { try { frames.push(JSON.parse(m[0])); } catch { /* 半截的跳过 */ } }
  const sm = /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  return { frames, summary: sm ? sm[1] : '' };
}

/** 交付文件读进交付物：文本直接读；PDF / Word / Excel 抽文字，抽不出文字的 PDF（图片型）交给 Claude 看原件；图片看图写说明；一模一样的文件只读一次 */
export async function readTextFiles(files: { name: string; url: string; size: number }[]): Promise<string> {
  const parts: string[] = []; const seen = new Map<string, string>();
  const { createHash } = await import('node:crypto');
  const { describeImage, readPdfVisually } = await import('./vision');
  for (const f of files) {
    const head = `### 文件 [${f.name}](${f.url})`;
    let buf: Buffer;
    try { buf = Buffer.from(await (await fetch(f.url)).arrayBuffer()); } catch { parts.push(`${head}（读取失败）`); continue; }
    const md5 = createHash('md5').update(buf).digest('hex');
    if (seen.has(md5)) { parts.push(`${head}（和「${seen.get(md5)}」是同一个文件，内容见上）`); continue; }
    seen.set(md5, f.name);
    if (/\.(txt|md|csv|json|tsv)$/i.test(f.name) && f.size < 400_000) parts.push(`${head}\n${buf.toString('utf8').slice(0, 12000)}`);
    else if (/\.(pdf|docx|xlsx?)$/i.test(f.name) && f.size < 30_000_000) {
      try {
        let txt = '', how = '抽出的文字';
        if (/\.xlsx?$/i.test(f.name)) { const XLSX = await import('xlsx'); const wb = XLSX.read(buf, { type: 'buffer' }); txt = wb.SheetNames.slice(0, 6).map(n => `#### ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n'); }
        else { const { extractText } = await import('./samples'); txt = await extractText(buf, f.name).catch(() => ''); }
        if (txt.replace(/\s/g, '').length < 80 && /\.pdf$/i.test(f.name)) { txt = await readPdfVisually(buf, f.name); how = 'PDF 是图片型，AI 看原件转写的'; }
        parts.push(txt.trim() ? `${head}（${how}，以原文件为准）\n${txt.slice(0, 12000)}` : `${head}（${Math.round(f.size / 1024)} KB，没读出内容，按交付说明评）`);
      } catch { parts.push(`${head}（${Math.round(f.size / 1024)} KB，解析失败，按交付说明评）`); }
    } else if (/\.(png|jpe?g|webp|gif)$/i.test(f.name) && f.size < 10_000_000) {
      const d = await describeImage(buf, /\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : /\.gif$/i.test(f.name) ? 'image/gif' : 'image/jpeg', f.name, '这是候选人做一道考核任务时交上来的一张图（作品 / 截图 / 图表 / 画布 / 设计稿）。请用中文写 150–400 字：画的是什么、里面的文字和数字、结构和连线关系、能看出的完成度和明显的问题。只描述看到的，不要打分。').catch(() => '');
      parts.push(d ? `${head}（看图说明，以原图为准）\n${d}` : `${head}（图片，没读出来）`);
    } else parts.push(`${head}（${Math.round(f.size / 1024)} KB，这种格式读不了，按交付说明评）`);
  }
  return parts.join('\n\n');
}

/** 交付说明里贴的链接（在线文档 / 资料库 / 画布）：能直接读到正文的读进来；动态页面、要登录的只拿得到标题，如实写明（11-10 潜历：WorkBuddy 链接一点没读到） */
export async function readLinks(text: string, max = 4): Promise<string> {
  const urls = [...new Set((text.match(/https?:\/\/[^\s)）\]」"'<>]+/g) || []).filter(u => !/supabase\.co\/storage|aisimjob\.com|aidataoffice\.com/.test(u)))].slice(0, max);
  const parts: string[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Safari/537.36', Accept: 'text/html,application/pdf,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
      const type = r.headers.get('content-type') || '';
      if (/pdf/.test(type)) { const { readPdfVisually } = await import('./vision'); const { extractText } = await import('./samples'); const buf = Buffer.from(await r.arrayBuffer()); let t = await extractText(buf, 'link.pdf').catch(() => ''); if (t.replace(/\s/g, '').length < 80) t = await readPdfVisually(buf); parts.push(`### 链接 ${u}（PDF）\n${t.slice(0, 8000) || '（没读出内容）'}`); continue; }
      const html = (await r.text()).slice(0, 2_000_000);
      const title = (/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html) || /<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1]?.trim() || '';
      const body = html.replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
      parts.push(!r.ok ? `### 链接 ${u}（打不开：${r.status}，可能要登录；内容以候选人上传的文件和截图为准）`
        : body.replace(/\s/g, '').length >= 300 ? `### 链接 ${u}${title ? `《${title}》` : ''}（平台读到的正文，以原页面为准）\n${body.slice(0, 8000)}`
        : `### 链接 ${u}${title ? `《${title}》` : ''}（动态页面或要登录，平台只读到标题，读不到正文；内容以上传的文件和截图为准）`);
    } catch { parts.push(`### 链接 ${u}（打不开，内容以上传的文件和截图为准）`); }
  }
  return parts.join('\n\n');
}
