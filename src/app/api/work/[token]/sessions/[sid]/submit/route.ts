import { refreshSignals } from '@/lib/work/question-bank';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { buildReport, ensureAiPolicy } from '@/lib/work/grader';
import { planSegments } from '@/lib/work/audit';
import { describeFrames, framesFromRecording, framesFromShots, listShots, readTextFiles } from '@/lib/work/recording';
import { describeImage } from '@/lib/work/vision';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 交卷：{ deliverable, events? } → 结果（rubric 逐条）+ 过程（事件流）+ 和 AI 基线比 → 报告 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('*').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: '链接不可用' }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('*').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  if (s.submitted_at && s.report) return s.report.auditing ? NextResponse.json({ ok: true, staged: true, total: s.report.total }) : NextResponse.json({ ok: true, report: s.report, score: s.score });
  const body = await req.json().catch(() => ({}));
  const open = s.participant?.mode === 'open', plugin = s.participant?.mode === 'plugin';
  let deliverable = String(body.deliverable ?? s.deliverable ?? '').slice(0, 60000);
  const tsec = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  let events: any[] = [...(s.events || []), ...((Array.isArray(body.events) ? body.events : []).slice(0, 500))];
  // 开放模式：交付 = 交付说明 + 能读的文件；过程 = 录屏抽帧看图
  let recording: { url: string; duration: number; summary: string; frames: number; shots?: number; gallery?: { t: number; url: string }[] } | null = null;
  const thin = <T,>(a: T[], n: number) => (a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.round(i * (a.length - 1) / (n - 1))]));
  if (open) {
    const files = events.filter(e => e.type === 'file' && e.url).map(e => ({ name: e.name, url: e.url, size: e.size || 0 }));
    const rec = [...events].reverse().find(e => e.type === 'recording' && e.url);
    const shots = await listShots(sid);   // 11-05 起：整屏定时截图（老作答是整段录屏）
    if (!rec && !shots.length) return NextResponse.json({ ok: false, error: '还没有屏幕记录：开放模式要先点「开始记录」再交卷' }, { status: 400 });
    if (deliverable.trim().length < 30) return NextResponse.json({ ok: false, error: '交付说明太短了：把结论、关键数字、口径和假设写清楚' }, { status: 400 });
    deliverable = `## 交付说明\n${deliverable}\n\n## 交付文件\n${files.length ? await readTextFiles(files) : '（没有上传文件）'}`;
    try {
      const frames = await withCost({ tool_name: 'work', task_name: 'Grade · 录屏看图', stage: 'use' }, async () => { const fr = shots.length ? await framesFromShots(shots) : await framesFromRecording(rec!.url); const d = await describeFrames(fr, t.task?.brief || '', t.company_name); return { ...d, n: fr.length }; });
      events = [...events, ...frames.events].sort((a, b) => a.t - b.t);
      recording = shots.length ? { url: '', duration: shots[shots.length - 1].t - shots[0].t, summary: frames.summary, frames: frames.n, shots: shots.length, gallery: thin(shots, 120) } : { url: rec!.url, duration: rec!.duration || 0, summary: frames.summary, frames: frames.n };
    } catch (e) { console.warn('[work] 录屏分析失败：', String((e as any)?.message).slice(0, 160)); recording = shots.length ? { url: '', duration: shots[shots.length - 1].t - shots[0].t, summary: '（截图看图失败，过程只按上传 / 下载事件评）', frames: 0, shots: shots.length, gallery: thin(shots, 120) } : { url: rec!.url, duration: rec!.duration || 0, summary: '（录屏分析失败，过程只按上传 / 下载事件评）', frames: 0 }; }
  } else if (plugin) {
    // 真活插件：交付 = 交付说明 + 链接；到时间自动收卷时没写也照收（按未交付评）
    if (deliverable.trim().length < 20) { if (!body.auto) return NextResponse.json({ ok: false, error: '交付说明太短了：贴上交付物链接，写清结论和假设' }, { status: 400 }); deliverable = `（时间到，自动交卷；候选人没写完交付说明）\n${deliverable}`; }
  } else if (deliverable.trim().length < 50) return NextResponse.json({ ok: false, error: '交付物太短了，至少写点东西' }, { status: 400 });
  // 工作台作答的附件（11-05）：文件抽文字、图片看图写说明，接在交付物后面给评卷（以原文件为准）
  if (!open) {
    const files = events.filter(e => e.type === 'file' && e.url);
    if (files.length) {
      const docs = files.filter(f => !/\.(png|jpe?g|webp|gif)$/i.test(f.name)), imgs = files.filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f.name)).slice(0, 8);
      const parts: string[] = [];
      if (docs.length) parts.push(await readTextFiles(docs.map(f => ({ name: f.name, url: f.url, size: f.size || 0 }))));
      for (const f of imgs) {
        try {
          const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
          const d = await describeImage(buf, /\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : /\.gif$/i.test(f.name) ? 'image/gif' : 'image/jpeg', f.name, '这是候选人做一道考核任务时交上来的一张图（作品 / 截图 / 图表 / 设计稿）。请用中文写 150–300 字：画的是什么、风格和构图、里面的文字和数字、能看出的完成度和明显的问题。只描述看到的，不要打分。');
          parts.push(`### 图片 [${f.name}](${f.url})（看图说明，以原图为准）\n${d || '（没读出来）'}`);
        } catch { parts.push(`### 图片 [${f.name}](${f.url})（没读出来）`); }
      }
      if (parts.length) deliverable = `${deliverable}\n\n## 附件内容（平台读出的文字 / 看图说明，以原文件为准）\n${parts.join('\n\n')}`.slice(0, 60000);
    }
  }
  // 插件模式的最后一问（选填）存在 participant 里，交卷时转成事件
  if (s.participant?.next_step?.trim() && !events.some(e => e.type === 'next_step')) events = [...events, { t: tsec, type: 'next_step', text: String(s.participant.next_step).trim().slice(0, 1000) }];
  events = [...events, { t: tsec, type: 'submit', chars: deliverable.length }];
  await db.from('work_sessions').update({ deliverable, events, submitted_at: new Date().toISOString() }).eq('id', sid);
  // 默认「AI 审计中」渐进式：先存一份半成品 report（auditing），前端一段一段调 /audit 推进；{ sync: true } 才一次出完（脚本用）
  if (!body.sync) {
    const segments = planSegments(events);
    const partial = { auditing: true, stage: 0, total: segments.length, segments, audit: [], mode: open ? 'open' : plugin ? 'plugin' : 'bench', ...(recording ? { recording } : {}), started_at: new Date().toISOString() };
    await db.from('work_sessions').update({ report: partial, score: null }).eq('id', sid);
    return NextResponse.json({ ok: true, staged: true, total: segments.length });
  }
  try {
    const base = await withCost({ tool_name: 'work', task_name: 'Grade · 报告', stage: 'use' }, async () =>
      buildReport({ env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric }, t.baseline, deliverable, events, s.ai_chat || [], t.company_name, undefined, await ensureAiPolicy(t)));
    const report = { ...base, ...(recording ? { recording } : {}), mode: open ? 'open' : plugin ? 'plugin' : 'bench' };
    await db.from('work_sessions').update({ report, score: report.result.total }).eq('id', sid); refreshSignals(t.id);
    return NextResponse.json({ ok: true, report, score: report.result.total });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
