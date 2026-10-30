/**
 * 真活 · 这家企业、这个岗位的「AI 使用标准」（2026-10-30）。
 * 「AI 用得好」没有统一答案：AI-native 公司默认深度用，传统企业只在部分环节放开；分析师该让 AI 跑数、自己定结论，律师 / 医生的关键判断必须自己做；
 * 金融、医疗、法律这类行业还有治理红线（客户数据、病历不能进外部 AI，监管数字必须回原文核对……）。
 *
 * 所以每道真活先按依据生成一份标准，评 AI 使用能力时照它评。规矩：
 *   - 每一条都要带出处编号：企业画像 [C*] / 新闻 [N*] / 产品 [P*] / 职业 [O*] / 典型任务 [T*] / 行业规范 [S*] / 任务书 [K*] / 材料 [M*] / 法规 [G:*]，
 *     出处不在本题依据里的条目直接丢掉（不让模型编）。
 *   - 法规只从 GOVERNANCE 里挑：这里只收确定存在的法律法规 / 行业规范，只写名称和大意，不写条款号。
 *   - 公司对 AI 的态度先由程序数企业资料里的 AI 信号（命中的句子留作证据），再由模型判断。
 * 结果存在 work_tasks.task.ai_policy（JSON，不用迁移），评分时读；没有就现生成。
 */
import type { WorkContext, WorkTask } from '@/lib/work/generator';

export type Use = 'encourage' | 'allow' | 'caution' | 'forbid';
export const USE_LABEL: Record<Use, string> = { encourage: '鼓励用', allow: '可以用', caution: '慎用', forbid: '不能用' };
export type Stance = 'ai_native' | 'digitalizing' | 'traditional';
export const STANCE_LABEL: Record<Stance, string> = { ai_native: 'AI-native：默认深度用 AI', digitalizing: '数字化中：鼓励在合适环节用', traditional: '传统企业：谨慎用、重合规' };

export interface AiPolicy {
  v: 1; built_at: string; model?: string;
  stance: { level: Stance; why: string; basis: string[]; signals: string[] };
  stages: { stage: string; use: Use; why: string; basis: string[] }[];
  good: { text: string; basis: string[] }[];
  red_lines: { text: string; basis: string[] }[];
  weights: Record<'ask' | 'verify' | 'select' | 'divide' | 'integrate', number>;
  summary: string;
  sources: Record<string, string>;   // 出处编号 → 原文摘要（给人核对）
}

