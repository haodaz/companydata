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

/** 逐帧看图 → 事件流（每帧一条 screen 事件：软件 / 动作 / 看到的内容），另给一段总体描述 */
export async function describeFrames(frames: { t: number; jpeg: Buffer }[], taskBrief: string, institution?: string): Promise<{ events: WorkEvent[]; summary: string }> {
  if (!frames.length) return { events: [], summary: '' };
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const content: any[] = [{ type: 'text', text: `下面是一位候选人做一道真活时的录屏抽帧（每帧标了时间）。任务：${taskBrief.slice(0, 500)}\n请逐帧描述：用的是什么软件（Excel / CAD / IDE / 浏览器 / 聊天 AI…）、在做什么动作、屏幕上能看出他在看材料、问 AI、还是在写交付物；有没有整段粘贴、长时间停顿、切换多个工具交叉验证这类值得记的行为。只写看得见的，看不清就写「看不清」。\n只返回 JSON：{ "frames": [ { "t": 秒, "app": "", "action": "", "note": "" } ], "summary": "三句话总述工作方式" }` }];
  for (const f of frames) { content.push({ type: 'text', text: `[${fmt(f.t)}]` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.jpeg.toString('base64') } }); }
  const res = await client.messages.create({ model: VISION_MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] });
  const u = res.usage;
  await logTokenUsage({ tool_name: 'work', task_name: 'Grade · 录屏看图', institution: institution || '', model_id: VISION_MODEL, usageMetadata: { promptTokenCount: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0), candidatesTokenCount: u.output_tokens || 0, totalTokenCount: (u.input_tokens || 0) + (u.output_tokens || 0) }, stage: 'use' } as any).catch(() => {});
  const text = res.content.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map(b => b.text).join('\n');
  let p: any = null; try { p = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { p = null; }
  const events: WorkEvent[] = (Array.isArray(p?.frames) ? p.frames : []).map((f: any) => ({ t: Number(f.t) || 0, type: 'screen', note: [f.app, f.action, f.note].filter(Boolean).join(' · ').slice(0, 200) }));
  return { events, summary: String(p?.summary || text).slice(0, 600) };
}

/** 文本类交付文件直接读进交付物（其余只记文件名） */
export async function readTextFiles(files: { name: string; url: string; size: number }[]): Promise<string> {
  const parts: string[] = [];
  for (const f of files) {
    if (/\.(txt|md|csv|json|tsv)$/i.test(f.name) && f.size < 400_000) {
      try { const txt = await (await fetch(f.url)).text(); parts.push(`### 文件 ${f.name}\n${txt.slice(0, 12000)}`); } catch { parts.push(`### 文件 ${f.name}（读取失败）`); }
    } else parts.push(`### 文件 ${f.name}（${Math.round(f.size / 1024)} KB，未解析，按交付说明评）`);
  }
  return parts.join('\n\n');
}
