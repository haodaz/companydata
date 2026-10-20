/**
 * 百业 ToB 工作台 · AI 总控能调用的工具（2026-10-20）。
 * 边界：企业工作台只能生成和**自己企业**相关的内容——所有工具都没有「企业」参数，一律用 org.company_id / org.name；
 * 查题目、查结果也只认 org_id 是自己的。平台级内容运营（任何企业、任何行业）在我们自己的后台做，不经过这里。
 * 每个工具返回给模型的是精简 JSON；给界面的东西（产物卡片、选项）放在 ui 字段，agent 层拆出来推给前端，不进模型上下文。
 */
import { randomBytes } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin as db } from '@/lib/supabase';
import { askJson, companyJobs, gatherContext, generateTask, renderContext, runBaseline, WORK_MODEL, type WorkEnvType } from '@/lib/work/generator';
import { withCost } from '@/lib/token-logger';
import type { WsOrg } from '@/lib/ws/org';
import { privateContext } from '@/lib/ws/setup';

export type ToolUi =
  | { kind: 'work'; id: string; token: string; owner_key: string; title: string; role: string }
  | { kind: 'space_build'; buildId: string; payload: Record<string, any>; title: string }
  | { kind: 'space'; id: string; title: string }
  | { kind: 'results'; task_id: string; token: string; owner_key: string; title: string }
  | { kind: 'problems'; role: string; items: { title: string; statement: string; why_now: string; evidence: string[] }[] };
export interface ToolOut { result: any; ui?: ToolUi; label: string }
export interface ToolCtx { org: WsOrg; email: string }

const s = (v: any, n = 400) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);
const companyKey = (org: WsOrg) => (org.company_id ? String(org.company_id) : org.company_name || org.name);

