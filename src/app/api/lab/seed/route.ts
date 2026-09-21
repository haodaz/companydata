import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveOrCreateCompany } from '@/lib/company-match';
import { jobCompleteness } from '@/lib/job-fields';
import { SEED_CASES } from '@/lib/skill-lab-seed';
import { SEED_SIMS } from '@/lib/skill-lab-seed-sims';
import { traceMatch, traceToText } from '@/lib/skill-sim';
import { labError } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function clearDemo() {
  // 顺序：账本 → 作答 → 空间 → 技能（岗位库里的两条真实 JD 是真数据，保留）
  for (const t of ['skill_invocations', 'skill_submissions', 'skill_tasks', 'skills']) {
    const { error } = await supabaseAdmin.from(t).delete().eq('is_demo', true);
    if (error) throw error;
  }
}

/** 一键灌入两个演示 case（可重复执行：先清掉旧的演示数据再灌） */
export async function POST() {
  try {
    await clearDemo();
    const summary: string[] = [];

    for (const [idx, c] of SEED_CASES.entries()) {
      const { sim, expertTrace, traces, why } = SEED_SIMS[idx];
      // 1. 真实 JD → 企业库 + 岗位库
      const companyId = await resolveOrCreateCompany(c.jd.company);
      if (companyId) {
        const { data: co } = await supabaseAdmin.from('companies').select('segment, industry, name_en').eq('id', companyId).single();
        const fill: Record<string, string> = {};
        if (!co?.segment) fill.segment = c.jd.segment;
        if (!co?.industry) fill.industry = c.jd.industry;
        if (!co?.name_en) fill.name_en = c.jd.company_en;
        if (Object.keys(fill).length) await supabaseAdmin.from('companies').update(fill).eq('id', companyId);
      }
      const jobRow: Record<string, any> = {
        dedupe_key: c.jd.url.toLowerCase(), company_id: companyId, company: c.jd.company,
        title: c.jd.title, job_req_id: c.jd.job_req_id, job_type: c.jd.job_type, department: c.jd.department, job_function: c.jd.job_function,
        program_name: c.jd.program_name, graduation_year: c.jd.graduation_year, location: c.jd.location, country: c.jd.country,
        responsibilities: c.jd.responsibilities, qualifications: c.jd.qualifications, recruit_process: c.jd.recruit_process,
        job_url: c.jd.url, source_url: c.jd.source_url, status: 'open', last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      jobRow.completeness_score = jobCompleteness(jobRow);
      const { data: job, error: jobErr } = await supabaseAdmin.from('jobs').upsert(jobRow, { onConflict: 'dedupe_key' }).select('id').single();
      if (jobErr) throw jobErr;

      // 2. 技能
      const { data: skill, error: skillErr } = await supabaseAdmin.from('skills').upsert({ ...c.skill, expert_trace: { ...expertTrace, _why: why }, source: 'seed', is_demo: true }, { onConflict: 'slug' }).select('id').single();
      if (skillErr) throw skillErr;

      // 3. 技能空间
      const { data: task, error: taskErr } = await supabaseAdmin.from('skill_tasks').insert({
        ...c.task, sim, skill_id: skill.id, job_id: job.id, is_demo: true, created_by: 'demo',
        jd_snapshot: { company: c.jd.company, title: c.jd.title, job_req_id: c.jd.job_req_id, location: c.jd.location, responsibilities: c.jd.responsibilities, qualifications: c.jd.qualifications, url: c.jd.url, fetched_at: c.jd.fetched_at },
      }).select('id').single();
      if (taskErr) throw taskErr;

      // 4. 作答
      const subIds = new Map<string, string>();
      for (const s of c.submissions) {
        const { with_skill, ...rest } = s;
        const trace = { ...(traces[s.candidate_name] || {}), final: s.answer };
        const { data: sub, error } = await supabaseAdmin.from('skill_submissions').insert({
          ...rest, answer: traceToText(sim, trace), trace, match: traceMatch(sim, trace, expertTrace), task_id: task.id, with_skill_id: with_skill ? skill.id : null, graded_with_skill_id: skill.id, graded_by_model: 'demo', is_demo: true,
        }).select('id').single();
        if (error) throw error;
        subIds.set(s.candidate_name, sub.id);
      }

      // 5. 账本
      const { error: invErr } = await supabaseAdmin.from('skill_invocations').insert(c.invocations.map(({ submission, ...inv }) => ({
        ...inv, skill_id: skill.id, task_id: task.id, submission_id: submission ? subIds.get(submission) || null : null, is_demo: true,
      })));
      if (invErr) throw invErr;

      summary.push(`${c.jd.company} · ${c.jd.title}`);
    }
    return NextResponse.json({ ok: true, seeded: summary });
  } catch (e: any) {
    console.error('[Lab/seed]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

/** 清除演示数据（只删 is_demo = true 的行） */
export async function DELETE() {
  try {
    await clearDemo();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
