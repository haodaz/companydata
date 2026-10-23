/**
 * 聊着出题（2026-10-23，用户：「这部分可以变成与 AI 交流出题，用户缺什么、有什么需要进一步解释，可以追问得更灵活——两种操作模式」）。
 * 照 /workspace 的 AgentKit：出题 AI 先问清三件事（企业 / 要找什么样的人 / 想考什么、给谁做），企业库里有就确认画像，没有就请贴介绍；
 * 问有没有过往的题可以参照（粘贴进对话就行）；出题前 ask_user 确认一句话题意；出完跑基线；用户提意见就修订。
 * 工具就是填表出题背后那几个函数——两种模式同一套能力。
 */
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin as db } from '@/lib/supabase';
import type { AgentKit } from '@/lib/ws/agent';
import { withCost } from '@/lib/token-logger';
import { companyJobs, gatherContext, generateTask, reviseTask, runBaseline, searchCompanies, suggestRoles, WORK_MODEL, type WorkEnvType } from '@/lib/work/generator';
import { autoPickSamples, getSample, listSamples, parseSample, saveSample } from '@/lib/work/samples';
import { randomBytes } from 'node:crypto';

type Ui = { kind: 'work_task'; token: string; owner_key: string; title: string; task_id: string };
const s = (v: any, n = 300) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);

