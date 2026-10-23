/**
 * 百业学院教务（2026-10-23，迁移 046）：申请 → 学员 → 学籍（学员 × 课程）→ 毕业生 → 分配。
 *
 * 训练不从零开始：课程就是百业工厂的空间（章节 = 一个岗位一天的工序、工位、老师傅技能卡、教案），
 * 考核就是章节考（skill_submissions，candidate_type = ai）和真活（work_sessions）。这里只做「学籍」这层账：
 * 谁（哪个模型）上了哪门课、入学考多少、毕业考多少、过没过、派去了哪里。
 *
 * 毕业规则沿用百业证书的口径（lab-certificates）：课程里每一段（已发布章节）装技能后的最好成绩都 ≥ 60 才算毕业。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { MODEL_OPTIONS } from '@/lib/model-options';
import { PASS_SCORE } from '@/lib/lab-cert';
import { getSessionUser } from '@/lib/session';
import { searchCompanies } from '@/lib/work/generator';

export type StudentKind = 'platform' | 'customer';
export type EnrollmentStatus = 'enrolled' | 'training' | 'examining' | 'graduated' | 'remedial' | 'withdrawn';
export type PlacementKind = 'ws_org' | 'company' | 'demand';
export type PlacementStatus = 'proposed' | 'offered' | 'placed' | 'ended';

export const ENROLL_STATUS: Record<EnrollmentStatus, string> = { enrolled: '已录取', training: '实训中', examining: '考核中', graduated: '已毕业', remedial: '补训中', withdrawn: '已退学' };
export const PLACE_STATUS: Record<PlacementStatus, string> = { proposed: '拟派', offered: '已推荐', placed: '已上岗', ended: '已结束' };
export const PLACE_KIND: Record<PlacementKind, string> = { ws_org: '工作台机构', company: '企业库企业', demand: '培养需求单' };
export const APP_STATUS: Record<string, string> = { new: '新申请', contacted: '已联系', won: '已签约', closed: '已关闭', admitted: '已录取', training: '培养中', delivered: '已交付' };

const modelLabel = (id?: string | null) => MODEL_OPTIONS.find(m => m.id === id)?.label || id || '';
const pick = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
/** 老作答里模型记在 candidate_note 开头（「gemini-3.8-flash · 装配「xx」」）；更老的写「通用大模型 / 同一模型」，按评分模型兜底 */
export const modelOfSubmission = (s: { candidate_note?: string | null; graded_by_model?: string | null }) => {
  const m = String(s.candidate_note || '').split(' · ')[0].trim();
  return m && MODEL_OPTIONS.some(x => x.id === m) ? m : (s.graded_by_model || 'gemini-3.8-flash');
};

/** 教务是内部的事：登录且不是百业用户（数据 / 产品同事 + 管理员） */
export async function collegeStaff(req: Request) {
  const u = await getSessionUser(req).catch(() => null);
  if (!u || u.role === 'baiye_user') return null;
  return u;
}
const MIG = (e: any) => (/college_(students|enrollments|placements)|enrollment_id/.test(String(e?.message || '')) ? new Error('教务的表还没建：请先执行迁移 046_college_admin.sql') : e);

/* ───────────── 课程（= 百业空间） ───────────── */
export async function listCourses() {
  const [{ data: spaces }, { data: chs }, { data: ens }] = await Promise.all([
    db.from('skill_tasks').select('id, title, profile, jd_snapshot, is_demo, created_at, skill:skills(name, source, expert_name, expert_location)').order('created_at', { ascending: false }),
    db.from('lab_chapters').select('task_id, kind, status, lesson_at').eq('status', 'published'),
    db.from('college_enrollments').select('space_id, status').then(r => r, () => ({ data: [] as any[] })),
  ]);
  return (spaces || []).map((s: any) => {
    const p = s.profile || {}, jd = s.jd_snapshot || {}, sk: any = pick(s.skill);
    const mine = (chs || []).filter(c => c.task_id === s.id);
    const en = (ens || []).filter((e: any) => e.space_id === s.id);
    return {
      id: s.id, title: s.title, nova: p.name || '', role: p.role || jd.title || s.title, avatar: p.avatar || '', company: jd.company || '',
      research: jd.kind === 'research_post' || jd.kind === 'discipline',
      chapters: mine.length, assessments: mine.filter(c => c.kind === 'assessment').length, lessons: mine.filter(c => c.lesson_at).length,
      teacher: sk ? { expert: sk.source !== 'jd-draft', name: sk.source !== 'jd-draft' ? sk.expert_name : '', place: sk.expert_location || '' } : null,
      enrollments: en.length, graduates: en.filter((e: any) => e.status === 'graduated').length,
    };
  }).filter(c => c.chapters > 0);
}