/** 法规与行业规范：只收确定存在的，写名称 + 和「用 AI 做事」相关的大意；scope 命中行业 / 岗位 / 企业名才进候选（'all' 人人适用） */
export const GOVERNANCE: { id: string; name: string; scope: RegExp | 'all'; point: string }[] = [
  { id: 'pipl', name: '《中华人民共和国个人信息保护法》（2021）', scope: 'all', point: '处理他人个人信息要有合法依据、最小必要；把客户 / 候选人 / 患者的个人信息发给外部 AI 服务属于向第三方提供，要有依据' },
  { id: 'dsl', name: '《中华人民共和国数据安全法》（2021）', scope: 'all', point: '数据分类分级保护；企业内部数据、重要数据外传要按单位的数据安全制度' },
  { id: 'genai', name: '《生成式人工智能服务管理暂行办法》（2023）', scope: 'all', point: '生成式 AI 的内容可能不准确；使用时要尊重知识产权、不得用于生成和传播虚假信息' },
  { id: 'label', name: '《人工智能生成合成内容标识办法》（2025）', scope: 'all', point: 'AI 生成合成的内容对外发布时要按规定标识' },
  { id: 'bank', name: '《银行保险机构数据安全管理办法》（2024）', scope: /银行|保险|金融|信贷|理财|支付|信托/, point: '客户数据和业务数据分级管理，未经授权不得对外提供' },
  { id: 'sec', name: '《证券期货业网络和信息安全管理办法》（2023）', scope: /证券|期货|基金|券商|资管|投研/, point: '证券期货业务数据和客户信息的安全管理' },
  { id: 'med', name: '《医疗卫生机构网络安全管理办法》（2022）', scope: /医疗|医院|医药|医师|护士|临床|患者|健康|诊/, point: '患者信息与医疗数据严格保护，不得违规外传' },
  { id: 'lawyer', name: '《律师执业行为规范》', scope: /律师|律所|法律|法务|诉讼|合规/, point: '律师对执业中知悉的委托人信息负有保密义务；法律意见由律师本人负责' },
  { id: 'cpa', name: '《中国注册会计师职业道德守则》', scope: /会计|审计|财务|税务|注册会计师/, point: '对执业中获知的客户信息保密；职业判断由注册会计师本人作出' },
  // 2026-10-30 补（逐条上网核实过名称、发布机关、年份；不确定的不收——学位法正式条文没查到写明「人工智能代写」，没收）
  { id: 'ndsr', name: '《网络数据安全管理条例》（国务院令第 790 号，2025 年施行）', scope: 'all', point: '网络数据分类分级保护，细化了个人信息处理和数据处理者的安全义务' },
  { id: 'idiag', name: '《互联网诊疗监管细则（试行）》（国家卫健委、国家中医药局，2022）', scope: /医疗|医院|医药|医师|医生|护士|临床|患者|诊|处方|药师/, point: '人工智能软件等不得冒用、替代医师本人提供诊疗服务；处方须由接诊医师本人开具' },
  { id: 'medai', name: '《卫生健康行业人工智能应用场景参考指引》（国家卫健委等，2024）', scope: /医疗|医院|医药|医师|医生|护士|临床|健康|卫生|公卫/, point: '列出预问诊、辅助决策、病历质控等可以用人工智能的场景，用作「哪些环节可以用 AI」的依据' },
  { id: 'cpadata', name: '《会计师事务所数据安全管理暂行办法》（财政部、国家网信办，2024）', scope: /会计|审计|注册会计师|事务所/, point: '审计业务数据要按办法管理，审计工作底稿出境要办理审批' },
  { id: 'research', name: '《负责任研究行为规范指引（2023）》（科技部监督司）', scope: /科研|研究员|研究所|博士后|课题|实验室|论文|学术/, point: '对科研活动中使用人工智能等划了规范要求，研究成果的真实性和署名责任由研究者本人负责' },
  { id: 'k12', name: '《中小学生成式人工智能使用指南（2025年版）》（教育部基础教育教学指导委员会）', scope: /教师|老师|教育|学校|中小学|教学|教研|培训/, point: '学生不得把 AI 生成的内容直接当作业或答案；教师不宜直接用 AI 生成的内容评价学生，不把 AI 当作替代性的教学主体' },
  { id: 'court', name: '最高人民法院《关于规范和加强人工智能司法应用的意见》（法发〔2022〕33号）', scope: /法官|法院|司法|审判|书记员/, point: '人工智能辅助的结果只作参考，裁判由审判人员作出，司法责任由裁判者承担' },
  { id: 'miit', name: '《工业和信息化领域数据安全管理办法（试行）》（工信部，2023 年施行）', scope: /制造|工业|工厂|生产|产线|电信|通信|软件|半导体|电池|设备/, point: '工业数据、电信数据分类分级管理，重要数据和核心数据重点保护' },
  { id: 'auto', name: '《汽车数据安全管理若干规定（试行）》（2021）', scope: /汽车|整车|车企|自动驾驶|智能网联|主机厂/, point: '汽车数据处理遵循车内处理、默认不收集、最小必要等原则，重要数据按规定管理' },
  { id: 'deepsyn', name: '《互联网信息服务深度合成管理规定》（2022）', scope: /媒体|新媒体|内容|运营|营销|广告|直播|编辑|记者|短视频|设计|品牌|公关/, point: '用深度合成技术生成的图像、音视频、文本要按规定标识，不得用于制作传播虚假信息' },
];

/** 程序先数企业资料里的 AI 信号：命中的句子留作证据（不靠模型「觉得」） */
const AI_RE = /人工智能|\bAI\b|AIGC|大模型|生成式|智能体|Agent|机器学习|深度学习|算法|自动驾驶|算力|AI\+|智能化/i;
export function aiSignals(ctx: WorkContext | any): string[] {
  const texts: string[] = [];
  const c = ctx?.company || {};
  for (const k of ['introduction', 'business_profile', 'product_area', 'growth_signals', 'industry_position', 'one_sentence']) if (c[k]) texts.push(...String(typeof c[k] === 'string' ? c[k] : JSON.stringify(c[k])).split(/[。；\n]/));
  for (const p of ctx?.products || []) texts.push(`${p.name}：${p.description || ''}`);
  for (const n of ctx?.news || []) texts.push(n.description || '');
  return [...new Set(texts.map(t => t.trim()).filter(t => t.length >= 6 && AI_RE.test(t)))].slice(0, 8).map(t => t.slice(0, 80));
}

