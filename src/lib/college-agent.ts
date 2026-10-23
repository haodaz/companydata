/**
 * 百业学院 · 教务 AI 总控（院长 A，2026-10-23）。照企业工作台那套 agent 循环（lib/ws/agent.ts 的 AgentKit），换一套工具：
 * 工具就是教务处里能人工点的那些基础功能——两条路径同一套能力。校长 / 教务用自然语言：「给这家基金培养一个能看懂具身智能的分析师」，
 * 它去：看线索 → 挑课（没有就让百业工厂造）→ 录学员 → 开学籍 → 按路径入学考 / 上课 / 毕业考 / 反思 / 真活 → 毕业 → 派去向；关键处 ask_user 停下来问。
 * 给界面的东西放 ui：{ kind: 'college_page', path, title } 右侧面板直接打开教务处那一页（产物 = 真页面）；建课用 space_build（和工作台一样在前端跑）。
 */
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin as db } from '@/lib/supabase';
import type { AgentKit } from '@/lib/ws/agent';
import { MODEL_OPTIONS } from '@/lib/model-options';
import { admitApplication, APP_STATUS, createEnrollment, createPlacement, createStudent, ENROLL_STATUS, enrollmentDetail, ensurePlatformStudents, listCourses, listEnrollments, listPlacements, listStudents, overview, searchTargets, type PlacementKind } from '@/lib/college-admin';
import { advance, attendClass, nextStep, pickableWorkTasks, reflect, regradeEnrollment, runChapterExam, runWorkExam } from '@/lib/college-train';

type Ui = { kind: 'college_page'; path: string; title: string } | { kind: 'space_build'; buildId: string; payload: Record<string, any>; title: string };
const s = (v: any, n = 300) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);
const page = (path: string, title: string): Ui => ({ kind: 'college_page', path, title });