/* ───────────── 学员（= 模型） ───────────── */
/** 平台自己的大模型都算在校学员：第一次打开学员管理时登记一遍（只建档，不花钱） */
export async function ensurePlatformStudents() {
  const { data, error } = await db.from('college_students').select('model_id').eq('kind', 'platform');
  if (error) throw MIG(error);
  const have = new Set((data || []).map(x => x.model_id));
  const rows = MODEL_OPTIONS.filter(m => !have.has(m.id)).map(m => ({ name: m.label, kind: 'platform', model_id: m.id, org: m.provider, created_by: 'system' }));
  if (rows.length) { const { error: e2 } = await db.from('college_students').insert(rows); if (e2) throw e2; }
}

export async function listStudents() {
  const [{ data: st, error }, { data: ens }] = await Promise.all([
    db.from('college_students').select('*').order('kind').order('created_at'),
    db.from('college_enrollments').select('student_id, status, final_score').then(r => r, () => ({ data: [] as any[] })),
  ]);
  if (error) throw MIG(error);
  return (st || []).map(s => {
    const mine = (ens || []).filter((e: any) => e.student_id === s.id);
    return { ...s, model_label: modelLabel(s.model_id), enrollments: mine.length, graduated: mine.filter((e: any) => e.status === 'graduated').length, active: mine.filter((e: any) => !['graduated', 'withdrawn'].includes(e.status)).length };
  });
}