/** 本题的全部依据，编上号（模型只能引这些编号） */
export function policySources(task: WorkTask, ctx: WorkContext | any): Record<string, string> {
  const S: Record<string, string> = {};
  const c = ctx?.company || {};
  const cut = (v: any, n = 220) => String(typeof v === 'string' ? v : JSON.stringify(v ?? '')).replace(/\s+/g, ' ').slice(0, n);
  let i = 0;
  for (const k of ['introduction', 'business_profile', 'industry', 'growth_signals', 'industry_position']) if (c[k]) S[`C${++i}`] = `企业${k === 'industry' ? '行业' : '画像'}（${c.name || ''}）：${cut(c[k])}`;
  (ctx?.products || []).slice(0, 4).forEach((p: any, j: number) => { S[`P${j + 1}`] = `产品：${p.name}${p.description ? '，' + cut(p.description, 120) : ''}`; });
  (ctx?.news || []).slice(0, 5).forEach((n: any, j: number) => { S[`N${j + 1}`] = `动态${n.publish_date_str ? '（' + n.publish_date_str + '）' : ''}：${cut(n.description, 140)}`; });
  if (ctx?.occupation) { S.O1 = `职业「${ctx.occupation.name}」职责：${cut(ctx.occupation.responsibility || ctx.occupation.intro, 260)}`; if (ctx.occupation.position_requirement) S.O2 = `职业要求：${cut(ctx.occupation.position_requirement, 200)}`; }
  (ctx?.typical_tasks || []).slice(0, 4).forEach((t: any, j: number) => { S[`T${j + 1}`] = `典型任务「${t.name}」：${cut(t.process || t.summary, 160)}${t.common_mistakes ? '；常见错误：' + cut(t.common_mistakes, 100) : ''}`; });
  (ctx?.standards || []).slice(0, 5).forEach((s: any, j: number) => { S[`S${j + 1}`] = `行业规范 ${s.code || ''}《${s.title}》：${cut(s.key_points || s.operation_relevance, 180)}`; });
  S.K1 = `任务书：${task.task.title}。${cut(task.task.brief, 300)}`;
  (task.task as any).stages?.forEach?.((st: any, j: number) => { S[`K${j + 2}`] = `推进第 ${j + 1} 步：${cut(st.question, 120)}`; });
  task.materials.slice(0, 8).forEach((m: any, j: number) => { S[`M${j + 1}`] = `材料 ${m.id}《${m.title}》（${m.kind || ''}）：${cut(m.content, 120)}`; });
  const scopeText = `${c.industry || ''} ${c.name || ''} ${ctx?.occupation?.name || ''} ${task.task.role || ''} ${(task.task as any).title || ''}`;
  for (const g of GOVERNANCE) if (g.scope === 'all' || g.scope.test(scopeText)) S[`G:${g.id}`] = `${g.name}：${g.point}`;
  return S;
}