export const COLLEGE_TOOLS: Anthropic.Tool[] = [
  { name: 'overview', description: '教务总览：待处理线索、在册学员、在读 / 补训 / 毕业的学籍数、去向。回答「学校现在什么情况」「今天有什么要处理的」先调它。', input_schema: { type: 'object', properties: {} } },
  { name: 'list_leads', description: '看线索（官网提交的「申请模型入学」enroll / 「人才培养需求」hire）。线索只是 CRM，不是学员台账。', input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['enroll', 'hire'] }, status: { type: 'string' } } } },
  { name: 'admit_lead', description: '把一份「申请模型入学」线索录取为学员（客户模型）。录取前用 ask_user 确认。', input_schema: { type: 'object', properties: { lead_id: { type: 'string' } }, required: ['lead_id'] } },
  { name: 'list_students', description: '学员名册：学员 = 一个模型。平台自己的大模型自动在册（有 model_id 就能考）；客户模型接上接口前不能考。', input_schema: { type: 'object', properties: {} } },
  { name: 'register_student', description: '登记一位客户模型学员：name 必填；model_id 可先指定一个平台模型代跑。', input_schema: { type: 'object', properties: { name: { type: 'string' }, model_id: { type: 'string' }, org: { type: 'string' }, api_style: { type: 'string' }, endpoint: { type: 'string' }, note: { type: 'string' } }, required: ['name'] } },
  { name: 'list_courses', description: '课程目录：课程 = 百业工厂里有已发布章节的职业空间（含章节数、有没有老师傅技能卡、教案覆盖、已有学籍数）。可按关键词筛（岗位 / 企业 / 老师傅）。', input_schema: { type: 'object', properties: { query: { type: 'string' } } } },
  { name: 'build_course', description: '没有对口的课时，让百业工厂造一门：给职业名（profession）或整段岗位要求（jd_text + title + company）。要 3–5 分钟，在右侧面板里跑，建完再 list_courses 找到它。造课前用 ask_user 确认职业名和企业。', input_schema: { type: 'object', properties: { profession: { type: 'string' }, jd_text: { type: 'string' }, title: { type: 'string' }, company: { type: 'string' }, research_post: { type: 'boolean', description: '科研院所的研究岗 = true' } } } },
  { name: 'enroll', description: '给学员开一份学籍（学员 × 课程）。student_id 或 model_id 二选一；space_id 是课程；demand_id 可挂上「人才培养需求」线索做定向培养。', input_schema: { type: 'object', properties: { student_id: { type: 'string' }, model_id: { type: 'string' }, space_id: { type: 'string' }, demand_id: { type: 'string' } }, required: ['space_id'] } },
  { name: 'list_enrollments', description: '学籍一览，可按状态筛（enrolled 已录取 / training 实训中 / examining 考核中 / remedial 补训中 / graduated 已毕业）或按学员筛。', input_schema: { type: 'object', properties: { status: { type: 'string' }, student_id: { type: 'string' } } } },
  { name: 'record', description: '一份学籍的全部：每章入学考 / 毕业考、老师傅关键动作做到几个、错题本、真活成绩与 AI 基线、去向、下一步。回答「某某学得怎么样 / 卡在哪」用它。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' } }, required: ['enrollment_id'] } },
  { name: 'advance', description: '按学习路径连做几步（入学考 → 上课 → 毕业考 → 没过反思补考 → 真活），每步 30–90 秒；一次最多 4 步。要全部跑完就多调几次，直到 next 是 done。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' }, steps: { type: 'integer' } }, required: ['enrollment_id'] } },
  { name: 'entrance_exam', description: '入学考（裸考，不装技能）：默认考核章。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' }, chapter_id: { type: 'string' } }, required: ['enrollment_id'] } },
  { name: 'attend_class', description: '上一章课：把教案 + 示范提炼成要点进学员笔记。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' }, chapter_id: { type: 'string' } }, required: ['enrollment_id', 'chapter_id'] } },
  { name: 'final_exam', description: '毕业考 / 补考一章：装技能卡 + 笔记，按学院口径评。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' }, chapter_id: { type: 'string' } }, required: ['enrollment_id', 'chapter_id'] } },
  { name: 'reflect', description: '对最近一次没过的作答反思，写进错题本（补考前必做）。不给 submission_id 就取最近一次没过的。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' }, submission_id: { type: 'string' } }, required: ['enrollment_id'] } },
  { name: 'list_work_tasks', description: '可以拿来当真活实习的真活（真活台已发布的），和课程同岗位 / 同企业的标 related。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' } }, required: ['enrollment_id'] } },
  { name: 'work_exam', description: '让学员做一道真活，按同一套 rubric 评，和 AI 基线比。不给 work_task_id 就挑最相关的。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' }, work_task_id: { type: 'string' } }, required: ['enrollment_id'] } },
  { name: 'regrade', description: '按学院口径重评一份学籍已有的作答（同一份答案、同一把尺）。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' } }, required: ['enrollment_id'] } },
  { name: 'list_graduates', description: '毕业生名册（含已有去向）。', input_schema: { type: 'object', properties: {} } },
  { name: 'search_targets', description: '找毕业生能派去的地方：工作台机构（企业版 / 科研版）、企业库企业、人才培养需求单。', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'place', description: '把一位毕业生派去一个去向（target_kind: ws_org / company / demand）。派之前用 ask_user 确认。', input_schema: { type: 'object', properties: { enrollment_id: { type: 'string' }, target_kind: { type: 'string', enum: ['ws_org', 'company', 'demand'] }, target_id: { type: 'string' }, target_name: { type: 'string' }, note: { type: 'string' } }, required: ['enrollment_id', 'target_kind', 'target_id', 'target_name'] } },
  { name: 'ask_user', description: '需要好大壮院长拍板时用：一句话的问题 + 2–4 个短选项（不带编号；也可以自己打字）。录取、造课、派去向、花钱多的批量培养之前要问。', input_schema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'] } },
];