export const WORK_CHAT_TOOLS: Anthropic.Tool[] = [
  { name: 'find_company', description: '按名字在平方企业库里搜企业（名字 / 简称 / 英文名），返回行业、城市、画像完整度、在招岗位数。用户说了公司名先调它。', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'company_brief', description: '一家库里企业的材料有多厚：画像有哪些字段、在招岗位有哪些、有没有深度画像专题。决定要不要让用户补介绍。', input_schema: { type: 'object', properties: { company_id: { type: 'number' } }, required: ['company_id'] } },
  { name: 'suggest_roles', description: '按关键词找岗位：这家企业在招的 + 职业库里的。用户说得含糊时用它给选项；用户直接说「我要一个能……的人」就不用套职位名。', input_schema: { type: 'object', properties: { query: { type: 'string' }, company_id: { type: 'number' } }, required: ['query'] } },
  { name: 'my_references', description: '用户以前交过的参考资料（过往的题 / 内部考题）。', input_schema: { type: 'object', properties: {} } },
  { name: 'read_reference', description: '用户在对话里贴了一道过往的题 / 内部考题（200 字以上）：读成结构（几步、每步问什么、参考答案、要算的数）存成他自己的参考资料，出题时照它改背景换数字。要 1 分钟。', input_schema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['text'] } },
  { name: 'create_task', description: '出题：拼企业材料 → 锚定业务问题 → 任务书 → 材料包 → 带依赖的评分标准（约 2 分钟）。company_id 库里有就传；库里没有就把用户贴的介绍放 intro。role 写用户要找的人（原话也行）。focus 放用户说的「想考什么、给谁做、难度、时长」。reference_id 是他选的参考资料；没有就不传（平台会在后台自动参照）。env 不传就按岗位自动选。', input_schema: { type: 'object', properties: { company: { type: 'string' }, company_id: { type: 'number' }, intro: { type: 'string' }, role: { type: 'string' }, focus: { type: 'string' }, env: { type: 'string', enum: ['doc', 'code', 'sheet', 'design', 'open', 'plugin'] }, reference_id: { type: 'string' } }, required: ['company', 'role'] } },
  { name: 'task_summary', description: '看一道已出的题的要点：业务问题、任务书、推进步骤、材料清单、评分标准、基线分。回答用户「题是什么样」「哪条标准是什么意思」用它。', input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
  { name: 'run_baseline', description: 'AI 先做一遍当基线（约 1 分钟）。出完题接着调。', input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
  { name: 'revise_task', description: '按用户的意见修订这道题（没提到的部分不动；修订后基线作废，要重跑）。用户说「材料太少」「难度降一点」「换个角度」都用它。', input_schema: { type: 'object', properties: { task_id: { type: 'string' }, feedback: { type: 'string' } }, required: ['task_id', 'feedback'] } },
  { name: 'ask_user', description: '需要用户决定时用：一句话的问题 + 2–4 个短选项（不带编号；也可以自己打字）。出题前确认题意、选企业 / 岗位有歧义、要不要照参考资料出，用它。', input_schema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'] } },
];

const ENV_TYPES = ['doc', 'code', 'sheet', 'design', 'open', 'plugin'];

/** 出一道题（填表出题的接口和聊着出题的工具共用这一段） */
export async function createWorkTask(user: { email: string; role: string }, body: { company: string; company_id?: number | string | null; intro?: string; role: string; env?: string; focus?: string; model?: string; sample_id?: string; sample_mode?: 'reskin' | 'inspire' }) {
  const company = String(body.company || '').trim(), role = String(body.role || '').trim();
  if (!company || !role) throw new Error('企业和岗位都要填');
  const ctx = await gatherContext(body.company_id ? String(body.company_id) : company, role, { intro: body.company_id ? undefined : String(body.intro || '').slice(0, 6000) });
  // 参照：出题人自己交的参考资料 → 照它改背景换数字；没有就在后台从内部训练素材里自动挑（用户看不见）→ 照结构出新题
  let sample = body.sample_id ? await getSample(String(body.sample_id)) : null;
  if (body.sample_id && !sample) throw new Error('参考资料不存在');
  if (sample && sample.created_by !== user.email && user.role !== 'admin' && !sample.shared) throw new Error('参考资料不存在');
  let sampleMode: 'reskin' | 'inspire' = body.sample_mode === 'inspire' ? 'inspire' : 'reskin';
  if (!sample) {
    const picks = await autoPickSamples({ company: ctx.company?.name, industry: ctx.company?.industry, role, focus: body.focus }, await listSamples({ sharedOnly: true }), { actor: user.email });
    if (picks[0]) { sample = picks[0]; sampleMode = 'inspire'; }
  }
  if (sample) (ctx as any).sample = { id: sample.id, title: sample.title, mode: sampleMode, auto: !body.sample_id };
  const env = body.env && ENV_TYPES.includes(body.env) ? (body.env as WorkEnvType) : undefined;
  const { task, model } = await withCost({ tool_name: 'work', task_name: 'Generate · 出题', stage: 'create', actor: user.email }, () => generateTask(ctx, role, { sample: sample?.skeleton || null, sampleMode, model: body.model || WORK_MODEL, focus: body.focus ? String(body.focus).slice(0, 1500) : undefined, env, research: false }));
  const share_token = randomBytes(8).toString('base64url'), owner_key = randomBytes(12).toString('base64url');
  const row = { share_token, owner_key, owner: { name: user.email, contact: user.email }, status: 'published', company_id: ctx.company?.id ?? null, company_name: ctx.company?.name || company, role, context: ctx, problem: task.problem, task: { ...task.task, env: task.env }, materials: task.materials, rubric: task.rubric, model, created_by: user.email };
  const { data, error } = await db.from('work_tasks').insert(row).select('id, share_token').single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, share_token: data.share_token as string, owner_key, title: task.task.title, env: task.env.type, notes: ctx.notes, task, company_name: row.company_name };
}

async function loadMine(user: { email: string; role: string }, id: string) {
  const { data: t } = await db.from('work_tasks').select('*').eq('id', id).maybeSingle();
  if (!t) throw new Error('没有这道题');
  if (user.role !== 'admin' && t.created_by !== user.email) throw new Error('只能改自己出的题');
  return t;
}
const ui = (t: any): Ui => ({ kind: 'work_task', token: t.share_token, owner_key: t.owner_key, title: t.task?.title || '', task_id: t.id });
const brief = (t: any) => ({ task_id: t.id, title: t.task?.title, company: t.company_name, role: t.role, env: t.task?.env?.type, time_minutes: t.task?.time_minutes, problem: t.problem?.statement, why_now: t.problem?.why_now, brief: s(t.task?.brief, 1200), stages: (t.task?.stages || []).map((st: any) => ({ id: st.id, type: st.type, question: st.question })), materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title, kind: m.kind, source: m.source })), rubric: (t.rubric || []).map((r: any) => ({ id: r.id, title: r.title, weight: r.weight, desc: s(r.desc, 200) })), baseline: t.baseline ? { model: t.baseline.model, total: t.baseline.result?.total } : null, notes: t.context?.notes || [] });