/** 给模型看的工具说明。ask_user 不在这里执行：agent 遇到它就停下这一轮，等人点选 */
export const TOOLS: Anthropic.Tool[] = [
  { name: 'org_profile', description: '读取本企业在平方数据库里的画像：简介、业务、近期动态、产品、在招岗位数。开始任何生成前先读一次，知道企业在干什么。', input_schema: { type: 'object', properties: {} } },
  { name: 'list_roles', description: '列出本企业在招 / 已有的岗位（来自平方岗位库），可按关键词筛。用来帮用户确认是哪个岗位。', input_schema: { type: 'object', properties: { query: { type: 'string', description: '岗位关键词，可空' } } } },
  { name: 'propose_problems', description: '给本企业的某个岗位，从企业动态、岗位职责、职业典型任务、行业规范里找出 3 个「此刻真实的业务问题」候选，作为出真活的起点。拿到候选后必须用 ask_user 让用户选一个（或让他自己说），不要替他选。', input_schema: { type: 'object', properties: { role: { type: 'string' }, hint: { type: 'string', description: '用户已经说过的关注点，可空' } }, required: ['role'] } },
  { name: 'ask_user', description: '需要用户拍板时用：一句话的问题 + 2–4 个短选项（不带编号；用户也可以自己打字回答）。问题里不要复述界面上已经显示的候选内容。关键节点必须问：选哪个业务问题、发不发给候选人、要不要建空间。问完这一轮就结束，等用户回答。', input_schema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, description: '2–4 个简短选项' } }, required: ['question', 'options'] } },
  { name: 'create_work_task', description: '按用户确认的业务问题，给本企业的岗位生成一道真活（任务书、材料包、带依赖的评分标准），约 1–2 分钟。只能在用户确认业务问题之后调用。', input_schema: { type: 'object', properties: { role: { type: 'string' }, problem: { type: 'string', description: '用户确认的业务问题（原话或候选里的 statement）' }, env: { type: 'string', enum: ['auto', 'doc', 'code', 'sheet', 'design', 'open'], description: '操作台：auto 按岗位自动；open = 候选人用自己的软件做并录屏' } }, required: ['role', 'problem'] } },
  { name: 'run_baseline', description: '让最强模型先把这道真活做一遍当 AI 基线（约 1 分钟），候选人的报告会和它比。', input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
  { name: 'list_work_tasks', description: '列出本企业出过的真活：标题、岗位、参与 / 交卷人数、AI 基线分、参与链接。', input_schema: { type: 'object', properties: {} } },
  { name: 'work_results', description: '看一道真活的作答情况：每个人的分数、用时、问 AI 次数、一句话总结、最突出的高光和风险，以及 AI 基线。用来回答「谁做得好」「对比一下」。', input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
  { name: 'create_space', description: '给本企业的某个岗位建一个职业空间（数字职人 + 一天的章节 + 工位 + 评分标准），用于新人带教和练习，约 3–5 分钟，在右侧面板里跑。优先用本企业岗位库里的 JD；没有就需要 jd_text（让用户粘贴，或你根据企业画像和岗位职责起草一份 200 字以上的职责清单）。', input_schema: { type: 'object', properties: { role: { type: 'string' }, jd_text: { type: 'string', description: '没有库里的 JD 时才填' } }, required: ['role'] } },
  { name: 'list_spaces', description: '列出本企业建过的职业空间。', input_schema: { type: 'object', properties: {} } },
];

export async function runTool(name: string, input: any, ctx: ToolCtx): Promise<ToolOut> {
  const { org } = ctx;
  switch (name) {
    case 'org_profile': {
      const C = 'id, name, brief_name, industry, sub_industry, city, one_sentence, introduction, business_profile, product_area, growth_signals, industry_position';
      const { data: c } = org.company_id ? await db.from('companies').select(C).eq('id', org.company_id).maybeSingle() : { data: null };
      const inside = await privateContext(org.id);
      if (!c) return { label: `读了 ${org.name} 的画像（库里没有，按名字理解）`, result: { name: org.name, note: '平方企业库里没有这家企业的画像，生成时只能按名字和岗位常识来，事实会少。', inside } };
      const [{ data: news }, { data: prods }, { count }] = await Promise.all([
        db.from('company_news').select('description, publish_date_str').eq('company_id', c.id).eq('if_delete', false).order('publish_date', { ascending: false, nullsFirst: false }).limit(5),
        db.from('company_products').select('name, category').eq('company_id', c.id).eq('if_delete', false).limit(6),
        db.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', c.id).eq('if_delete', false),
      ]);
      return { label: `读了 ${c.brief_name || c.name} 的企业画像`, result: { name: c.name, industry: [c.industry, c.sub_industry].filter(Boolean).join(' / '), city: c.city, one_sentence: c.one_sentence, introduction: s(c.introduction, 500), business: s(c.business_profile, 400), position: s(c.industry_position, 300), growth_signals: s(c.growth_signals, 400), news: (news || []).map(n => `${n.publish_date_str || ''} ${s(n.description, 140)}`), products: (prods || []).map(p => p.name), open_jobs: count || 0, inside } };
    }
    case 'list_roles': {
      const q = String(input?.query || '').trim().toLowerCase();
      const { data: mine } = await db.from('ws_roles').select('title, notes, job_id').eq('org_id', org.id);
      const jobs = org.company_id ? await companyJobs(org.company_id, 200) : [];
      const list = (q ? jobs.filter(j => j.title.toLowerCase().includes(q) || String(j.job_function || '').toLowerCase().includes(q)) : jobs).slice(0, 30);
      return { label: q ? `查了本企业「${input.query}」相关岗位（${list.length} 个）` : `列了本企业的岗位（${list.length} 个）`, result: { managed: (mine || []).map(r => ({ title: r.title, notes: r.notes })), roles: list.map(j => ({ title: j.title, function: j.job_function, city: j.city })), note: list.length || mine?.length ? undefined : '岗位库里没有，用户说的岗位名照样可以用' } };
    }
    case 'propose_problems': {
      const role = String(input.role || '').trim(); if (!role) throw new Error('缺岗位');
      const wctx = await gatherContext(companyKey(org), role);
      const inside = await privateContext(org.id, role);
      const prompt = `你在帮「${org.name}」的管理者给「${role}」岗位出一道招聘用的真活。先别出题，只找起点：从下面的材料里找出 3 个这家企业此刻真实存在、需要这个岗位来解决的业务问题。
要求：每个都必须能从材料里推出来（近期动态、产品、岗位职责、职业典型任务、行业规范），写清为什么是现在、依据是哪几句；3 个之间要有区别（比如一个偏数据核对、一个偏跨部门推动、一个偏风险判断）。${input.hint ? `\n用户关注：${s(input.hint, 200)}` : ''}
${renderContext(wctx).slice(0, 9000)}
${inside ? `\n${inside}\n（企业自己说的眼下重点要优先考虑，至少一个候选从这里来）` : ''}
只返回 JSON：{ "items": [ { "title": "8–14 字", "statement": "一句话业务问题", "why_now": "", "evidence": ["材料原句（来源）"] } ] }`;
      const { parsed } = await withCost({ tool_name: 'workspace', task_name: '工作台 · 找业务问题', stage: 'create' }, () => askJson(prompt, WORK_MODEL, '工作台 · 找业务问题', org.name));
      const items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 3).map((x: any) => ({ title: s(x.title, 30), statement: s(x.statement, 240), why_now: s(x.why_now, 240), evidence: (Array.isArray(x.evidence) ? x.evidence : []).slice(0, 3).map((e: any) => s(e, 200)) }));
      return { label: `从企业动态和岗位职责里找了 ${items.length} 个业务问题`, ui: { kind: 'problems', role, items }, result: { role, items, gaps: wctx.notes } };
    }
    case 'create_work_task': {
      const role = String(input.role || '').trim(), problem = String(input.problem || '').trim();
      if (!role || !problem) throw new Error('缺岗位或业务问题');
      const env = (['doc', 'code', 'sheet', 'design', 'open'].includes(input.env) ? input.env : undefined) as WorkEnvType | undefined;
      const wctx = await gatherContext(companyKey(org), role);
      const inside = await privateContext(org.id, role);
      const { task, model } = await withCost({ tool_name: 'work', task_name: 'Generate · 出题（工作台）', stage: 'create', actor: ctx.email }, () => generateTask(wctx, role, { model: WORK_MODEL, focus: `出题人确认的业务问题：${problem}${inside ? `\n${inside}` : ''}`, env }));
      const share_token = randomBytes(8).toString('base64url'), owner_key = randomBytes(12).toString('base64url');
      const row = { share_token, owner_key, owner: { name: ctx.email, contact: ctx.email }, status: 'published', company_id: wctx.company?.id ?? null, company_name: wctx.company?.name || org.name, role, context: wctx, problem: task.problem, task: { ...task.task, env: task.env }, materials: task.materials, rubric: task.rubric, model, created_by: ctx.email, org_id: org.id };
      const { data, error } = await db.from('work_tasks').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      return { label: `出好了真活「${task.task.title}」`, ui: { kind: 'work', id: data.id, token: share_token, owner_key, title: task.task.title, role },
        result: { task_id: data.id, title: task.task.title, env: task.env.type, time_minutes: task.task.time_minutes, deliverables: task.task.deliverables.map(d => d.title), materials: task.materials.map(m => m.title), rubric: task.rubric.map(r => `${r.title}（${r.weight}）`), share_link: `/work/${share_token}`, next: '建议接着 run_baseline，再问用户要不要把参与链接发给候选人' } };
    }
    case 'run_baseline': {
      const t = await ownTask(org, input.task_id);
      const baseline = await withCost({ tool_name: 'work', task_name: 'Baseline · AI 先做一遍（工作台）', stage: 'create', actor: ctx.email }, () =>
        runBaseline({ env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric }, { model: WORK_MODEL, institution: t.company_name }));
      await db.from('work_tasks').update({ baseline, updated_at: new Date().toISOString() }).eq('id', t.id);
      return { label: `AI 基线跑完：${baseline.result.total} 分`, ui: { kind: 'work', id: t.id, token: t.share_token, owner_key: t.owner_key, title: t.task?.title, role: t.role }, result: { total: baseline.result.total, summary: s(baseline.result.summary, 300), weakest: (baseline.result.items || []).slice().sort((a: any, b: any) => a.score - b.score).slice(0, 2).map((i: any) => i.title) } };
    }
    case 'list_work_tasks': {
      const { data } = await db.from('work_tasks').select('id, share_token, role, task, baseline, created_at, status').eq('org_id', org.id).order('created_at', { ascending: false }).limit(30);
      const ids = (data || []).map(t => t.id); const cnt: Record<string, { n: number; done: number }> = {};
      if (ids.length) { const { data: ss } = await db.from('work_sessions').select('task_id, submitted_at').in('task_id', ids); for (const x of ss || []) { const c = cnt[x.task_id] ||= { n: 0, done: 0 }; c.n++; if (x.submitted_at) c.done++; } }
      return { label: `列了本企业的真活（${data?.length || 0} 道）`, result: { tasks: (data || []).map(t => ({ task_id: t.id, title: t.task?.title, role: t.role, status: t.status, joined: cnt[t.id]?.n || 0, submitted: cnt[t.id]?.done || 0, baseline: t.baseline?.result?.total ?? null, share_link: `/work/${t.share_token}`, created: t.created_at?.slice(0, 10) })) } };
    }
    case 'work_results': {
      const t = await ownTask(org, input.task_id);
      const { data: ss } = await db.from('work_sessions').select('id, participant, started_at, submitted_at, score, report').eq('task_id', t.id).order('score', { ascending: false, nullsFirst: false });
      const people = (ss || []).map(x => ({ name: x.participant?.name, mode: x.participant?.mode, submitted: !!x.submitted_at, score: x.score, auditing: !!x.report?.auditing, minutes: x.report?.process?.duration_s ? Math.round(x.report.process.duration_s / 60) : null, ai_asks: x.report?.process?.stats?.ai_asks ?? null, summary: s(x.report?.result?.summary, 200), delegation: s(x.report?.process?.delegation, 200), highlight: x.report?.process?.highlights?.[0] ? s(x.report.process.highlights[0].behavior, 140) : null, risk: x.report?.process?.risks?.[0] ? s(x.report.process.risks[0].behavior, 140) : null }));
      return { label: `看了「${t.task?.title}」的作答（${people.length} 人）`, ui: { kind: 'results', task_id: t.id, token: t.share_token, owner_key: t.owner_key, title: t.task?.title }, result: { title: t.task?.title, baseline: t.baseline?.result?.total ?? null, people } };
    }
    case 'create_space': {
      const role = String(input.role || '').trim(); if (!role) throw new Error('缺岗位');
      let job: any = null;
      if (org.company_id) { const { data } = await db.from('jobs').select('id, name, title_cn').eq('company_id', org.company_id).eq('if_delete', false).or(`name.ilike.%${role}%,title_cn.ilike.%${role}%`).not('responsibilities', 'is', null).limit(1); job = data?.[0] || null; }
      const jd = String(input.jd_text || '').trim();
      if (!job && jd.length < 60) return { label: '需要这个岗位的 JD', result: { error: 'need_jd', note: `本企业岗位库里没有「${role}」的 JD。请让用户粘贴 JD，或根据 org_profile 和岗位常识起草一份 200 字以上的职责清单，用 jd_text 再调一次。` } };
      const buildId = `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const payload = job ? { jobId: job.id, buildId, createdBy: ctx.email, orgId: org.id } : { jdText: jd, title: role, company: org.company_name || org.name, buildId, createdBy: ctx.email, orgId: org.id };
      return { label: `开始建「${role}」的职业空间`, ui: { kind: 'space_build', buildId, payload, title: `${org.company_name || org.name} · ${role}` }, result: { started: true, from: job ? '本企业岗位库的 JD' : '用户提供 / AI 起草的 JD', note: '在右侧面板里跑，约 3–5 分钟；告诉用户可以先做别的' } };
    }
    case 'list_spaces': {
      const { data } = await db.from('skill_tasks').select('id, title, profile, created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(30);
      return { label: `列了本企业的职业空间（${data?.length || 0} 个）`, result: { spaces: (data || []).map(x => ({ id: x.id, title: x.title, role: x.profile?.role, link: `/lab/${x.id}`, created: x.created_at?.slice(0, 10) })) } };
    }
    default: throw new Error(`没有这个工具：${name}`);
  }
}

async function ownTask(org: WsOrg, id: string) {
  const { data: t } = await db.from('work_tasks').select('*').eq('id', String(id || '')).eq('org_id', org.id).maybeSingle();
  if (!t) throw new Error('本企业没有这道真活（task_id 不对，或不是本企业出的）');
  return t;
}