export function collegeSystemPrompt(user: string) {
  return `你是百业学院的教务 AI，院长 A。和你说话的是好大壮院长（${user}）或教务同事——他们懂管理，不一定懂 AI，所以你要把事办成，用人话汇报。
学院是什么：学生是 AI 模型（学员）；课程是百业工厂里的职业空间（一个岗位一天的章节、工位、老师傅技能卡、每章教案）；学籍 = 学员 × 课程，同一个模型上不同的课就是不同的毕业生；考核按「学院口径」对照老师傅评（关键动作做到几个、行话与行规 / 具体执行 / 现场判断 / 交付可用），每章 ≥ 60 才毕业；毕业生派去工作台机构 / 企业库企业 / 培养需求单。
学习路径：入学考（裸考看底子）→ 逐章上课（教案要点进笔记）→ 毕业考（技能卡 + 笔记）→ 没过的章反思进错题本再考 → 真活实习（和 AI 基线比）→ 毕业。advance 会按这个路径自动走；也可以单步点。
申请管理是线索（CRM），不是台账；录取 / 立项只是从线索顺手建学员、建学籍。

做事的方式：
- 先查再做：overview / list_* / record 看清状态再动手；工具结果就是事实，不编。
- 培养一位学员的完整流程：找课（list_courses，没有就 build_course）→ 定学员（平台模型默认 qwen-plus，国内能用；用户指定就按指定）→ enroll（有需求线索就挂 demand_id）→ advance 直到 next 是 done（每次最多 4 步，告诉他大概要几分钟）→ 毕业后 search_targets + place。
- 关键节点 ask_user：录取线索、造新课（花 3–5 分钟）、给多位学员批量培养、派去向。其他小事直接做。
- 汇报要像教务处主任：先结论（谁、哪门课、入学考几分 → 毕业考几分、真活几分 vs 基线、过没过），再差距（老师傅的关键动作做到几个、错题本记了什么），再下一步。短句，列表，不要套话。
- 产物会在右侧面板打开（学籍页、名册、课程目录），提一句即可，不复述页面内容。
- 永远用简体中文。`;
}

