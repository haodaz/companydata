import { refreshSignals } from '@/lib/work/question-bank';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { buildReport, ensureAiPolicy } from '@/lib/work/grader';
import { auditSegment } from '@/lib/work/audit';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 「AI 审计中」：每调一次推进一段。report.auditing 期间：stage < total → 审第 stage 段、追加笔记；stage == total → 结果逐条 + 过程总评（带分段笔记）+ 和基线比 → 正式报告。
 * GET 只看当前进度（出题人那边刷新用）。两个请求同时推进同一段时，用 running_since 挡住重复跑。
 */
async function load(token: string, sid: string) {
  const { data: t } = await db.from('work_tasks').select('*').eq('share_token', token).maybeSingle();
  if (!t) return { err: '链接不可用' };
  const { data: s } = await db.from('work_sessions').select('*').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return { err: '没有这次作答' };
  return { t, s };
}
const view = (r: any) => ({ auditing: !!r?.auditing, stage: r?.stage || 0, total: r?.total || 0, audit: r?.audit || [], running: !!r?.running_since });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params; const { t, s, err } = await load(token, sid);
  if (err || !t) return NextResponse.json({ ok: false, error: err }, { status: 404 });
  if (!s.report) return NextResponse.json({ ok: false, error: '还没交卷' }, { status: 400 });
  return s.report.auditing ? NextResponse.json({ ok: true, done: false, ...view(s.report) }) : NextResponse.json({ ok: true, done: true, report: s.report, score: s.score });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params; const { t, s, err } = await load(token, sid);
  if (err || !t) return NextResponse.json({ ok: false, error: err }, { status: 404 });
  const r = s.report;
  if (!r) return NextResponse.json({ ok: false, error: '还没交卷' }, { status: 400 });
  if (!r.auditing) return NextResponse.json({ ok: true, done: true, report: r, score: s.score });
  // 有人正在推进这一段（3 分钟内）：不重复跑，回当前进度
  if (r.running_since && Date.now() - new Date(r.running_since).getTime() < 180_000) return NextResponse.json({ ok: true, done: false, ...view(r) });
  await db.from('work_sessions').update({ report: { ...r, running_since: new Date().toISOString() } }).eq('id', sid);
  const task = { env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric };
  const events = s.events || [], chat = s.ai_chat || [], deliverable = s.deliverable || '';
  try {
    if (r.stage < r.total) {
      const seg = await withCost({ tool_name: 'work', task_name: 'Grade · 分段审计', stage: 'use' }, () =>
        auditSegment(task, events, chat, r.segments[r.stage], r.stage, r.total, r.audit || [], { institution: t.company_name, deliverableHead: deliverable }));
      const next = { ...r, stage: r.stage + 1, audit: [...(r.audit || []), seg], running_since: null };
      await db.from('work_sessions').update({ report: next }).eq('id', sid);
      return NextResponse.json({ ok: true, done: false, ...view(next), latest: seg });
    }
    const base = await withCost({ tool_name: 'work', task_name: 'Grade · 报告', stage: 'use' }, async () => buildReport(task, t.baseline, deliverable, events, chat, t.company_name, r.audit || [], await ensureAiPolicy(t)));
    const report = { ...base, audit: r.audit || [], mode: r.mode, ...(r.recording ? { recording: r.recording } : {}) };
    await db.from('work_sessions').update({ report, score: report.result.total }).eq('id', sid); refreshSignals(t.id);
    return NextResponse.json({ ok: true, done: true, report, score: report.result.total });
  } catch (e: any) {
    await db.from('work_sessions').update({ report: { ...r, running_since: null, last_error: String(e?.message || e).slice(0, 200) } }).eq('id', sid);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
