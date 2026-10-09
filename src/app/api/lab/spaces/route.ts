import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { assignNova } from '@/lib/lab-nova';
import { buildSpaceFromJd } from '@/lib/agents/skill-lab-build';
import { structureCareer } from '@/lib/agents/career';
import { labError, sortByDay } from '@/lib/skill-lab-server';
import { trackDemand } from '@/lib/flywheel/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 构建进度（进程内；开发环境足够。页面按 buildId 轮询） */
const builds = new Map<string, { phase: string; detail?: string; done: boolean; id?: string; error?: string; at: number }>();
const setBuild = (id: string, patch: Partial<{ phase: string; detail?: string; done: boolean; id?: string; error?: string }>) => { if (!id) return; builds.set(id, { phase: '', done: false, ...(builds.get(id) || {}), ...patch, at: Date.now() }); for (const [k, v] of builds) if (Date.now() - v.at > 30 * 60_000) builds.delete(k); };

/** 技能空间列表（每个公司岗位一个）；?build=<id> 查构建进度 */
export async function GET(req: Request) {
  try {
    const buildId = new URL(req.url).searchParams.get('build');
    if (buildId) return NextResponse.json({ ok: true, build: builds.get(buildId) || null });
    const { data: spaces, error } = await supabaseAdmin
      .from('skill_tasks')
      .select('id, title, profile, jd_snapshot, jd_breakdown, time_limit_min, is_demo, created_at, job_id, sim, skill:skills(id, name, domain, kind, summary, expert_name, expert_location, expert_note, distilled_at, card, interview, source)')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const ids = (spaces || []).map(s => s.id);
    const [subs, invs, chs] = ids.length ? await Promise.all([
      supabaseAdmin.from('skill_submissions').select('task_id, candidate_type, score').in('task_id', ids),
      supabaseAdmin.from('skill_invocations').select('task_id, kind, volume, actor_location').in('task_id', ids),
      // 章节概况（体验馆显示「一天 N 章」；迁移 015 没跑时这里报错，按没有章节处理）
      supabaseAdmin.from('lab_chapters').select('task_id, slot, title, kind, status').in('task_id', ids).then(r => r, () => ({ data: [] as any[] })),
    ]) : [{ data: [] }, { data: [] }, { data: [] as any[] }];

    const data = (spaces || []).map(s => {
      const ss = (subs.data || []).filter(x => x.task_id === s.id);
      const ii = (invs.data || []).filter(x => x.task_id === s.id);
      const sim = s.sim as any;
      return {
        ...s, sim: undefined,
        features: { immersive: !!sim?.art?.cover, bench: !!sim?.steps?.some((x: any) => x.type === 'bench'), steps: sim?.steps?.length || 0 },
        cover: sim?.art?.cover || Object.values(sim?.art?.scenes || {})[0] || null,
        chapters: (() => {
          const cc = ((chs as any).data || []).filter((c: any) => c.task_id === s.id);
          // 没有章节表（或老空间没迁）就看 sim：有步骤 = 一章已发布
          if (!cc.length) return { total: sim?.steps?.length ? 1 : 0, published: sim?.steps?.length ? 1 : 0, slots: [] as string[] };
          const pub = cc.filter((c: any) => c.status === 'published');
          return { total: cc.length, published: pub.length, slots: sortByDay(pub.map((c: any, i: number) => ({ ...c, seq: i }))).map((c: any) => c.slot).filter(Boolean) };
        })(),
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
    // 全局汇总：首屏那句「此刻 N 位数字人在线」用的就是这些真数
    const expertPlaces = [...new Set((spaces || []).map((s: any) => (Array.isArray(s.skill) ? s.skill[0] : s.skill))
      .filter((k: any) => k && k.source !== 'jd-draft' && k.expert_location).map((k: any) => k.expert_location as string))];
    const totals = {
      spaces: data.length,
      experts: (spaces || []).filter((s: any) => { const k = Array.isArray(s.skill) ? s.skill[0] : s.skill; return k && k.source !== 'jd-draft'; }).length,
      expertPlaces,
      places: new Set((invs.data || []).map((x: any) => x.actor_location).filter(Boolean)).size,
      served: (invs.data || []).reduce((a: number, x: any) => a + (x.volume || 1), 0),
      faces: data.map((s: any) => s.profile?.avatar).filter(Boolean).slice(0, 12),
    };
    return NextResponse.json({ ok: true, data, totals });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

/**
 * 新建技能空间：选岗位库里的一条 JD → 岗位 AI 自己生成 技能集草案 + 故事线 + 虚拟工位 + 场景美术。
 * body { jobId, model, createdBy, buildId }；构建约 2–4 分钟，进度用 GET ?build=buildId 轮询。
 * 或 body { profession }：职业探索——先把职业结构化成典型岗位 + 生涯地图，再走同一条流水线（面向高中生 / 大学生）。
 */
/** 构建完给前端的成果小结：刚才这两分钟，岗位 AI 到底做出了什么 */
function summarize(built: any) {
  const sim = built.task?.sim || {};
  const steps = Array.isArray(sim.steps) ? sim.steps : [];
  const bench = steps.find((s: any) => s.type === 'bench')?.bench;
  const layers = bench?.scene?.layers || [];
  return {
    title: sim.title || '',
    steps: steps.length,
    kinds: [...new Set(steps.map((s: any) => s.type))],
    bench: bench ? { name: bench.name, controls: bench.controls?.length || 0, goals: bench.goals?.length || 0, rules: bench.rules?.length || 0, track: layers.some((l: any) => l.kind === 'pour' || l.kind === 'seam') } : null,
    rules: built.skill?.card?.rules?.length || 0,
    cardSteps: built.skill?.card?.steps?.length || 0,
    npcs: Object.keys(sim.art?.npcs || {}).length,
    scenes: new Set(Object.values(sim.art?.scenes || {})).size,
  };
}

const CAREER_HINT = '这是面向高中生 / 大学生的「职业探索空间」，不是招聘考核：任务要让一个完全没入行的人也能上手体验这个职业最有代表性的一天，材料自解释、术语随手解释，难度比校招题降一档；故事线要有带教的前辈，让人感受到这个职业真实的工作节奏与判断方式。';
export async function POST(req: Request) {
  let buildId = '';
  try {
    const body = await req.json();
    const { jobId, model, createdBy } = body; buildId = String(body.buildId || '');
    const profession = String(body.profession || '').trim().slice(0, 40);

    if (profession) {
      // ── 职业探索：职业名 → 典型岗位 + 生涯地图 → 同一条流水线 ──
      trackDemand(req, { source: 'lab_space', query: profession, profession });
      setBuild(buildId, { phase: '结构化职业 · 推断典型岗位' });
      const { jd, career } = await structureCareer(profession, model || undefined);
      const built = await buildSpaceFromJd(jd, model || undefined, (phase, detail) => setBuild(buildId, { phase, detail }), { hint: CAREER_HINT });
      const { data: skill, error: skErr } = await supabaseAdmin.from('skills').insert({
        slug: `career-${Date.now().toString(36)}`, ...built.skill, interview: [],
        expert_name: '岗位 AI 自学草案', expert_title: '从职业公开知识推断 · 等待第一位从业者校正', expert_location: '云端', expert_note: '尚未有真人专家', tz_offset: 0,
        source: 'jd-draft', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: createdBy || '',
      }).select('id').single();
      if (skErr) throw skErr;
      const { data: created, error: insErr } = await supabaseAdmin.from('skill_tasks').insert({
        job_id: null, skill_id: skill.id,
        jd_snapshot: { ...jd, kind: 'career', career, fetched_at: new Date().toISOString().slice(0, 10) },
        ...built.task, created_by: createdBy || '',
      }).select('id').single();
      if (insErr) throw insErr;
      await assignNova(created.id).catch(e => console.warn('[Lab/spaces] 分编号失败', e?.message));
      setBuild(buildId, { phase: '完成', done: true, id: created.id });
      return NextResponse.json({ ok: true, id: created.id, benchAdded: built.benchAdded, artCount: built.artCount, artReused: built.artReused, benchNote: built.benchNote, summary: summarize(built) });
    }

    if (!jobId) return NextResponse.json({ ok: false, error: '请选择一个岗位或输入一个职业' }, { status: 400 });
    setBuild(buildId, { phase: '读取岗位 JD' });

    const { data: job, error } = await supabaseAdmin.from('jobs').select('id, institute_or_company_name, name, job_req_id, location, responsibilities, overview, link, source_url').eq('id', jobId).single();
    if (error) throw error;
    if (!job.responsibilities && !job.overview) return NextResponse.json({ ok: false, error: '这条岗位没有职责 / 要求正文，无法拆解。请选一条 JD 完整的岗位。' }, { status: 400 });

    const jd = { company: job.institute_or_company_name || '', title: job.name, responsibilities: job.responsibilities || '', qualifications: job.overview || '' };
    trackDemand(req, { source: 'lab_space', query: `${jd.company} ${jd.title}`.trim(), company_name: jd.company || null, profession: jd.title });
    const built = await buildSpaceFromJd(jd, model || undefined, (phase, detail) => setBuild(buildId, { phase, detail }));

    // 技能集草案：AI 自己推断的，挂成这个空间的技能，等真人专家来校正（专家蒸馏时会覆盖）
    const slug = `jd-${job.id}-${Date.now().toString(36)}`;
    const { data: skill, error: skErr } = await supabaseAdmin.from('skills').insert({
      slug, ...built.skill, interview: [],
      expert_name: '岗位 AI 自学草案', expert_title: '从 JD 与公开职业知识推断 · 等待第一位专家校正', expert_location: '云端', expert_note: '尚未有真人专家', tz_offset: 0,
      source: 'jd-draft', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: createdBy || '',
    }).select('id').single();
    if (skErr) throw skErr;

    const { data: created, error: insErr } = await supabaseAdmin.from('skill_tasks').insert({
      job_id: job.id, skill_id: skill.id,
      jd_snapshot: { ...jd, job_req_id: job.job_req_id, location: job.location, url: job.link || job.source_url },
      ...built.task,
      created_by: createdBy || '',
    }).select('id').single();
    if (insErr) throw insErr;
    await assignNova(created.id).catch(e => console.warn('[Lab/spaces] 分编号失败', e?.message));
    setBuild(buildId, { phase: '完成', done: true, id: created.id });
    return NextResponse.json({ ok: true, id: created.id, benchAdded: built.benchAdded, artCount: built.artCount, artReused: built.artReused, benchNote: built.benchNote, summary: summarize(built) });
  } catch (e: any) {
    console.error('[Lab/spaces] POST', e);
    setBuild(buildId, { done: true, error: e?.message || String(e) });
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