async function run(name: string, input: any, user: string): Promise<{ result: any; ui?: Ui; label: string }> {
  switch (name) {
    case 'overview': return { result: await overview(), label: '看了教务总览', ui: page('/college/admin', '教务总览') };
    case 'list_leads': {
      let q = db.from('college_applications').select('id, kind, status, org, contact, title, payload, created_at').order('created_at', { ascending: false }).limit(40);
      if (input.kind) q = q.eq('kind', input.kind); if (input.status) q = q.eq('status', input.status);
      const { data } = await q;
      return { result: (data || []).map(a => ({ id: a.id, kind: a.kind, status: APP_STATUS[a.status] || a.status, org: a.org, title: a.title, need: s(a.payload?.jd || a.payload?.target, 400), headcount: a.payload?.headcount, at: a.created_at })), label: `看了 ${(data || []).length} 条线索`, ui: page(`/college/admin/applications${input.kind ? `?kind=${input.kind}` : ''}`, '申请管理 · 线索') };
    }
    case 'admit_lead': { const st = await admitApplication(String(input.lead_id), user); return { result: { student_id: st.id, name: (st as any).name }, label: `录取为学员：${(st as any).name || ''}`, ui: page(`/college/admin/students?focus=${st.id}`, '学员管理') }; }
    case 'list_students': { await ensurePlatformStudents(); const xs = await listStudents(); return { result: xs.map(x => ({ id: x.id, name: x.name, kind: x.kind, model_id: x.model_id, can_exam: !!x.model_id, enrollments: x.enrollments, graduated: x.graduated })), label: `学员名册 ${xs.length} 位`, ui: page('/college/admin/students', '学员管理') }; }
    case 'register_student': { const st = await createStudent({ ...input, kind: 'customer' }, user); return { result: { student_id: st.id }, label: `登记学员：${input.name}`, ui: page(`/college/admin/students?focus=${st.id}`, '学员管理') }; }
    case 'list_courses': {
      const q = String(input.query || '').toLowerCase(); const all = await listCourses();
      const xs = all.filter(c => !q || [c.role, c.title, c.company, c.teacher?.name, c.nova].join(' ').toLowerCase().includes(q));
      return { result: xs.slice(0, 40).map(c => ({ space_id: c.id, role: c.role, company: c.company, chapters: c.chapters, assessments: c.assessments, lessons: c.lessons, teacher: c.teacher?.expert ? c.teacher.name : 'AI 草案', enrollments: c.enrollments, graduates: c.graduates, research: c.research })), label: `课程目录 ${xs.length} 门${q ? `（搜「${input.query}」）` : ''}`, ui: page('/college/admin/courses', '课程目录') };
    }
    case 'build_course': {
      const buildId = `col-${Date.now().toString(36)}`;
      const payload: Record<string, any> = input.profession ? { profession: String(input.profession), buildId } : { jdText: String(input.jd_text || ''), title: String(input.title || ''), company: String(input.company || ''), researchPost: !!input.research_post, buildId };
      if (!payload.profession && String(payload.jdText).length < 40) throw new Error('给职业名，或至少 40 字的岗位要求');
      return { result: { started: true, buildId, note: '在右侧面板里生成，3–5 分钟；建完用 list_courses 找到它，再扩成完整一天（如果只有一章，可以在百业工厂工作室里排一天）' }, label: `让百业工厂造课：${input.profession || input.title}`, ui: { kind: 'space_build', buildId, payload, title: String(input.profession || input.title || '新课程') } };
    }
    case 'enroll': {
      let sid = input.student_id as string | undefined;
      if (!sid && input.model_id) { await ensurePlatformStudents(); const { data } = await db.from('college_students').select('id').eq('model_id', String(input.model_id)).eq('kind', 'platform').maybeSingle(); sid = data?.id; }
      if (!sid) throw new Error('要么给 student_id，要么给平台模型的 model_id');
      const en = await createEnrollment(sid, String(input.space_id), user, input.demand_id || null);
      const d = await enrollmentDetail(en.id);
      return { result: { enrollment_id: en.id, nova: d.nova_name, course: d.course?.role, student: d.student_name, chapters: d.chapters.length, teacher: !!d.teacher, next: await nextStep(en.id) }, label: `开了学籍：${d.student_name} × ${d.course?.role}`, ui: page(`/college/admin/training/${en.id}`, `学籍 · ${d.course?.role}`) };
    }
    case 'list_enrollments': { const xs = await listEnrollments({ status: input.status, student_id: input.student_id }); return { result: xs.slice(0, 60).map(e => ({ enrollment_id: e.id, nova: e.nova_name, course: e.course?.role, company: e.course?.company, student: e.student_name, model: e.model_id, status: e.status, status_label: e.status_label, entrance: e.entrance_score, final: e.final_score, placements: e.placements, demand_id: e.demand_id })), label: `学籍 ${xs.length} 份`, ui: page(`/college/admin/training${input.status ? `?status=${input.status}` : ''}`, '学员培养') }; }
    case 'record': {
      const d = await enrollmentDetail(String(input.enrollment_id)); const next = await nextStep(d.id).catch(e => ({ kind: 'blocked', label: String(e?.message || e) }));
      const nb = d.notebook || {};
      return { result: { enrollment_id: d.id, nova: d.nova_name, course: d.course?.role, company: d.course?.company, student: d.student_name, model: d.model_id, status: ENROLL_STATUS[d.status] || d.status, entrance: d.entrance_score, final: d.final_score, teacher: d.teacher ? { name: d.teacher.name, expert: d.teacher.expert, rules: d.teacher.rules } : null,
        chapters: d.chapters.map(c => { const l = c.latest.find(x => x.after) || c.latest[0]; return { chapter_id: c.id, title: c.title, slot: c.slot, kind: c.kind, entrance: c.before, final: c.after, passed: c.passed, lesson: c.lesson, studied: !!nb.lessons?.[c.id], moves: l?.moves, caps: l?.caps, missed: l?.missed?.slice(0, 3), latest_submission_id: l?.id }; }),
        notebook: { rules: (nb.rules || []).slice(-6), mistakes: (nb.mistakes || []).slice(-2).map((m: any) => ({ chapter: m.chapter, lesson: s(m.lesson, 200) })) },
        work: d.work.map(w => ({ title: w.title, score: w.score, baseline: w.baseline, summary: s(w.summary, 200) })), placements: d.placements.map((p: any) => ({ target: p.target_name, kind: p.kind_label, status: p.status_label })), next }, label: `看了 ${d.nova_name} 的学籍`, ui: page(`/college/admin/training/${d.id}`, `学籍 · ${d.course?.role}`) };
    }
    case 'advance': { const r = await advance(String(input.enrollment_id), Math.min(4, Number(input.steps) || 3)); return { result: { steps: r.steps.map(x => ({ step: x.step.label, ok: !x.error, result: x.error ? x.error : x.result?.score != null ? { score: x.result.score, passed: x.result.passed, match: x.result.match } : x.result?.points ? { points: x.result.points.length } : x.result?.rules ? { lesson: x.result.lesson, rules: x.result.rules } : x.result })), next: r.next }, label: `按路径做了 ${r.steps.length} 步 → ${r.next.label}`, ui: page(`/college/admin/training/${input.enrollment_id}`, '学籍') }; }
    case 'entrance_exam': { const r = await runChapterExam(String(input.enrollment_id), input.chapter_id || null, false); return { result: r, label: `入学考 · ${r.chapter}：${r.score} 分`, ui: page(`/college/admin/training/${input.enrollment_id}`, '学籍') }; }
    case 'attend_class': { const r = await attendClass(String(input.enrollment_id), String(input.chapter_id)); return { result: r, label: `上课 · ${r.chapter}：${r.points.length} 条要点`, ui: page(`/college/admin/training/${input.enrollment_id}`, '学籍') }; }
    case 'final_exam': { const r = await runChapterExam(String(input.enrollment_id), String(input.chapter_id), true); return { result: r, label: `毕业考 · ${r.chapter}：${r.score} 分${r.passed ? ' ✓' : ''}`, ui: page(`/college/admin/training/${input.enrollment_id}`, '学籍') }; }
    case 'reflect': {
      let sid = input.submission_id as string | undefined;
      if (!sid) { const d = await enrollmentDetail(String(input.enrollment_id)); const failed = d.chapters.flatMap(c => c.latest.filter(x => x.after && (x.score ?? 0) < 60)).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]; if (!failed) throw new Error('没有没过的作答可以反思'); sid = failed.id; }
      const r = await reflect(String(input.enrollment_id), sid); return { result: r, label: `反思 · ${r.chapter}：${r.rules.length} 条规则`, ui: page(`/college/admin/training/${input.enrollment_id}`, '学籍') };
    }
    case 'list_work_tasks': { const d = await enrollmentDetail(String(input.enrollment_id)); const ws = await pickableWorkTasks(d.space_id); return { result: ws.slice(0, 20), label: `可考的真活 ${ws.length} 道` }; }
    case 'work_exam': {
      let wid = input.work_task_id as string | undefined;
      if (!wid) { const d = await enrollmentDetail(String(input.enrollment_id)); const ws = await pickableWorkTasks(d.space_id); wid = (ws.find(w => w.related) || ws[0])?.id; if (!wid) throw new Error('没有可考的真活'); }
      const r = await runWorkExam(String(input.enrollment_id), wid); return { result: r, label: `真活 · ${r.title}：${r.score} 分（基线 ${r.baseline ?? '—'}）`, ui: page(`/college/admin/training/${input.enrollment_id}`, '学籍') };
    }
    case 'regrade': { const r = await regradeEnrollment(String(input.enrollment_id)); return { result: r, label: `按学院口径重评 ${r.length} 份`, ui: page(`/college/admin/training/${input.enrollment_id}`, '学籍') }; }
    case 'list_graduates': { const [xs, pls] = await Promise.all([listEnrollments({ status: 'graduated' }), listPlacements()]); return { result: xs.map(e => ({ enrollment_id: e.id, nova: e.nova_name, course: e.course?.role, student: e.student_name, final: e.final_score, graduated_at: e.graduated_at, placements: pls.filter((p: any) => p.enrollment_id === e.id).map((p: any) => `${p.target_name}（${p.status_label}）`) })), label: `毕业生 ${xs.length} 位`, ui: page('/college/admin/graduates', '毕业生管理') }; }
    case 'search_targets': return { result: await searchTargets(String(input.query || '')), label: `找去向：${input.query}` };
    case 'place': { const p = await createPlacement({ enrollment_id: String(input.enrollment_id), target_kind: input.target_kind as PlacementKind, target_id: String(input.target_id), target_name: String(input.target_name), note: input.note }, user); return { result: { placement_id: p.id, status: p.status }, label: `派去 ${input.target_name}`, ui: page('/college/admin/graduates', '毕业生管理') }; }
    default: throw new Error(`不认识的工具 ${name}`);
  }
}

export function collegeKit(user: string): AgentKit {
  return { system: collegeSystemPrompt(user), tools: COLLEGE_TOOLS, run: (n, i) => run(n, i, user) as any, org: '百业学院', task: '学院 · 教务总控对话' };
}
export const COLLEGE_MODELS = MODEL_OPTIONS.filter(m => /^(claude-|gpt-|gemini-|qwen)/.test(m.id));
