/**
 * 真活台 · 评价（2026-10-18）：结果按 rubric 逐条（带证据、BARS 等级、尊重依赖关系），过程按事件流（阶段 / 高光 / 风险 / 六维人机协作技能），
 * 再和 AI 基线逐条比。措辞克制：写「观察到」，不写「具备 / 不具备」——评估是危险的东西，先只做练习与预筛。
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import type { WorkTask } from '@/lib/work/generator';
import { supabaseAdmin as db } from '@/lib/supabase';
import { buildAiPolicy, hardRedFlags, STANCE_LABEL, USE_LABEL, type AiPolicy } from '@/lib/work/ai-policy';

const GRADE_MODEL = process.env.WORK_GRADE_MODEL || 'claude-opus-5-5';   // 优先 Claude，千问兜底（2026-10-28）
const s = (v: any, n = 600) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);

async function askJson(prompt: string, task_name: string, institution?: string): Promise<any> {
  let lastErr: any = null;
  // 每个模型两次机会：第一次解析失败（常见是字符串里夹了未转义的英文双引号），第二次把「严格 JSON」的要求说死再要一次，比换模型便宜
  const STRICT = '\n\n上一次返回的 JSON 无法解析。这次只返回一个合法 JSON 对象：字符串里不要出现英文双引号（引用用「」），不要在字符串里换行，不要尾随逗号，JSON 前后不要任何说明文字。';
  for (const m of [GRADE_MODEL, 'qwen3.7-plus', 'qwen-plus', 'deepseek-v4-pro'].filter((x, i, a) => a.indexOf(x) === i)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await generateContent(prompt + (attempt ? STRICT : ''), m, { jsonMode: true });
        await logTokenUsage({ tool_name: 'work', task_name, institution: institution || '', model_id: m, usageMetadata: res.usageMetadata } as any).catch(() => {});
        const p = parseJsonLoose(res.text); if (!p || typeof p !== 'object') throw new Error('不是 JSON'); return p;
      } catch (e) { lastErr = e; const msg = String((e as any)?.message); console.warn(`[work-grade] ${m}${attempt ? '（严格重试）' : ''} 失败：${msg.slice(0, 120)}`); if (!/JSON/.test(msg)) break; }
    }
  }
  throw lastErr;
}

export interface ResultItem { id: string; title: string; weight: number; score: number; level: 'L1' | 'L2' | 'L3' | 'L4'; evidence: string; note: string; blocked_by?: string }
export interface ResultReport { total: number; items: ResultItem[]; summary: string; strengths: string[]; gaps: string[]; who?: string }

/** 结果：rubric 逐条，每条引用交付物原句当证据；前置条目没做到的，后置条目封顶 L2 */
export async function gradeResult(task: WorkTask, deliverable: string, opts: { institution?: string; who?: string } = {}): Promise<ResultReport> {
  const prompt = `你是「真活台」的评卷 agent。按 rubric 逐条评这份交付物，每条必须引用交付物里的原句当证据（没有就写「未见」），给 BARS 等级 L1–L4 和 0–100 分。只看交付物和材料，不脑补。
## 任务书
${task.task.brief}
## 交付物要求
${task.task.deliverables.map(d => `- ${d.id} ${d.title}（${d.format}）`).join('\n')}
## 材料（判断事实与假设是否标注用）
${task.materials.map(m => `### ${m.id} ${m.title}\n${m.content.slice(0, 1500)}`).join('\n\n')}
## rubric
${task.rubric.map(r => `- ${r.id} ${r.title}（权重 ${r.weight}${r.depends_on.length ? '，依赖 ' + r.depends_on.join('/') : ''}）：${r.desc}\n  依据：${r.basis}\n  L1 ${r.levels.L1} | L2 ${r.levels.L2} | L3 ${r.levels.L3} | L4 ${r.levels.L4}`).join('\n')}
${task.task.stages?.length ? `## 推进步骤与参考答案（候选人看不到；测算按 value 核对，误差 ±5% 内算对；判断题看结论和理由是否成立，不要求措辞一致）\n${task.task.stages.map(st => `- ${st.id} 问：${st.question}\n  参考：${st.expected}${st.calc?.length ? `\n  数：${st.calc.map(c => `${c.label} = ${c.expr} = ${c.value}`).join('；')}` : ''}`).join('\n')}\n` : ''}## 交付物
${deliverable.slice(0, 12000)}

只返回 JSON：{ "items": [ { "id": "r1", "score": 0, "level": "L1", "evidence": "引用原句", "note": "一句为什么" } ], "summary": "三句话总评（观察到什么，不下定性）", "strengths": ["", ""], "gaps": ["", ""] }`;
  const p = await askJson(prompt, 'Grade · 结果', opts.institution);
  const got = new Map<string, any>((Array.isArray(p.items) ? p.items : []).map((x: any) => [String(x.id), x]));
  const items: ResultItem[] = task.rubric.map(r => {
    const x = got.get(r.id) || {};
    const lv = (['L1', 'L2', 'L3', 'L4'].includes(x.level) ? x.level : 'L1') as ResultItem['level'];
    return { id: r.id, title: r.title, weight: r.weight, score: Math.max(0, Math.min(100, Number(x.score) || 0)), level: lv, evidence: s(x.evidence, 300), note: s(x.note, 200) };
  });
  // 依赖：前置没过（< 50）的，后置封顶 60 / L2，并写明被谁卡住
  const byId = new Map(items.map(i => [i.id, i]));
  for (const r of task.rubric) {
    const me = byId.get(r.id)!; const weak = r.depends_on.filter(d => (byId.get(d)?.score ?? 100) < 50);
    if (weak.length && me.score > 60) { me.score = 60; if (me.level === 'L3' || me.level === 'L4') me.level = 'L2'; me.blocked_by = weak.join('、'); }
  }
  const total = Math.round(items.reduce((a, i) => a + i.score * i.weight, 0) / (items.reduce((a, i) => a + i.weight, 0) || 1));
  return { total, items, summary: s(p.summary, 500), strengths: (Array.isArray(p.strengths) ? p.strengths : []).slice(0, 4).map((x: any) => s(x, 120)), gaps: (Array.isArray(p.gaps) ? p.gaps : []).slice(0, 4).map((x: any) => s(x, 120)), who: opts.who };
}

/** 六维人机协作技能（先定小的，别一上来 29 项；每维给 BARS 等级 + 一句观察） */
export const SKILL_DIMS = ['问题界定', '信息核验', 'AI 协作', '判断取舍', '交付表达', '风险意识'] as const;
export interface ProcessReport {
  duration_s: number; phases: { from: number; to: number; label: string }[];
  highlights: { t: number; behavior: string; evidence: string; skill: string }[];
  risks: { t: number; behavior: string; evidence: string; skill: string }[];
  skills: Record<string, { level: 'L1' | 'L2' | 'L3' | 'L4'; note: string }>;
  delegation: string;   // 哪些是自己判断的、哪些交给了 AI
  stats: Record<string, number>;
}

export interface WorkEvent { t: number; type: string; [k: string]: any }

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** 过程：事件流 → 阶段 / 高光 / 风险 / 六维。事件来自站内工作台（打开材料、问 AI、采纳、粘贴、改稿、空闲、交卷） */
export async function analyzeProcess(task: WorkTask, events: WorkEvent[], aiChat: { t: number; q: string; a: string }[], deliverable: string, opts: { institution?: string; audit?: { idx: number; from: number; to: number; label: string; so_far: string; observations: { t: number; skill: string; signal: string; note: string }[] }[] } = {}): Promise<ProcessReport> {
  const ev = [...events].sort((a, b) => a.t - b.t);
  const duration = Math.round(ev.length ? ev[ev.length - 1].t : 0);
  const stats: Record<string, number> = {};
  for (const e of ev) stats[e.type] = (stats[e.type] || 0) + 1;
  stats.ai_asks = aiChat.length; stats.materials_opened = new Set(ev.filter(e => e.type === 'open_material').map(e => e.id)).size; stats.materials_total = task.materials.length;
  stats.paste_chars = ev.filter(e => e.type === 'paste').reduce((a, e) => a + (Number(e.chars) || 0), 0);
  stats.typed_chars = ev.filter(e => e.type === 'edit').reduce((a, e) => a + Math.max(0, Number(e.delta) || 0), 0);
  stats.deliverable_chars = deliverable.length;
  const lines = ev.slice(0, 400).map(e => `[${fmt(e.t)}] ${e.type}${e.id ? ' ' + e.id : ''}${e.chars ? ` ${e.chars}字` : ''}${e.delta != null ? ` Δ${e.delta}` : ''}${e.host ? ' ' + e.host : ''}${e.note ? ' ' + s(e.note, 80) : ''}${e.text ? ' 「' + s(e.text, 160) + '」' : ''}`);
  const chat = aiChat.slice(0, 40).map(c => `[${fmt(c.t)}] 问：${s(c.q, 300)}\n   答（摘）：${s(c.a, 200)}`);
  const prompt = `你是「真活台」的过程分析 agent。只看事件流和 AI 对话，判断这个人做题的过程：什么是他自己判断的、什么交给了 AI、有没有核验材料、有没有发现材料里的坑。措辞用「观察到…」，每条高光 / 风险必须指向具体时刻和证据。
## 任务（操作台：${task.env?.type || 'doc'}）
${task.task.title}：${task.task.brief.slice(0, 600)}
事件类型含义：open_material 打开材料 · ai_ask 问 AI · adopt 把 AI 的话放进交付物 · paste 粘贴 · edit 自己改稿（Δ字数）· run_tests 跑自测（note 里是通过数）· set_param 改设计参数 · sketch 画草图 · idle 空闲超过 2 分钟 · submit 交卷 · 真活插件：plugin_start/plugin_stop 开始 / 结束记录 · visit 打开或切到某个网页（host · 标题）· page 网页上读到的文字（摘）· edit 在网页里打字（Δ字数）· paste 粘贴 · copy 复制 · 和 AI 的对话里「插件读到的 xx 页面」是候选人在外部 AI 网站上的对话原文（问和答混在一起，按语义区分）
开放模式（用自己的软件做）：download 下载材料 · rec_start / rec_stop 录屏起止 · screen 录屏抽帧看图得到的描述（note = 软件 · 动作 · 看到的内容，这是主要的过程证据）· file 上传交付文件
材料里故意留的坑（看他有没有发现）：${task.materials.filter(m => m.source !== 'db').map(m => m.id + ' ' + m.title).join('、') || '无标注'}
## 统计
${Object.entries(stats).map(([k, v]) => `${k}=${v}`).join('，')}；总时长 ${fmt(duration)}
## 事件流
${lines.join('\n')}
## 和 AI 的对话
${chat.join('\n') || '（没有问过 AI）'}
## 交付物开头
${deliverable.slice(0, 800)}
${opts.audit?.length ? `## 分段审计笔记（边看边记的，总评要和它连续：可以修正，但别无视）\n${opts.audit.map(a => `第 ${a.idx + 1} 段 ${fmt(a.from)}–${fmt(a.to)} ${a.label}：${a.so_far}` + a.observations.map(o => `\n  - [${fmt(o.t)}] ${o.signal} ${o.skill}：${o.note}`).join('')).join('\n')}\n` : ''}
六个维度：${SKILL_DIMS.join('、')}。BARS：L1 没有表现 / L2 零星 / L3 稳定 / L4 主动且有依据。
只返回 JSON：{ "phases": [ { "from": 0, "to": 300, "label": "读材料" } ], "highlights": [ { "t": 120, "behavior": "", "evidence": "", "skill": "信息核验" } ], "risks": [ { "t": 0, "behavior": "", "evidence": "", "skill": "" } ], "skills": { "问题界定": { "level": "L2", "note": "" } }, "delegation": "两三句：哪些自己做的、哪些交给 AI 的、采纳时有没有核" }`;
  const p = await askJson(prompt, 'Grade · 过程', opts.institution);
  const skills: ProcessReport['skills'] = {};
  for (const d of SKILL_DIMS) { const x = p.skills?.[d] || {}; skills[d] = { level: (['L1', 'L2', 'L3', 'L4'].includes(x.level) ? x.level : 'L1'), note: s(x.note, 160) }; }
  const pick = (arr: any) => (Array.isArray(arr) ? arr : []).slice(0, 6).map((h: any) => ({ t: Math.max(0, Number(h.t) || 0), behavior: s(h.behavior, 160), evidence: s(h.evidence, 200), skill: s(h.skill, 20) }));
  return { duration_s: duration, phases: (Array.isArray(p.phases) ? p.phases : []).slice(0, 8).map((x: any) => ({ from: Number(x.from) || 0, to: Number(x.to) || 0, label: s(x.label, 30) })), highlights: pick(p.highlights), risks: pick(p.risks), skills, delegation: s(p.delegation, 400), stats };
}

/**
 * AI 使用能力（2026-10-30，潜历：主打用发任务的方式招会用 AI 的人）：和结果分并列的一项 0–100。
 * 证据全来自过程：每一轮问了什么、AI 答了什么、哪些被采纳进交付物、采纳后自己改了多少、问之前看没看材料。
 * 五个子项各 0–100 + 指到时刻的证据；硬指标（问几次、追问几次、采纳几次、交付物里原样来自 AI 的比例）程序算。没用 AI 的不打分（score = null）。
 */
export const AI_USE_ITEMS = [
  { key: 'ask', title: '提问', desc: '会不会拆问题、给足上下文（材料里的数字、约束）、追问到点上' },
  { key: 'verify', title: '核验', desc: 'AI 的回答有没有对照材料核对，发现 AI 说错、说漏、编数字' },
  { key: 'select', title: '取舍', desc: '采纳什么、丢掉什么，理由站得住；不照单全收' },
  { key: 'divide', title: '分工', desc: '让 AI 干体力活（整理、起草、算），关键判断自己做' },
  { key: 'integrate', title: '整合', desc: 'AI 的内容改写融进自己的交付物，口径一致，不是原样贴' },
] as const;
export interface AiUseReport {
  score: number | null; level: 'L1' | 'L2' | 'L3' | 'L4' | null; verdict: string;
  /** 照哪份标准评的（这家企业 / 这个岗位的 AI 使用标准）；没有标准时按通用口径 */
  standard?: { stance: string; summary: string; weights: Record<string, number> } | null;
  /** 碰了治理红线：程序查到的（贴了手机号 / 身份证…）+ 对照标准判断的；每条扣 8 分，最多 24 */
  violations?: { t: number; what: string; quote: string; by: 'program' | 'review' }[];
  raw_score?: number | null;
  items: { key: string; title: string; score: number; note: string; evidence: { t: number; quote: string }[] }[];
  stats: { asks: number; followups: number; adopted: number; adopted_chars: number; verbatim_ratio: number; first_ask_s: number | null; materials_before_first_ask: number };
}
/** 交付物里原样来自 AI 回答的比例：交付物按句切，长度 ≥ 14 的句子在任一 AI 回答里原样出现就算 */
function verbatimRatio(deliverable: string, answers: string[]) {
  const sents = deliverable.split(/[。！？\n；;]+/).map(x => x.replace(/\s+/g, '').trim()).filter(x => x.length >= 14);
  if (!sents.length) return 0;
  const pool = answers.map(a => a.replace(/\s+/g, ''));
  const hit = sents.filter(x => pool.some(a => a.includes(x))).reduce((n, x) => n + x.length, 0);
  return Math.round((hit / sents.reduce((n, x) => n + x.length, 0)) * 100);
}
/** 这道任务的 AI 使用标准：存在 work_tasks.task.ai_policy；没有就按依据现生成、存回去（t 是 work_tasks 的整行） */
export async function ensureAiPolicy(t: any): Promise<AiPolicy | null> {
  if (t?.task?.ai_policy?.v) return t.task.ai_policy as AiPolicy;
  try {
    const task = { env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials || [], rubric: t.rubric || [] } as any;
    const policy = await buildAiPolicy(task, t.context || {}, askJson);
    const { data: now } = await db.from('work_tasks').select('task').eq('id', t.id).single();
    await db.from('work_tasks').update({ task: { ...(now?.task || t.task), ai_policy: policy } }).eq('id', t.id);
    return policy;
  } catch (e) { console.warn('[work-grade] AI 使用标准没生成出来，按通用口径评', String((e as any)?.message).slice(0, 120)); return null; }
}

export async function analyzeAiUse(task: WorkTask, events: WorkEvent[], aiChat: { t: number; q: string; a: string }[], deliverable: string, opts: { institution?: string; policy?: AiPolicy | null } = {}): Promise<AiUseReport> {
  const pol = opts.policy || null;
  const ev = [...events].sort((a, b) => a.t - b.t);
  const chat = [...aiChat].sort((a, b) => a.t - b.t);
  const adopts = ev.filter(e => e.type === 'adopt');
  const firstAsk = chat[0]?.t ?? null;
  const stats: AiUseReport['stats'] = {
    asks: chat.length,
    // 追问：和上一问隔不到 3 分钟、中间没交付物大改的，算接着上一轮问
    followups: chat.filter((c, i) => i > 0 && c.t - chat[i - 1].t < 180).length,
    adopted: adopts.length, adopted_chars: adopts.reduce((n, e) => n + (Number(e.chars) || 0), 0),
    verbatim_ratio: verbatimRatio(deliverable, chat.map(c => c.a || '')),
    first_ask_s: firstAsk, materials_before_first_ask: new Set(ev.filter(e => e.type === 'open_material' && (firstAsk == null || e.t <= firstAsk)).map(e => e.id)).size,
  };
  // 开放模式 / 插件：AI 用在他自己的工具里（ChatGPT、Copilot…），只能从录屏描述和插件事件里看
  const outside = ev.filter(e => (e.type === 'screen' || /^plugin_/.test(e.type)) && /AI|GPT|Copilot|Claude|千问|豆包|Kimi|DeepSeek|文心|智谱|元宝|Gemini|对话|提问|生成/i.test(String(e.note || e.text || e.host || '')));
  const standard = pol ? { stance: STANCE_LABEL[pol.stance.level], summary: pol.summary, weights: pol.weights } : null;
  if (!chat.length && !outside.length) return { score: null, level: null, verdict: pol && pol.stance.level === 'ai_native' ? '这次没用 AI：这家企业期待深度用 AI，这一点要留意。' : '这次没用 AI：全程自己做的。', items: [], stats, standard, violations: [] };
  const flags = hardRedFlags(chat);
  const lines = ev.filter(e => ['open_material', 'ai_ask', 'adopt', 'paste', 'edit', 'submit', 'screen'].includes(e.type) || /^plugin_/.test(e.type)).slice(0, 300)
    .map(e => `[${fmt(e.t)}] ${e.type}${e.id ? ' ' + e.id : ''}${e.chars ? ` ${e.chars}字` : ''}${e.delta != null ? ` Δ${e.delta}` : ''}${e.note ? ' ' + s(e.note, 100) : ''}`);
  const prompt = `你在评一个候选人的「AI 使用能力」：他做一道真实业务任务时，怎么用 AI 助手。企业要招的是会用 AI 的人——不是不用，也不是全交给 AI，而是把 AI 用对。
## 任务
${task.task.title}：${task.task.brief.slice(0, 500)}
材料：${task.materials.map(m => `${m.id} ${m.title}`).join('；')}
## 硬指标（程序算的，照这个说，别自己改数）
问了 ${stats.asks} 次，其中追问 ${stats.followups} 次；把 AI 的回答采纳进交付物 ${stats.adopted} 次（${stats.adopted_chars} 字）；交付物里原样来自 AI 回答的句子占 ${stats.verbatim_ratio}%；第一次问 AI 在 ${firstAsk == null ? '—' : fmt(firstAsk)}，那之前打开过 ${stats.materials_before_first_ask} 份材料。
## 和 AI 的每一轮（按时间）
${chat.slice(0, 40).map(c => `[${fmt(c.t)}] 问：${s(c.q, 400)}\n   答：${s(c.a, 500)}`).join('\n') || '（站内没问过；看下面录屏 / 插件里的外部 AI 使用）'}
## 过程事件（open_material 打开材料 · ai_ask 问 AI · adopt 采纳进交付物 · paste 粘贴 · edit 自己改稿 Δ字数 · screen 录屏看到的）
${lines.join('\n')}
## 交付物（节选）
${deliverable.slice(0, 2500)}

${pol ? `## 这家企业、这个岗位的 AI 使用标准（照它评，不要用你自己的通用口径）
企业对 AI 的态度：${STANCE_LABEL[pol.stance.level]}（${pol.stance.why}）
各环节：${pol.stages.map(x => `${x.stage}【${USE_LABEL[x.use]}】${x.why}`).join('；')}
用得好的样子：${pol.good.map(x => x.text).join('；')}
治理红线：${pol.red_lines.map(x => x.text).join('；') || '（无）'}
${pol.summary}
` : ''}${flags.length ? `程序查到问 AI 时贴了：${flags.map(f => `${fmt(f.t)} ${f.what}`).join('、')}\n` : ''}
五个子项各打 0–100，每项一句观察 + 1–2 条证据（证据写时刻和原话 / 原文片段）：
${AI_USE_ITEMS.map(i => `- ${i.key} ${i.title}：${i.desc}`).join('\n')}
打分口径：90+ 主动、有依据、能纠 AI 的错；75 稳定会用；60 会用但照单全收较多；40 以下 基本是把题丢给 AI 或问得很空。原样照搬比例高、AI 编的数字被直接写进交付物，核验和整合要明显扣分。
${pol ? '对照标准：在「不能用 / 慎用」的环节把判断整个交给 AI、碰了治理红线，分工和核验要扣；在「鼓励用」的环节完全不用，提问和整合也不该给高分。red_line_hits 只写确实碰了上面红线的时刻（没有就空数组）。\n' : ''}措辞用「观察到…」。verdict 一句话总评（30–60 字），说清他是怎么用 AI 的${pol ? '，以及合不合这家企业的标准' : ''}。只返回 JSON：
{ "items": [ { "key": "ask", "score": 0, "note": "", "evidence": [ { "t": 0, "quote": "" } ] } ], "red_line_hits": [ { "t": 0, "what": "碰了哪条红线", "quote": "" } ], "verdict": "" }`;
  const p = await askJson(prompt, 'Grade · AI 使用', opts.institution);
  const items = AI_USE_ITEMS.map(i => {
    const x = (Array.isArray(p.items) ? p.items : []).find((y: any) => y?.key === i.key) || {};
    return { key: i.key, title: i.title, score: Math.max(0, Math.min(100, Math.round(Number(x.score) || 0))), note: s(x.note, 200), evidence: (Array.isArray(x.evidence) ? x.evidence : []).slice(0, 2).map((e: any) => ({ t: Math.max(0, Number(e?.t) || 0), quote: s(e?.quote, 160) })) };
  });
  // 按标准的权重加权（没有标准就平均）；碰红线每条扣 8，最多 24
  const w: Record<string, number> = pol?.weights || { ask: 20, verify: 20, select: 20, divide: 20, integrate: 20 };
  const raw = Math.round(items.reduce((n, i) => n + i.score * (w[i.key] ?? 20), 0) / (items.reduce((n, i) => n + (w[i.key] ?? 20), 0) || 1));
  const violations: NonNullable<AiUseReport['violations']> = [
    ...flags.map(f => ({ t: f.t, what: `问 AI 时贴了${f.what}`, quote: f.quote, by: 'program' as const })),
    ...(pol?.red_lines.length && Array.isArray(p.red_line_hits) ? p.red_line_hits : []).slice(0, 4).map((h: any) => ({ t: Math.max(0, Number(h?.t) || 0), what: s(h?.what, 80), quote: s(h?.quote, 120), by: 'review' as const })).filter((h: any) => h.what),
  ].slice(0, 6);
  const score = Math.max(0, raw - Math.min(24, violations.length * 8));
  return { score, raw_score: raw, level: score >= 90 ? 'L4' : score >= 75 ? 'L3' : score >= 60 ? 'L2' : 'L1', verdict: s(p.verdict, 180), items, stats, standard, violations };
}

/** 整份报告：结果 + 过程 + AI 使用能力 + 和 AI 基线逐条比 */
export async function buildReport(task: WorkTask, baseline: { result?: ResultReport } | null, deliverable: string, events: WorkEvent[], aiChat: { t: number; q: string; a: string }[], institution?: string, audit?: any[], policy?: AiPolicy | null) {
  const [result, process, ai_use] = await Promise.all([gradeResult(task, deliverable, { institution, who: '候选人' }), analyzeProcess(task, events, aiChat, deliverable, { institution, audit }),
    analyzeAiUse(task, events, aiChat, deliverable, { institution, policy }).catch(e => { console.warn('[work-grade] AI 使用能力没评出来', String(e?.message).slice(0, 120)); return null; })]);
  const b = baseline?.result;
  const compare = b ? { baseline_total: b.total, delta: result.total - b.total, items: result.items.map(i => ({ id: i.id, title: i.title, mine: i.score, baseline: b.items.find(x => x.id === i.id)?.score ?? null })) } : null;
  return { result, process, ai_use, compare, generated_at: new Date().toISOString() };
}