export async function createStudent(input: Partial<{ name: string; kind: StudentKind; model_id: string; api_style: string; endpoint: string; org: string; contact: string; phone: string; email: string; application_id: string; note: string }>, by: string) {
  const name = String(input.name || '').trim(); if (!name) throw new Error('学员要有名字');
  const kind: StudentKind = input.kind === 'customer' ? 'customer' : 'platform';
  const model_id = input.model_id && MODEL_OPTIONS.some(m => m.id === input.model_id) ? input.model_id : null;
  if (kind === 'platform' && !model_id) throw new Error('平台学员要选一个模型');
  const row = { name, kind, model_id, api_style: input.api_style || null, endpoint: String(input.endpoint || '').replace(/[?#].*$/, '').slice(0, 300) || null, org: input.org || null, contact: input.contact || null, phone: input.phone || null, email: input.email || null, application_id: input.application_id || null, note: input.note || null, created_by: by };
  const { data, error } = await db.from('college_students').insert(row).select('*').single();
  if (error) throw MIG(error);
  return data;
}

/** 入学申请 → 录取为学员（客户模型；申请里写了商用大模型且名字对得上平台模型，就直接挂平台模型，能立刻考） */
export async function admitApplication(appId: string, by: string) {
  const { data: app, error } = await db.from('college_applications').select('*').eq('id', appId).single();
  if (error || !app) throw new Error('申请不存在');
  if (app.kind !== 'enroll') throw new Error('只有「申请模型入学」能录取为学员');
  const { data: exist } = await db.from('college_students').select('id').eq('application_id', appId).maybeSingle();
  if (exist) return exist;
  const p = app.payload || {};
  const guess = MODEL_OPTIONS.find(m => new RegExp(m.id.replace(/[.-]/g, '[.-]?'), 'i').test(app.title || '') || (app.title || '').toLowerCase().includes(m.label.toLowerCase()));
  const st = await createStudent({ name: app.title, kind: 'customer', model_id: guess?.id, api_style: p.api_style, endpoint: p.endpoint, org: app.org, contact: app.contact, phone: app.phone, email: app.email, application_id: appId, note: [p.target && `训练目标：${p.target}`, p.usage && `用在：${p.usage}`].filter(Boolean).join('\n') }, by);
  await db.from('college_applications').update({ status: 'admitted', updated_at: new Date().toISOString() }).eq('id', appId);
  return st;
}

/* ───────────── 学籍（学员 × 课程） ───────────── */
const ENROLL_SELECT = '*, student:college_students(id, name, kind, model_id, org), space:skill_tasks(id, title, profile, jd_snapshot)';
const shapeEnrollment = (e: any) => {
  const sp = pick<any>(e.space), st = pick<any>(e.student);
  const p = sp?.profile || {}, jd = sp?.jd_snapshot || {};
  return { ...e, space: undefined, student: undefined,
    student_name: st?.name || '', student_kind: st?.kind, model_id: st?.model_id || null, model_label: modelLabel(st?.model_id), student_org: st?.org || '',
    course: sp ? { id: sp.id, title: sp.title, role: p.role || jd.title || sp.title, nova: p.name || '', avatar: p.avatar || '', company: jd.company || '', research: jd.kind === 'research_post' || jd.kind === 'discipline' } : null,
    status_label: ENROLL_STATUS[e.status as EnrollmentStatus] || e.status };
};

export async function listEnrollments(filter: { student_id?: string; space_id?: string; status?: string } = {}) {
  let q = db.from('college_enrollments').select(ENROLL_SELECT).order('updated_at', { ascending: false }).limit(500);
  if (filter.student_id) q = q.eq('student_id', filter.student_id);
  if (filter.space_id) q = q.eq('space_id', filter.space_id);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q; if (error) throw MIG(error);
  const ids = (data || []).map(e => e.id);
  const { data: pl } = ids.length ? await db.from('college_placements').select('enrollment_id, status').in('enrollment_id', ids) : { data: [] as any[] };
  return (data || []).map(e => ({ ...shapeEnrollment(e), placements: (pl || []).filter((x: any) => x.enrollment_id === e.id).length, placed: (pl || []).filter((x: any) => x.enrollment_id === e.id && x.status === 'placed').length }));
}

export async function createEnrollment(studentId: string, spaceId: string, by: string, demandId?: string | null) {
  const { data: sp, error } = await db.from('skill_tasks').select('id, profile').eq('id', spaceId).single();
  if (error || !sp) throw new Error('课程（空间）不存在');
  const { data: exist } = await db.from('college_enrollments').select('id').eq('student_id', studentId).eq('space_id', spaceId).maybeSingle();
  if (exist) return exist;
  const row = { student_id: studentId, space_id: spaceId, nova_name: (sp.profile as any)?.name || null, demand_id: demandId || null, created_by: by };
  const { data, error: e2 } = await db.from('college_enrollments').insert(row).select('id').single();
  if (e2) throw MIG(e2);
  if (demandId) await db.from('college_applications').update({ status: 'training', updated_at: new Date().toISOString() }).eq('id', demandId).eq('status', 'new').then(() => {}, () => {});
  return data;
}

export interface ChapterRow { id: string; seq: number; slot: string | null; title: string; kind: string; bench: boolean; lesson: boolean; before: number | null; after: number | null; runs: number; passed: boolean; latest: { id: string; score: number | null; match: number | null; after: boolean; model: string; at: string }[] }
export interface WorkRow { id: string; task_id: string; title: string; role: string; company: string; score: number | null; baseline: number | null; at: string; summary: string }
export interface EnrollmentDetail { [k: string]: any; id: string; space_id: string; status: EnrollmentStatus; model_id: string | null; notebook: any; graduated_at: string | null; demand_id: string | null; chapters: ChapterRow[]; work: WorkRow[]; teacher: any; placements: any[]; lessons: { done: number; total: number } }

/** 一份学籍的全部：课程的每一章（入学考 / 毕业考最好成绩、几次）、真活考、教案覆盖、分配 */
export async function enrollmentDetail(id: string): Promise<EnrollmentDetail> {
  const { data: e, error } = await db.from('college_enrollments').select(ENROLL_SELECT).eq('id', id).single();
  if (error || !e) throw MIG(error || new Error('学籍不存在'));
  const en = shapeEnrollment(e);
  const [{ data: chs }, { data: subs }, { data: ws }, { data: pl }, { data: sp }] = await Promise.all([
    db.from('lab_chapters').select('id, seq, slot, title, kind, lesson_at, sim').eq('task_id', e.space_id).eq('status', 'published').order('seq'),
    db.from('skill_submissions').select('id, chapter_id, score, match, with_skill_id, candidate_note, graded_by_model, submitted_at').eq('enrollment_id', id).order('submitted_at', { ascending: false }),
    db.from('work_sessions').select('id, task_id, score, report, submitted_at, participant').eq('enrollment_id', id).order('created_at', { ascending: false }),
    db.from('college_placements').select('*').eq('enrollment_id', id).order('created_at', { ascending: false }),
    db.from('skill_tasks').select('skill:skills(id, name, source, expert_name, expert_location, card)').eq('id', e.space_id).single(),
  ]);
  const skill: any = pick((sp as any)?.skill);
  const chapters: ChapterRow[] = (chs || []).map((c: any, i: number) => {
    // 第 1 章的老作答没记章节编号：算到第一章头上
    const mine = (subs || []).filter(s => s.chapter_id === c.id || (!s.chapter_id && i === 0));
    const best = (xs: any[]) => (xs.length ? Math.max(...xs.map(x => Number(x.score) || 0)) : null);
    const before = mine.filter(s => !s.with_skill_id), after = mine.filter(s => s.with_skill_id);
    return { id: c.id, seq: c.seq, slot: c.slot, title: c.title, kind: c.kind, bench: Array.isArray(c.sim?.steps) && c.sim.steps.some((x: any) => x?.type === 'bench'), lesson: !!c.lesson_at,
      before: best(before), after: best(after), runs: mine.length, passed: (best(after) ?? -1) >= PASS_SCORE,
      latest: mine.slice(0, 6).map(s => ({ id: s.id, score: s.score, match: s.match, after: !!s.with_skill_id, model: modelOfSubmission(s), at: s.submitted_at })) };
  });
  const wids = [...new Set((ws || []).map(w => w.task_id))];
  const { data: wt } = wids.length ? await db.from('work_tasks').select('id, role, company_name, task, baseline').in('id', wids) : { data: [] as any[] };
  const work: WorkRow[] = (ws || []).map(w => { const t = (wt || []).find((x: any) => x.id === w.task_id); return { id: w.id, task_id: w.task_id, title: t?.task?.title || '', role: t?.role || '', company: t?.company_name || '', score: w.score, baseline: t?.baseline?.result?.total ?? null, at: w.submitted_at, summary: w.report?.result?.summary || '' }; });
  return { ...en, teacher: skill ? { id: skill.id, name: skill.name, expert: skill.source !== 'jd-draft', expert_name: skill.expert_name, place: skill.expert_location, rules: skill.card?.rules?.length || 0 } : null,
    chapters, work, placements: (pl || []).map(p => ({ ...p, kind_label: PLACE_KIND[p.target_kind as PlacementKind], status_label: PLACE_STATUS[p.status as PlacementStatus] })),
    lessons: { done: chapters.filter(c => c.lesson).length, total: chapters.length } } as EnrollmentDetail;
}

/** 按考试记录重算学籍：入学考 / 毕业考 / 状态（withdrawn 不动） */
export async function recomputeEnrollment(id: string) {
  const d = await enrollmentDetail(id);
  if (d.status === 'withdrawn') return d;
  const befores = d.chapters.map(c => c.before).filter((x): x is number => x != null);
  const afters = d.chapters.map(c => c.after).filter((x): x is number => x != null);
  const entrance = befores.length ? Math.max(...befores) : null;
  const final = afters.length ? Math.round(afters.reduce((a, b) => a + b, 0) / afters.length) : null;
  const allPassed = d.chapters.length > 0 && d.chapters.every(c => c.passed);
  const status: EnrollmentStatus = allPassed ? 'graduated' : afters.length ? (d.chapters.some(c => c.after != null && !c.passed) ? 'remedial' : 'examining') : (befores.length || d.work.length) ? 'training' : 'enrolled';
  const patch: Record<string, any> = { entrance_score: entrance, final_score: final, status, updated_at: new Date().toISOString() };
  if (status === 'graduated' && !d.graduated_at) patch.graduated_at = new Date().toISOString();
  if (status !== 'graduated') patch.graduated_at = null;
  await db.from('college_enrollments').update(patch).eq('id', id);
  if (d.demand_id && status === 'graduated') await db.from('college_applications').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('id', d.demand_id).in('status', ['new', 'contacted', 'training']).then(() => {}, () => {});
  return { ...d, ...patch };
}

/** 把已有的 AI 作答归档成学籍（第一次启用教务时跑一遍）：模型 → 平台学员，模型 × 空间 → 学籍，作答挂上 enrollment_id */
export async function backfillFromSubmissions(by: string) {
  await ensurePlatformStudents();
  const { data: subs, error } = await db.from('skill_submissions').select('id, task_id, candidate_note, graded_by_model, enrollment_id').eq('candidate_type', 'ai').is('enrollment_id', null);
  if (error) throw MIG(error);
  const { data: students } = await db.from('college_students').select('id, model_id').eq('kind', 'platform');
  const byModel = new Map((students || []).map(s => [s.model_id, s.id]));
  const touched = new Set<string>(); let n = 0;
  for (const s of subs || []) {
    const sid = byModel.get(modelOfSubmission(s)); if (!sid) continue;
    const en = await createEnrollment(sid, s.task_id, by).catch(() => null); if (!en) continue;
    const { error: e3 } = await db.from('skill_submissions').update({ enrollment_id: en.id }).eq('id', s.id);
    if (!e3) { n++; touched.add(en.id); }
  }
  for (const id of touched) await recomputeEnrollment(id);
  return { submissions: n, enrollments: touched.size };
}

/* ───────────── 分配 ───────────── */
export async function listPlacements(filter: { enrollment_id?: string; status?: string } = {}) {
  let q = db.from('college_placements').select('*, enrollment:college_enrollments(id, nova_name, status, final_score, space_id, student:college_students(name, model_id), space:skill_tasks(title, profile, jd_snapshot))').order('updated_at', { ascending: false }).limit(500);
  if (filter.enrollment_id) q = q.eq('enrollment_id', filter.enrollment_id);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q; if (error) throw MIG(error);
  return (data || []).map((p: any) => { const e = pick<any>(p.enrollment); const sp = pick<any>(e?.space), st = pick<any>(e?.student); return { ...p, enrollment: undefined, kind_label: PLACE_KIND[p.target_kind as PlacementKind], status_label: PLACE_STATUS[p.status as PlacementStatus], nova: e?.nova_name || sp?.profile?.name || '', role: sp?.profile?.role || sp?.jd_snapshot?.title || sp?.title || '', model_label: modelLabel(st?.model_id), student_name: st?.name || '', final_score: e?.final_score }; });
}

export async function createPlacement(input: { enrollment_id: string; target_kind: PlacementKind; target_id: string; target_name: string; note?: string }, by: string) {
  if (!['ws_org', 'company', 'demand'].includes(input.target_kind)) throw new Error('去向类型不对');
  const { data: en } = await db.from('college_enrollments').select('id, status').eq('id', input.enrollment_id).single();
  if (!en) throw new Error('学籍不存在');
  const { data, error } = await db.from('college_placements').insert({ enrollment_id: input.enrollment_id, target_kind: input.target_kind, target_id: String(input.target_id), target_name: String(input.target_name).slice(0, 200), note: input.note || null, created_by: by }).select('*').single();
  if (error) throw MIG(error);
  return data;
}

/** 可以派去的地方：工作台机构（企业版 / 科研版）、企业库企业、人才培养需求单 */
export async function searchTargets(q: string) {
  const qq = q.trim();
  const [orgs, companies, demands] = await Promise.all([
    db.from('ws_orgs').select('id, name, kind, company_name').ilike('name', `%${qq}%`).limit(8).then(r => r.data || []),
    qq ? searchCompanies(qq, 8) : Promise.resolve([] as any[]),
    db.from('college_applications').select('id, org, title, status, payload').eq('kind', 'hire').or(`org.ilike.%${qq}%,title.ilike.%${qq}%`).order('created_at', { ascending: false }).limit(8).then(r => r.data || []),
  ]);
  return {
    ws_org: orgs.map((o: any) => ({ id: o.id, name: o.name, hint: o.kind === 'research' ? '科研版工作台' : '企业版工作台' })),
    company: companies.map((c: any) => ({ id: String(c.id), name: c.name, hint: [c.industry, c.city, c.jobs ? `在招 ${c.jobs}` : ''].filter(Boolean).join(' · ') })),
    demand: demands.map((d: any) => ({ id: d.id, name: `${d.org} · ${d.title}`, hint: `培养需求 · ${APP_STATUS[d.status] || d.status}${d.payload?.headcount ? ` · 要 ${d.payload.headcount}` : ''}` })),
  };
}

/* ───────────── 总览 ───────────── */
export async function overview() {
  const [apps, students, ens, pls] = await Promise.all([
    db.from('college_applications').select('kind, status').then(r => r.data || []),
    db.from('college_students').select('kind').then(r => r.data || [], () => []),
    db.from('college_enrollments').select('status').then(r => r.data || [], () => []),
    db.from('college_placements').select('status').then(r => r.data || [], () => []),
  ]);
  const cnt = (xs: any[], f: (x: any) => boolean) => xs.filter(f).length;
  return {
    applications: { total: apps.length, enroll_new: cnt(apps, a => a.kind === 'enroll' && a.status === 'new'), hire_new: cnt(apps, a => a.kind === 'hire' && a.status === 'new'), training: cnt(apps, a => a.status === 'training') },
    students: { total: students.length, platform: cnt(students, s => s.kind === 'platform'), customer: cnt(students, s => s.kind === 'customer') },
    enrollments: { total: ens.length, enrolled: cnt(ens, e => e.status === 'enrolled'), training: cnt(ens, e => ['training', 'examining'].includes(e.status)), remedial: cnt(ens, e => e.status === 'remedial'), graduated: cnt(ens, e => e.status === 'graduated') },
    placements: { total: pls.length, proposed: cnt(pls, p => p.status === 'proposed'), offered: cnt(pls, p => p.status === 'offered'), placed: cnt(pls, p => p.status === 'placed') },
    unplaced_graduates: 0,
  };
}
