import { refreshSignals } from '@/lib/work/question-bank';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { buildReport } from '@/lib/work/grader';
import { planSegments } from '@/lib/work/audit';
import { describeFrames, framesFromRecording, readTextFiles } from '@/lib/work/recording';
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
  let recording: { url: string; duration: number; summary: string; frames: number } | null = null;
  if (open) {
    const files = events.filter(e => e.type === 'file' && e.url).map(e => ({ name: e.name, url: e.url, size: e.size || 0 }));
    const rec = [...events].reverse().find(e => e.type === 'recording' && e.url);
    if (!rec) return NextResponse.json({ ok: false, error: '还没有录屏：开放模式要先录屏再交卷' }, { status: 400 });
    if (deliverable.trim().length < 30) return NextResponse.json({ ok: false, error: '交付说明太短了：把结论、关键数字、口径和假设写清楚' }, { status: 400 });
    deliverable = `## 交付说明\n${deliverable}\n\n## 交付文件\n${files.length ? await readTextFiles(files) : '（没有上传文件）'}`;
    try {
      const frames = await withCost({ tool_name: 'work', task_name: 'Grade · 录屏看图', stage: 'use' }, async () => { const fr = await framesFromRecording(rec.url); const d = await describeFrames(fr, t.task?.brief || '', t.company_name); return { ...d, n: fr.length }; });
      events = [...events, ...frames.events].sort((a, b) => a.t - b.t);
      recording = { url: rec.url, duration: rec.duration || 0, summary: frames.summary, frames: frames.n };
    } catch (e) { console.warn('[work] 录屏分析失败：', String((e as any)?.message).slice(0, 160)); recording = { url: rec.url, duration: rec.duration || 0, summary: '（录屏分析失败，过程只按上传 / 下载事件评）', frames: 0 }; }
  } else if (plugin) {
    // 真活插件：交付 = 交付说明 + 链接；到时间自动收卷时没写也照收（按未交付评）
    if (deliverable.trim().length < 20) { if (!body.auto) return NextResponse.json({ ok: false, error: '交付说明太短了：贴上交付物链接，写清结论和假设' }, { status: 400 }); deliverable = `（时间到，自动交卷；候选人没写完交付说明）\n${deliverable}`; }
  } else if (deliverable.trim().length < 50) return NextResponse.json({ ok: false, error: '交付物太短了，至少写点东西' }, { status: 400 });
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
    const base = await withCost({ tool_name: 'work', task_name: 'Grade · 报告', stage: 'use' }, () =>
      buildReport({ env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric }, t.baseline, deliverable, events, s.ai_chat || [], t.company_name));
    const report = { ...base, ...(recording ? { recording } : {}), mode: open ? 'open' : plugin ? 'plugin' : 'bench' };
    await db.from('work_sessions').update({ report, score: report.result.total }).eq('id', sid); refreshSignals(t.id);
    return NextResponse.json({ ok: true, report, score: report.result.total });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