async function run(name: string, input: any, user: { email: string; role: string }): Promise<{ result: any; ui?: Ui; label: string }> {
  switch (name) {
    case 'find_company': { const list = await searchCompanies(String(input.query || ''), 8); return { result: list, label: list.length ? `企业库里找到 ${list.length} 家` : '企业库里没有这家' }; }
    case 'company_brief': {
      const { data: c } = await db.from('companies').select('id, name, industry, city, completeness_score, introduction, business_profile, product_area, growth_signals, industry_position, public_sentiment, campus_overview').eq('id', Number(input.company_id)).maybeSingle();
      if (!c) return { result: { error: '没有这家' }, label: '没找到' };
      const fields = ['introduction', 'business_profile', 'product_area', 'growth_signals', 'industry_position', 'public_sentiment', 'campus_overview'].filter(k => (c as any)[k]);
      const jobs = await companyJobs(c.id, 30);
      const { data: deep } = await db.from('company_deep_research').select('topic').eq('company_id', c.id).limit(20).then(r => r, () => ({ data: [] as any[] }));
      return { result: { name: c.name, industry: c.industry, city: c.city, completeness: c.completeness_score, profile_fields: fields, intro: s(c.introduction, 400), jobs: jobs.map(j => j.title), deep_topics: (deep || []).map((d: any) => d.topic) }, label: `${c.name}：画像 ${fields.length} 项、在招岗位 ${jobs.length} 个` };
    }
    case 'suggest_roles': { const r = await suggestRoles(String(input.query || ''), input.company_id ? Number(input.company_id) : null); return { result: r, label: `岗位候选：在招 ${r.jobs.length}、职业库 ${r.occupations.length}` }; }
    case 'my_references': { const list = (await listSamples({ email: user.email })).filter(x => x.created_by === user.email && !x.shared); return { result: list.map(x => ({ id: x.id, title: x.title, type: x.problem_type, stages: x.skeleton?.stages?.length || 0, summary: s(x.skeleton?.summary, 200) })), label: list.length ? `有 ${list.length} 份参考资料` : '还没有参考资料' }; }
    case 'read_reference': {
      const raw = String(input.text || '').trim(); if (raw.length < 200) return { result: { error: '太短了，整道题贴进来（200 字以上）' }, label: '太短' };
      const k = await withCost({ tool_name: 'work', task_name: 'Sample · 解析深度样本', stage: 'create', actor: user.email }, () => parseSample(raw, { title: input.title ? String(input.title) : undefined, actor: user.email }));
      if (!k.stages.length) return { result: { error: '没读出推进步骤，这可能不是一道题' }, label: '没读出来' };
      const saved = await saveSample(k, raw, { source_name: '对话里贴的', created_by: user.email, shared: false });
      return { result: { reference_id: saved.id, title: k.title, type: k.problem_type, stages: k.stages.map(st => ({ id: st.id, type: st.type, question: st.question })), summary: k.summary }, label: `读完了：${k.title}，${k.stages.length} 步` };
    }
    case 'create_task': {
      const r = await createWorkTask(user, { company: String(input.company || ''), company_id: input.company_id ? Number(input.company_id) : null, intro: input.intro ? String(input.intro) : undefined, role: String(input.role || ''), env: input.env, focus: input.focus ? String(input.focus) : undefined, sample_id: input.reference_id ? String(input.reference_id) : undefined, sample_mode: 'reskin' });
      const t = await loadMine(user, r.id);
      return { result: { ...brief(t), share_link: `/work/${r.share_token}`, owner_link: `/work/${r.share_token}/owner?k=${r.owner_key}` }, ui: ui(t), label: `出好了：${r.title}` };
    }
    case 'task_summary': { const t = await loadMine(user, String(input.task_id)); return { result: brief(t), ui: ui(t), label: `看了「${t.task?.title}」` }; }
    case 'run_baseline': {
      const t = await loadMine(user, String(input.task_id));
      const baseline = await withCost({ tool_name: 'work', task_name: 'Baseline · AI 先做一遍', stage: 'create', actor: user.email }, () => runBaseline({ env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric }, { institution: t.company_name }));
      await db.from('work_tasks').update({ baseline, updated_at: new Date().toISOString() }).eq('id', t.id);
      return { result: { total: baseline.result.total, model: baseline.model, summary: s(baseline.result.summary, 400), gaps: baseline.result.gaps }, ui: ui({ ...t, baseline }), label: `AI 基线 ${baseline.result.total} 分` };
    }
    case 'revise_task': {
      const t = await loadMine(user, String(input.task_id)); const feedback = String(input.feedback || '').trim();
      const cur = { env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric };
      const { task: next, model, changelog } = await withCost({ tool_name: 'work', task_name: 'Revise · 按意见修订', stage: 'create', actor: user.email }, () => reviseTask(cur, t.context, feedback));
      const revisions = [...(t.task?.revisions || []), { at: new Date().toISOString(), feedback: feedback.slice(0, 1200), changelog, model }];
      const { error } = await db.from('work_tasks').update({ problem: next.problem, task: { ...next.task, env: next.env, revisions }, materials: next.materials, rubric: next.rubric, baseline: null, updated_at: new Date().toISOString() }).eq('id', t.id);
      if (error) throw new Error(error.message);
      return { result: { changelog, baseline_cleared: true }, ui: ui(t), label: '按意见改了' };
    }
    default: return { result: { error: `没有 ${name} 这个工具` }, label: name };
  }
}

