/**
 * 真活台 · 评价（2026-10-18）：结果按 rubric 逐条（带证据、BARS 等级、尊重依赖关系），过程按事件流（阶段 / 高光 / 风险 / 六维人机协作技能），
 * 再和 AI 基线逐条比。措辞克制：写「观察到」，不写「具备 / 不具备」——评估是危险的东西，先只做练习与预筛。
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import type { WorkTask } from '@/lib/work/generator';

const GRADE_MODEL = process.env.WORK_GRADE_MODEL || 'claude-opus-5-5';
const s = (v: any, n = 600) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);

async function askJson(prompt: string, task_name: string, institution?: string): Promise<any> {
  let lastErr: any = null;
  // 每个模型两次机会：第一次解析失败（常见是字符串里夹了未转义的英文双引号），第二次把「严格 JSON」的要求说死再要一次，比换模型便宜
  const STRICT = '\n\n上一次返回的 JSON 无法解析。这次只返回一个合法 JSON 对象：字符串里不要出现英文双引号（引用用「」），不要在字符串里换行，不要尾随逗号，JSON 前后不要任何说明文字。';
  for (const m of [GRADE_MODEL, 'claude-sonnet-5-5', 'qwen-plus']) {
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

/** 整份报告：结果 + 过程 + 和 AI 基线逐条比 */
export async function buildReport(task: WorkTask, baseline: { result?: ResultReport } | null, deliverable: string, events: WorkEvent[], aiChat: { t: number; q: string; a: string }[], institution?: string, audit?: any[]) {
  const [result, process] = await Promise.all([gradeResult(task, deliverable, { institution, who: '候选人' }), analyzeProcess(task, events, aiChat, deliverable, { institution, audit })]);
  const b = baseline?.result;
  const compare = b ? { baseline_total: b.total, delta: result.total - b.total, items: result.items.map(i => ({ id: i.id, title: i.title, mine: i.score, baseline: b.items.find(x => x.id === i.id)?.score ?? null })) } : null;
  return { result, process, compare, generated_at: new Date().toISOString() };
}
