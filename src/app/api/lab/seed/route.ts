import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { SEED_CASES } from '@/lib/skill-lab-seed';
import { SEED_SIMS } from '@/lib/skill-lab-seed-sims';
import { traceMatch, traceToText } from '@/lib/skill-sim';
import { labError } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 删掉某个预置空间（及其作答、账本、技能）。 */
async function clearCase(slug: string) {
  const { data: skill } = await supabaseAdmin.from('skills').select('id').eq('slug', slug).maybeSingle();
  if (!skill) return;
  const { error } = await supabaseAdmin.from('skill_tasks').delete().eq('skill_id', skill.id); // 作答 / 账本随空间级联删除
  if (error) throw error;
  await supabaseAdmin.from('skills').delete().eq('id', skill.id);
}

/** 可以构建技能空间的 JD（目前就是这两家公司的两个岗位），以及各自是否已经建好 */
export async function GET() {
  try {
    const { data: built, error } = await supabaseAdmin.from('skill_tasks').select('id, skill:skills!inner(slug)').in('skill.slug', SEED_CASES.map(c => c.skill.slug));
    if (error) throw error;
    const bySlug = new Map((built || []).map((t: any) => [t.skill.slug, t.id]));
    return NextResponse.json({
      ok: true,
      jds: SEED_CASES.map(c => ({
        slug: c.skill.slug, company: c.jd.company, company_en: c.jd.company_en, title: c.jd.title, job_req_id: c.jd.job_req_id,
        location: c.jd.location, program_name: c.jd.program_name, url: c.jd.url, responsibilities: c.jd.responsibilities, space_id: bySlug.get(c.skill.slug) || null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

/** 构建空间：body { slug }。已经建好的直接返回；否则把这条 JD 对应的空间完整建出来。 */
export async function POST(req: Request) {
  try {
    const { slug } = await req.json().catch(() => ({}));
    const idx = SEED_CASES.findIndex(c => c.skill.slug === slug);
    if (idx < 0) return NextResponse.json({ ok: false, error: '未知的 JD' }, { status: 400 });
    const c = SEED_CASES[idx];
    const { sim, expertTrace, traces, why } = SEED_SIMS[idx];

    const { data: existing } = await supabaseAdmin.from('skill_tasks').select('id, skill:skills!inner(slug)').eq('skill.slug', slug).limit(1);
    if (existing?.length) return NextResponse.json({ ok: true, id: existing[0].id, existed: true });
    await clearCase(slug);

    {
      // 预置示范不写岗位库、也不建企业：JD 完整存在空间自己的 jd_snapshot 里就够了。
      // 以前这里把演示 JD 当真实岗位写进 jobs、顺手把「住院医师规范化培训基地」这种建成企业，
      // 混进了数据部门的校招岗位库，「原文」只是招聘站首页、对不上具体岗位（2026-10-08 反馈）。

      // 2. 技能
      const { data: skill, error: skillErr } = await supabaseAdmin.from('skills').upsert({ ...c.skill, expert_trace: { ...expertTrace, _why: why }, source: 'seed', is_demo: true }, { onConflict: 'slug' }).select('id').single();
      if (skillErr) throw skillErr;

      // 3. 技能空间
      const { data: task, error: taskErr } = await supabaseAdmin.from('skill_tasks').insert({
        ...c.task, sim, skill_id: skill.id, job_id: null, is_demo: true, created_by: 'demo',
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

      return NextResponse.json({ ok: true, id: task.id, existed: false });
    }
  } catch (e: any) {
    console.error('[Lab/seed]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
