import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateTask } from '@/lib/agents/skill-lab';
import { labError } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 技能空间列表（每个公司岗位一个） */
export async function GET() {
  try {
    const { data: spaces, error } = await supabaseAdmin
      .from('skill_tasks')
      .select('id, title, profile, jd_snapshot, jd_breakdown, time_limit_min, is_demo, created_at, job_id, skill:skills(id, name, domain, kind, summary, expert_name, expert_location, expert_note, distilled_at, card, interview)')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const ids = (spaces || []).map(s => s.id);
    const [subs, invs] = ids.length ? await Promise.all([
      supabaseAdmin.from('skill_submissions').select('task_id, candidate_type, score').in('task_id', ids),
      supabaseAdmin.from('skill_invocations').select('task_id, kind, volume, actor_location').in('task_id', ids),
    ]) : [{ data: [] }, { data: [] }];

    const data = (spaces || []).map(s => {
      const ss = (subs.data || []).filter(x => x.task_id === s.id);
      const ii = (invs.data || []).filter(x => x.task_id === s.id);
      return {
        ...s,
        stats: {
          rookies: ss.filter(x => x.candidate_type === 'human').length,
          ai_runs: ss.filter(x => x.candidate_type === 'ai').length,
          solved: ii.filter(x => x.kind === 'solve').length,
          invocations: ii.length,
          served: ii.reduce((a, x) => a + (x.volume || 1), 0),
          places: new Set(ii.map(x => x.actor_location).filter(Boolean)).size,
        },
      };
    });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

/** 新建技能空间：选岗位库里的一条 JD → 拆解 → 生成任务与评分标准 */
export async function POST(req: Request) {
  try {
    const { jobId, model, createdBy } = await req.json();
    if (!jobId) return NextResponse.json({ ok: false, error: '请选择一个岗位' }, { status: 400 });

    const { data: job, error } = await supabaseAdmin.from('jobs').select('id, company, title, job_req_id, location, responsibilities, qualifications, job_url, source_url').eq('id', jobId).single();
    if (error) throw error;
    if (!job.responsibilities && !job.qualifications) return NextResponse.json({ ok: false, error: '这条岗位没有职责 / 要求正文，无法拆解。请选一条 JD 完整的岗位。' }, { status: 400 });

    const jd = { company: job.company || '', title: job.title, responsibilities: job.responsibilities || '', qualifications: job.qualifications || '' };
    const task = await generateTask(jd, null, model || undefined);

    const { data: created, error: insErr } = await supabaseAdmin.from('skill_tasks').insert({
      job_id: job.id,
      jd_snapshot: { ...jd, job_req_id: job.job_req_id, location: job.location, url: job.job_url || job.source_url },
      ...task,
      created_by: createdBy || '',
    }).select('id').single();
    if (insErr) throw insErr;
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e: any) {
    console.error('[Lab/spaces] POST', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
