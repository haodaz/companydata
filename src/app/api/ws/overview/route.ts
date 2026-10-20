import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { getOrg } from '@/lib/ws/org';
import { companyJobs } from '@/lib/work/generator';

export const runtime = 'nodejs';

/** 侧栏几个功能页的数据：岗位 / 真活 / 职业空间 / 候选人。只认本企业（org_id、org.company_id） */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const org = await getOrg(user, req.nextUrl.searchParams.get('org')).catch(() => null); if (!org) return NextResponse.json({ ok: false, error: '没有企业' }, { status: 404 });
  const [{ data: tasks }, { data: spaces }, jobs] = await Promise.all([
    db.from('work_tasks').select('id, share_token, owner_key, role, task, baseline, status, created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(100),
    db.from('skill_tasks').select('id, title, profile, created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(100),
    org.company_id ? companyJobs(org.company_id, 200) : Promise.resolve([]),
  ]);
  const ids = (tasks || []).map(t => t.id);
  const { data: ss } = ids.length ? await db.from('work_sessions').select('id, task_id, participant, started_at, submitted_at, score, report').in('task_id', ids).order('started_at', { ascending: false }) : { data: [] as any[] };
  const byTask = new Map((tasks || []).map(t => [t.id, t]));
  const people = (ss || []).map(x => ({ id: x.id, name: x.participant?.name, contact: x.participant?.contact, task_id: x.task_id, task: byTask.get(x.task_id)?.task?.title, role: byTask.get(x.task_id)?.role, token: byTask.get(x.task_id)?.share_token, owner_key: byTask.get(x.task_id)?.owner_key, started_at: x.started_at, submitted: !!x.submitted_at, auditing: !!x.report?.auditing, score: x.score, summary: (x.report?.result?.summary || '').slice(0, 160) }));
  const cnt: Record<string, { n: number; done: number }> = {}; for (const p of people) { const c = cnt[p.task_id] ||= { n: 0, done: 0 }; c.n++; if (p.submitted) c.done++; }
  // 岗位 = 岗位库里本企业的 + 出过真活 / 建过空间用到的
  const roles = new Map<string, { title: string; function?: string; city?: string; work: number; spaces: number; from_library: boolean }>();
  for (const j of jobs) roles.set(j.title, { title: j.title, function: j.job_function, city: j.city, work: 0, spaces: 0, from_library: true });
  for (const t of tasks || []) { const r = roles.get(t.role) || { title: t.role, work: 0, spaces: 0, from_library: false }; r.work++; roles.set(t.role, r); }
  for (const sp of spaces || []) { const k = sp.profile?.role || sp.title; const r = roles.get(k) || { title: k, work: 0, spaces: 0, from_library: false }; r.spaces++; roles.set(k, r); }
  return NextResponse.json({ ok: true, org,
    roles: [...roles.values()].sort((a, b) => (b.work + b.spaces) - (a.work + a.spaces)),
    work: (tasks || []).map(t => ({ id: t.id, token: t.share_token, owner_key: t.owner_key, title: t.task?.title, role: t.role, env: t.task?.env?.type, baseline: t.baseline?.result?.total ?? null, status: t.status, created_at: t.created_at, joined: cnt[t.id]?.n || 0, submitted: cnt[t.id]?.done || 0 })),
    spaces: (spaces || []).map(x => ({ id: x.id, title: x.title, role: x.profile?.role, created_at: x.created_at })),
    people });
}