export function workChatSystemPrompt(user: string) {
  return `你是「百业AI｜真活」的出题助理，在帮出题人（${user}）出一道真活：拿一家企业此刻真实的业务问题，考候选人能不能干这个活。界面是对话 + 右侧产物面板（题出好会在右侧打开真活空间）。

怎么聊：
- 先弄清三件事，缺哪件问哪件，一次只问一件：①哪家企业（find_company 搜，库里有就确认是不是这家；库里没有就请他贴一段介绍：做什么、多大、最近在推进什么、为什么招人）；②要找什么样的人（他说「我要一个能看懂 AI 行业的人来做投资」就照原话，不要替他套职位名；说得含糊再 suggest_roles 给选项）；③想考什么、给谁做、多长时间（没想法就说「按岗位此刻最真实的问题出」）。
- 库里有企业时 company_brief 看材料厚不厚；画像很薄就提一句可以补介绍，不强求。
- 问一句有没有过往用过的题或内部考题可以参照：有就让他贴进来，read_reference 读成结构；之后 create_task 传 reference_id，题会照它的路数（题型、推进、算法保留，故事换成这家企业、数字换掉）。没有就不传，平台自己有参照。
- 出题前用 ask_user 用一句话复述题意（企业 + 要找的人 + 考什么）让他确认；确认了 create_task（告诉他要 2 分钟），出完接着 run_baseline（1 分钟），然后用三五句话说这道题：业务问题、要交什么、几步推进、基线几分。
- 他说哪里不对，revise_task 改；改完提醒基线要重跑，问要不要跑。
- 他问「这条标准什么意思」「材料里有什么」，task_summary 看了再答。

规则：
- 不编造。企业事实只来自工具结果；工具没给的就说没有。
- ask_user 的问题一句话，选项短名不带编号。关键节点（确认题意、要不要照参考资料出、要不要重跑基线）才问，小事直接做。
- 永远用简体中文。像一个靠谱的同事：先给结论，短句。工具调用的过程界面上看得见，不用复述。不用表情符号。
- 不要提「样本」「训练」「参照库」这些内部词；对用户只说「参考资料」。`;
}

export function workChatKit(user: { email: string; role: string }): AgentKit {
  return { system: workChatSystemPrompt(user.email), tools: WORK_CHAT_TOOLS, run: (n, i) => run(n, i, user) as any, org: '真活台', task: '真活 · 聊着出题' };
}