/** 生成标准（askJson 由调用方传入，走评分的模型链：Claude 优先、千问兜底） */
export async function buildAiPolicy(task: WorkTask, ctx: WorkContext | any, askJson: (prompt: string, name: string, inst?: string) => Promise<any>): Promise<AiPolicy> {
  const sources = policySources(task, ctx);
  const signals = aiSignals(ctx);
  const ids = new Set(Object.keys(sources));
  const p = await askJson(`你要为一道「真活」（企业真实业务任务）写这家企业、这个岗位的「AI 使用标准」：候选人做这道任务时，哪些环节该用 AI、怎么用算用得好、有哪些治理红线。之后会照它评候选人的 AI 使用能力。
企业：${ctx?.company?.name || '（未知）'}；行业：${ctx?.company?.industry || '（未知）'}；岗位 / 要找的人：${task.task.role || ''}
程序在企业资料里找到的 AI 信号 ${signals.length} 条：${signals.map(s => `「${s}」`).join('；') || '（没有）'}

## 依据（只能引用这些编号，编号以外的事一律不写）
${Object.entries(sources).map(([k, v]) => `[${k}] ${v}`).join('\n')}

要求：
1. stance：这家企业对 AI 的态度——ai_native（AI 是主业或核心生产方式）/ digitalizing（在推进数字化、AI 是工具）/ traditional（传统业务、合规要求重）。依据 AI 信号和画像判断，why 一句话，basis 写编号。
2. stages：按任务书和推进步骤，把这道任务拆成 3–6 个环节（读材料、拆问题、算数、起草、下结论、对外表述……），每个环节写 use：encourage / allow / caution / forbid，why 一句话，basis 写编号。关键判断、对客户 / 监管负责的结论，一般不该交给 AI。
3. good：这个岗位里「AI 用得好」的 3–5 条具体表现（贴着这道任务说），每条带 basis。
4. red_lines：只写有依据的治理红线（basis 至少一个 G:* / S* / M* 编号），比如材料里有客户个人信息、医疗数据、未公开财务数据时不能原样贴给外部 AI；没有就返回空数组，不要硬凑。
5. weights：五个子项的权重，加起来 100——ask 提问、verify 核验、select 取舍、divide 分工、integrate 整合。按这个岗位调：结论要对外负责、错了代价大的岗位核验 / 分工权重高；内容生产类整合权重高。
6. summary：两句话说清这道任务的 AI 使用标准。
只返回 JSON：{ "stance": { "level": "", "why": "", "basis": [] }, "stages": [ { "stage": "", "use": "", "why": "", "basis": [] } ], "good": [ { "text": "", "basis": [] } ], "red_lines": [ { "text": "", "basis": [] } ], "weights": { "ask": 20, "verify": 20, "select": 20, "divide": 20, "integrate": 20 }, "summary": "" }`, 'Grade · AI 使用标准', ctx?.company?.name);
  // 出处校验：只留本题依据里有的编号；一个有效出处都没有的条目丢掉
  const keep = (b: any) => (Array.isArray(b) ? b : []).map((x: any) => String(x).replace(/[\[\]\s]/g, '')).filter((x: string) => ids.has(x));
  const S = (v: any, n = 200) => String(v ?? '').slice(0, n);
  const levels: Stance[] = ['ai_native', 'digitalizing', 'traditional'];
  const uses: Use[] = ['encourage', 'allow', 'caution', 'forbid'];
  const stages = (Array.isArray(p.stages) ? p.stages : []).map((x: any) => ({ stage: S(x.stage, 30), use: (uses.includes(x.use) ? x.use : 'allow') as Use, why: S(x.why), basis: keep(x.basis) })).filter((x: any) => x.stage && x.basis.length).slice(0, 6);
  const good = (Array.isArray(p.good) ? p.good : []).map((x: any) => ({ text: S(x.text), basis: keep(x.basis) })).filter((x: any) => x.text && x.basis.length).slice(0, 5);
  const red_lines = (Array.isArray(p.red_lines) ? p.red_lines : []).map((x: any) => ({ text: S(x.text), basis: keep(x.basis).filter((b: string) => /^(G:|S|M)/.test(b)) })).filter((x: any) => x.text && x.basis.length).slice(0, 4);
  const w0 = p.weights || {}; const keys = ['ask', 'verify', 'select', 'divide', 'integrate'] as const;
  const raw = keys.map(k => Math.max(5, Number(w0[k]) || 20)); const sum = raw.reduce((a, b) => a + b, 0);
  const weights = Object.fromEntries(keys.map((k, i) => [k, Math.round((raw[i] / sum) * 100)])) as AiPolicy['weights'];
  const used = new Set([...stages, ...good, ...red_lines].flatMap(x => x.basis).concat(keep(p.stance?.basis)));
  return {
    v: 1, built_at: new Date().toISOString(),
    stance: { level: levels.includes(p.stance?.level) ? p.stance.level : (signals.length >= 3 ? 'digitalizing' : 'traditional'), why: S(p.stance?.why), basis: keep(p.stance?.basis), signals },
    stages, good, red_lines, weights, summary: S(p.summary, 300),
    sources: Object.fromEntries(Object.entries(sources).filter(([k]) => used.has(k))),
  };
}

/** 程序查的硬红线：问 AI 时贴了手机号 / 身份证号 / 邮箱 / 银行卡号（不靠模型判断） */
export function hardRedFlags(aiChat: { t: number; q: string }[]): { t: number; what: string; quote: string }[] {
  const out: { t: number; what: string; quote: string }[] = [];
  const pats: [RegExp, string][] = [[/(?<!\d)1[3-9]\d{9}(?!\d)/, '手机号'], [/(?<!\d)\d{17}[\dXx](?!\d)/, '身份证号'], [/[\w.+-]+@[\w-]+\.[\w.]+/, '邮箱'], [/(?<!\d)\d{16,19}(?!\d)/, '银行卡号']];
  for (const c of aiChat) for (const [re, what] of pats) { const m = String(c.q || '').match(re); if (m) { out.push({ t: c.t, what, quote: m[0].replace(/(\d{3})\d+(\d{2})/, '$1****$2') }); break; } }
  return out.slice(0, 6);
}
