/**
 * 潜历「AI 驾驭能力」量表（7 维度 · 25 行为 · v3 26b 汇总版）在真活平台上的实现。
 * 量表本身在 spec-v3.json（scripts/fluency-spec.mts 从 xlsx 抽出来，不手改）；这里是取证和计分，逐条对照量表的页码：
 *   06 预处理 → 01 正则 + 生效窗口取候选 → 模型判成立 + 按 03 页锚点定档 → 05 互斥仲裁 / 超级 Prompt 归并
 *   → 04 负向 N1–N13 → 02 行为分 / 维度分 / 总分 / 置信级 → 07 任务类型与 C_elig。
 * 平台上的数据源：D1 = 和站内 AI 助手的每一轮（ai_chat），D5 = 交付物 + 交卷时的「AI 参与说明」，过程事件（采纳 / 粘贴 / 自己改稿）做 B23 的辅证。
 * 宇宁的 ai_fluency_v2.py 是参考实现，口径不一致的地方以 xlsx 为准，写在 docs 交接文档里。
 */
import spec from './spec-v3.json';
import extraPatterns from './patterns-extra.json';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';

export const FLUENCY_VERSION = 'v3-26b · engine 2026-11-20（任务块 · 窗口按块）';
const MODEL = process.env.FLUENCY_MODEL || process.env.WORK_GRADE_MODEL || 'claude-opus-5-5';

type Spec = typeof spec;
type BehaviorSpec = Spec['behaviors'][keyof Spec['behaviors']] & { patterns: { label: string; re: string }[] };
export const DIMS = spec.dimensions as Record<string, { name: string; en: string; desc: string; question: string; behaviors: string[] }>;
export const BEHAVIORS = spec.behaviors as unknown as Record<string, BehaviorSpec>;
export const BIDS = Object.keys(BEHAVIORS);

export interface ChatTurn { t: number; q: string; a: string }
export interface FluencyInput {
  task: { title: string; brief: string; rules?: string[]; materials: { id?: string; title: string; content?: string }[]; lang?: string };
  chat: ChatTurn[]; events: { t: number; type: string; [k: string]: any }[]; deliverable: string;
  mode?: 'bench' | 'open' | 'plugin'; institution?: string;
  /** 同一道题已经判过的任务画像，批量重跑时传进来省一次调用 */
  profile?: TaskProfile | null;
  /** false = 不写解读（只要分数时省一次调用） */
  narrate?: boolean;
  /** 评法（11-20）：默认 v3（k 按不相邻几段数）；'v3-spec' = 照 02 页「同块同行为 1 条、k=b=1 封顶」（单任务作答会全部封顶，对照用）；'committee' = 评审团。线上没切之前都走默认 */
  engine?: 'v3' | 'v3-spec' | 'committee';
  /** 站内没问过 AI、但在自己电脑上用了外部 AI：从截图 / 插件网页抽出来的提问原话（lib/work/outside-asks），没有 AI 的回答 */
  outside?: { asks: { t: number; q: string; complete: boolean; src: string }[]; note: string } | null;
}

// ─────────── 06 预处理：归一化 + 引用块 ───────────
/** 只作用于匹配副本：全角转半角、撇号统一、小写、去零宽和多余空白；原文留着做引文 */
export function norm(s: string) {
  return (s || '').replace(/[！-～]/g, c => /[０-９Ａ-Ｚａ-ｚ]/.test(c) ? String.fromCharCode(c.charCodeAt(0) - 0xFEE0) : c)
    .replace(/[’‘`]/g, "'").replace(/[​-‍﻿ ]/g, ' ').toLowerCase().replace(/[ \t]+/g, ' ');
}
const squash = (s: string) => (s || '').replace(/\s+/g, '');

/** 和任务书 / 材料原文比：30 字一窗、每 15 字滑一次；返回粘贴占比和剔掉粘贴后的「自述部分」（06 页三：>0.8 且连续 ≥80 字记 quoted） */
function quoteSplit(text: string, source: string) {
  const t = squash(text);
  if (t.length < 80 || !source) return { ratio: 0, self: text };
  const covered = new Array(t.length).fill(false);
  let n = 0, hit = 0;
  for (let i = 0; i + 30 <= t.length; i += 15) { n++; if (source.includes(t.slice(i, i + 30))) { hit++; for (let k = i; k < i + 30; k++) covered[k] = true; } }
  const self = t.split('').filter((_, i) => !covered[i]).join('');
  return { ratio: n ? hit / n : 0, self };
}

// ─────────── 07 任务类型与结构标签 → C_elig ───────────
export interface TaskProfile { type: 'T1' | 'T2' | 'T3' | 'T4' | 'T5'; x: Record<'X1' | 'X2' | 'X3' | 'X4' | 'X5' | 'X6', boolean>; why: string }
const TYPE_INFO: Record<TaskProfile['type'], { name: string; base: number; weak: string[]; zero?: string[] }> = {
  T1: { name: '代码实现', base: 0.86, weak: ['B4', 'B5', 'B8', 'B9', 'B18', 'B20', 'B25'] },
  T2: { name: '文案创作', base: 0.92, weak: ['B4', 'B19'], zero: ['B25'] },
  T3: { name: '数据分析', base: 0.94, weak: ['B4', 'B12', 'B20'] },
  T4: { name: '研究综述', base: 0.96, weak: ['B4', 'B25'] },
  T5: { name: '方案设计', base: 0.94, weak: ['B4', 'B9', 'B19'] },
};
const X_INFO: Record<keyof TaskProfile['x'], { name: string; cut: number; na: string[] }> = {
  X1: { name: '有交付物文件', cut: 0.08, na: ['B21', 'B22'] },
  X2: { name: '多平台可用', cut: 0.04, na: ['B4'] },
  X3: { name: '含外部事实主张', cut: 0.08, na: [] },
  X4: { name: '含受限数据', cut: 0.08, na: ['B19', 'B20'] },
  X5: { name: '有跨领域卡点', cut: 0.04, na: ['B25'] },
  X6: { name: '有明确受众', cut: 0.04, na: ['B8'] },
};
export { TYPE_INFO, X_INFO };

async function profileTask(inp: FluencyInput): Promise<TaskProfile> {
  const src = `${inp.task.title}\n${inp.task.brief.slice(0, 1500)}\n材料：${inp.task.materials.map(m => m.title).join('；')}`;
  const mats = inp.task.materials.map(m => m.content || '').join('\n').slice(0, 20000);
  const pii = /(?<!\d)1[3-9]\d{9}(?!\d)|(?<!\d)\d{17}[\dXx](?!\d)|[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/.test(mats);
  const p = await askJson(`给一道考核任务打两类标签（只看任务本身，不看候选人）。
## 任务
${src}
## 要判的
type：T1 代码实现（写脚本 / 改代码 / 调试）· T2 文案创作（写稿 / 改写）· T3 数据分析（清洗 / 计算 / 图表 / 结论）· T4 研究综述（检索 / 比对 / 成文）· T5 方案设计（需求澄清 / 方案 / 取舍）
X3：任务是否要求引用政策 / 数据 / 文献 / 标准 / API 文档这类外部事实
X4：任务素材是否含个人信息或商业敏感信息（客户名单、内部财务、未公开数据等）
X5：任务里有没有「卡住、需要借鉴其他领域方法」的环节
X6：任务是否指定了汇报对象或读者
只返回 JSON：{"type":"T3","X3":true,"X4":false,"X5":false,"X6":true,"why":"一句话"}`, 'Fluency · 任务画像', inp.institution);
  const type = (['T1', 'T2', 'T3', 'T4', 'T5'].includes(p?.type) ? p.type : 'T5') as TaskProfile['type'];
  return {
    type, why: String(p?.why || '').slice(0, 120),
    // X1：平台上交卷必须有交付物；X2：站内只有一个 AI 助手，开放模式 / 插件在自己电脑上做、能自由换工具才算多平台
    x: { X1: (inp.deliverable || '').trim().length >= 50, X2: inp.mode === 'open' || inp.mode === 'plugin', X3: !!p?.X3, X4: !!p?.X4 || pii, X5: !!p?.X5, X6: !!p?.X6 },
  };
}

function cElig(p: TaskProfile) {
  const info = TYPE_INFO[p.type];
  const missing = (Object.keys(X_INFO) as (keyof TaskProfile['x'])[]).filter(k => !p.x[k]);
  const v = Math.round((info.base - missing.reduce((s, k) => s + X_INFO[k].cut, 0)) * 100) / 100;
  return { value: v, missing };
}

// ─────────── 06 锚点 ───────────
const TASK_VERB = /(分析|写|做|改|算|查|整理|设计|翻译|核对|生成|列|画|拟|汇总|计算|统计|评估|总结|起草|编写|实现|debug|调试|write|draft|analy[sz]e|build|fix|calculate|summari[sz]e|design)/i;
const OUT_REQ = /(给我|输出|生成|写一份|写一个|写个|写一版|整理成|做成|做一份|做一个|列出|列成|起草|帮我写|帮我做|帮我整理|帮我算|帮我生成|export|give me|write (me )?an?|draft an?|generate|produce|create)/i;
const CONSULT = /(怎么做|你觉得呢|帮我想想|有什么思路|什么方法|怎么看|该怎么|如何|吗[？?]?$|what do you think|how should|any ideas)/i;
const NEGATE = /^\s*(不对|不是|错了|重来|不行|不要|no[,. ]|wrong)/i;
interface Anchors { P1: number | null; O1: number | null; Aout: number | null; Olast: number | null; Afinal: number | null; /** 块内第几条（从 0 起）、所在块有几条用户消息（11-20 窗口按块） */ rel?: number[]; size?: number[] }

/**
 * 任务块（11-20 潜历复盘 4.1 第 1 条：先切任务块，再跑指标；窗口按块、同块同行为只算 1 条、跨块才算独立证据）。
 * 平台上不靠措辞猜：块 = 当时在做的子任务——推进式题解锁到第几步 × 正在做哪份交付物（回到之前的交付物算回到同一块）；
 * 外部 AI 的提问（录屏 / 插件抽出来的）按用的是哪个工具分（换工具 = 硬边界）。AI 工作台的题一般只有一块。
 */
export interface TaskBlock { id: number; label: string; msgs: number[] }
export function taskBlocks(chat: ChatTurn[], events: { t: number; type: string; [k: string]: any }[], srcs?: string[] | null): { of: number[]; list: TaskBlock[] } {
  const ev = [...events].filter(e => e.type === 'stage_unlock' || e.type === 'switch_part').sort((x, y) => x.t - y.t);
  const hasStage = ev.some(e => e.type === 'stage_unlock');
  const keyAt = (t: number, i: number) => {
    if (srcs) return `外部 AI · ${srcs[i] || '未知工具'}`;
    let st = '', pt = '';
    for (const e of ev) { if (e.t > t) break; if (e.type === 'stage_unlock' && e.id) st = String(e.id); if (e.type === 'switch_part' && e.id) pt = String(e.id); }
    return [hasStage ? (st || '第 1 步').toUpperCase() : '', pt || 'd1'].filter(Boolean).join(' · ');
  };
  const ids = new Map<string, number>(), list: TaskBlock[] = [];
  const of = chat.map((c, i) => { const k = keyAt(c.t, i); if (!ids.has(k)) { ids.set(k, list.length); list.push({ id: list.length, label: k, msgs: [] }); } const b = ids.get(k)!; list[b].msgs.push(i); return b; });
  return { of, list };
}
function anchorsOf(chat: ChatTurn[]): Anchors {
  const isReq = (q: string) => OUT_REQ.test(q) && !(CONSULT.test(q) && !/(给我|写一份|做成|整理成|生成)/.test(q));
  const isOut = (a: string) => (a || '').length >= 150 || /```|\n\|.+\|/.test(a || '');
  let P1: number | null = null, O1: number | null = null, Aout: number | null = null, Olast: number | null = null, Afinal: number | null = null;
  chat.forEach((c, i) => {
    if (P1 == null && TASK_VERB.test(c.q)) P1 = i;
    if (isReq(c.q)) { if (O1 == null) O1 = i; Olast = i; }
    if (O1 != null && i >= O1 && isOut(c.a) && !(chat[i + 1] && NEGATE.test(chat[i + 1].q))) { if (Aout == null) Aout = i; Afinal = i; }
  });
  return { P1, O1, Aout, Olast, Afinal };
}

// ─────────── 01 取候选：正则 + 生效窗口 ───────────
export interface Candidate { bid: string; src: 'chat' | 'deliverable' | 'disclosure' | 'event'; i: number; quote: string; rule: string; quoted?: boolean }
const rx = (s: string) => new RegExp(s, 'is');
// xlsx 词表 + 宇宁补的中文说法（patterns-extra.json，11-17 她按样本补的）：命中只是候选，成不成立由模型判
const EXTRA = extraPatterns as unknown as Record<string, { label: string; re: string }[]>;
const PAT: Record<string, { label: string; re: RegExp }[]> = Object.fromEntries(BIDS.map(b => [b, [...BEHAVIORS[b].patterns, ...(Array.isArray(EXTRA[b]) ? EXTRA[b] : [])].map(p => ({ label: p.label, re: rx(p.re) }))]));
const pat = (bid: string, label: string) => PAT[bid].find(p => p.label === label)?.re;
const PLATFORM = [pat('B3', 'CN1')!, pat('B3', 'EN1')!];
const platforms = (s: string) => new Set(PLATFORM.flatMap(re => [...s.matchAll(new RegExp(re.source, 'gis'))].map(m => m[0].toLowerCase())));
/** 文本上要剔掉引用块的四项（06 页三：不参与 B1/B2/B7/B19 的自发证据） */
const SELF_ONLY = new Set(['B1', 'B2', 'B7', 'B19']);
/** 用户消息少于 4 条，这四项自动 N/A（07 页三 · 06 页四） */
const NEED_4 = new Set(['B10', 'B15', 'B16', 'B17']);

function firstHit(bid: string, text: string): { m: RegExpMatchArray; label: string } | null {
  const t = norm(text);
  if (bid === 'B3') {
    for (const [a, b] of [['CN1', 'CN2'], ['EN1', 'EN2']]) { const x = t.match(pat('B3', a)!), y = t.match(pat('B3', b)!); if (x && y) return { m: x, label: `${a}∩${b}` }; }
    return null;
  }
  if (bid === 'B4') {
    if (platforms(t).size < 2) return null;
    for (const l of ['CN2', 'EN2']) { const y = t.match(pat('B4', l)!); if (y) return { m: y, label: `≥2平台∩${l}` }; }
    return null;
  }
  if (bid === 'B19') { const y = t.match(pat('B19', '脱敏')!); return y ? { m: y, label: '脱敏' } : null; }   // PII 本身走负向 N1
  for (const p of PAT[bid]) { const m = t.match(p.re); if (m) return { m, label: p.label }; }
  return null;
}

function inWindow(bid: string, i: number, a: Anchors): boolean {
  const r = a.rel ? a.rel[i] : i;   // 块内第几条（11-20）
  switch (bid) {
    case 'B1': return r < 2;
    case 'B14': return r >= 1;
    case 'B3': return a.P1 == null || i <= a.P1;
    case 'B5': return a.O1 == null || i < a.O1;
    case 'B11': return r < 5;
    case 'B10': return r >= 2;
    case 'B12': return a.Aout == null || i <= a.Aout;
    case 'B17': return a.Aout != null && i > a.Aout;
    case 'B23': return a.Afinal != null && i > a.Afinal;
    case 'B24': return a.Olast == null || i >= a.Olast;
    case 'B21': case 'B22': return false;   // 只扫交付侧，不扫和 AI 的对话
    default: return true;
  }
}

function locate(inp: FluencyInput, a: Anchors, source: string, disclosure: string) {
  const out: Candidate[] = [];
  const split = inp.chat.map(c => quoteSplit(c.q, source));
  inp.chat.forEach((c, i) => {
    for (const bid of BIDS) {
      if (!inWindow(bid, i, a)) continue;
      if (NEED_4.has(bid) && (a.size ? a.size[i] : inp.chat.length) < 4) continue;   // 单块 < 4 条用户消息 → 这四项 N/A（06 页四）
      const quoted = split[i].ratio > 0.8;
      const text = SELF_ONLY.has(bid) && split[i].ratio >= 0.5 ? split[i].self : c.q;
      if (SELF_ONLY.has(bid) && quoted && split[i].self.length < 20) continue;
      const h = firstHit(bid, text);
      if (h) out.push({ bid, src: 'chat', i, quote: snippet(text, h.m.index || 0, h.m[0].length), rule: `${bid}-${h.label}`, quoted });
    }
  });
  // B21 / B22：交付物正文 + 交卷时的「AI 参与说明」（量表里的表单 S1）
  for (const [src, text] of [['deliverable', inp.deliverable || ''], ['disclosure', disclosure]] as const) {
    if (!text.trim()) continue;
    for (const bid of ['B21', 'B22']) { const h = firstHit(bid, text); if (h) out.push({ bid, src, i: -1, quote: snippet(text, h.m.index || 0, h.m[0].length), rule: `${bid}-${h.label}` }); }
  }
  if (disclosure.trim() && !out.some(c => c.src === 'disclosure')) out.push({ bid: 'B21', src: 'disclosure', i: -1, quote: disclosure.slice(0, 120), rule: 'B21-表单S1' });
  // B23 辅证（07 页：交付物可见的微调 / 回读即强）：AI 内容进交付物之后，他自己又改了多少
  const ev = [...inp.events].sort((x, y) => x.t - y.t);
  const lastIn = [...ev].reverse().find(e => e.type === 'adopt' || e.type === 'paste');
  if (lastIn) {
    const after = ev.filter(e => e.t > lastIn.t && e.type === 'edit');
    const delta = after.reduce((n, e) => n + Math.abs(Number(e.delta) || 0), 0);
    if (after.length && delta >= 20) out.push({ bid: 'B23', src: 'event', i: -1, quote: `AI 内容最后一次进交付物（${lastIn.type === 'adopt' ? '采纳' : '粘贴'}）之后，他自己又改了 ${after.length} 次、约 ${delta} 字（约占交付物 ${Math.round(delta / Math.max(1, (inp.deliverable || '').length) * 100)}%）`, rule: 'B23-事件:采纳后自改' });
  }
  // 工具事件（量表 D3，有则加强）：操作台上跑测试、交卷前自查
  const tools = ev.filter(e => e.type === 'run_tests' || e.type === 'self_check');
  if (tools.length) out.push({ bid: 'B23', src: 'event', i: -2, quote: `提交前在操作台上${ev.some(e => e.type === 'run_tests') ? `跑了 ${ev.filter(e => e.type === 'run_tests').length} 次测试` : ''}${ev.some(e => e.type === 'self_check') ? `做了 ${ev.filter(e => e.type === 'self_check').length} 次自查` : ''}`, rule: 'B23-事件:测试/自查' });
  // 数字的来路（11-22，聊天考试台「不说出口的核查」）：交付物里有几个数字直接取自材料、AI 的回答里没有——他自己回到材料核过或算过。
  // 模拟数据里这一项能把新手分出来（新手平均 1 个，资深 / 一般 6–7 个），资深和一般分不开，要等真人数据看；只作证据候选，成不成立、几档由模型判
  {
    const numsOf = (t: string) => { const out = new Set<string>(); for (const m of String(t || '').matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d{2,})/g)) { const v = m[1].replace(/,/g, ''); if (/^(19|20)\d\d$/.test(v)) continue; out.add(v); } return out; };
    const M = numsOf(inp.task.materials.map(m => m.content || '').join('\n')), A = numsOf(inp.chat.map(c => c.a).join('\n')), D = numsOf(inp.deliverable);
    const own = [...D].filter(v => M.has(v) && !A.has(v));
    const reread = ev.filter(e => e.type === 'open_material' && e.t > (inp.chat[0]?.t ?? Infinity)).length;
    if (own.length >= 3) out.push({ bid: 'B13', src: 'event', i: -3, quote: `交付物里有 ${own.length} 个数字直接取自材料、AI 的回答里没有（如 ${own.slice(0, 4).join('、')}）${reread ? `；问过 AI 之后回看材料 ${reread} 次` : ''}`, rule: 'B13-事件:数字自己从材料取' });
  }
  // AI 工作台（11-17）：人自己动手的动作是平台直接记下的，不靠说出口——资深的人「自己核、不跟 AI 说」也看得到
  const tAsk = inp.chat[0]?.t ?? 0;
  const ag = ev.filter(e => /^(ws_|agent_|change_)/.test(e.type) && (e.t >= tAsk || e.type === 'agent_mode'));   // 协作开关常在第一次提问前就设好
  const paths = (xs: any[]) => [...new Set(xs.map(e => String(e.note || '')).filter(Boolean))].slice(0, 4).join('、');
  let k = -10;
  const runs = ag.filter(e => e.type === 'ws_run');
  if (runs.length) out.push({ bid: 'B23', src: 'event', i: k--, quote: `自己运行了 ${runs.length} 次脚本（${paths(runs)}；${runs.filter(e => e.id === 'err').length} 次报错）`, rule: 'B23-事件:自己运行' });
  const reread = ag.filter(e => e.type === 'ws_open' && /^output\//.test(String(e.note || '')));
  if (reread.length) out.push({ bid: 'B23', src: 'event', i: k--, quote: `自己打开回读了交付文件 ${reread.length} 次（${paths(reread)}）`, rule: 'B23-事件:回读交付' });
  const fix = ag.filter(e => e.type === 'ws_edit' && /^output\//.test(String(e.note || '')));
  if (fix.length) out.push({ bid: 'B23', src: 'event', i: k--, quote: `自己动手改了交付文件（${paths(fix)}，共约 ${fix.reduce((n, e) => n + Math.abs(Number(e.delta) || 0), 0)} 字）`, rule: 'B23-事件:手改交付' });
  const src0 = ag.filter(e => e.type === 'ws_open' && /^(data|docs)\//.test(String(e.note || '')));
  if (src0.length) out.push({ bid: 'B13', src: 'event', i: k--, quote: `问过 AI 之后，自己打开原始材料看了 ${src0.length} 次（${paths(src0)}）`, rule: 'B13-事件:自己看原始材料' });
  const rev = ag.filter(e => e.type === 'ws_revert');
  if (rev.length) out.push({ bid: 'B16', src: 'event', i: k--, quote: `撤销了 AI 对文件的改动 ${rev.length} 次（${paths(rev)}）`, rule: 'B16-事件:撤销 AI 改动' });
  const modes = ag.filter(e => e.type === 'agent_mode' && /:on$/.test(String(e.note || '')));
  if (modes.length) out.push({ bid: 'B11', src: 'event', i: k--, quote: `主动设定了和 AI 的协作方式：${[...new Set(modes.map(e => /^plan/.test(String(e.note)) ? '先出计划、批准后再动手' : '每次改文件先给我确认'))].join('；')}`, rule: 'B11-事件:设定协作方式' });
  const plans = ag.filter(e => e.type === 'agent_plan');
  if (plans.length) out.push({ bid: 'B5', src: 'event', i: k--, quote: `让 AI 先出执行计划 ${plans.length} 次：${plans.map(e => (e.note === 'ok' ? '直接批准' : e.note === 'edit' ? `改过再执行（改动约 ${Math.abs(Number(e.delta) || 0)} 字）` : '打回')).join('、')}`, rule: 'B5-事件:审计划' });
  const rej = ag.filter(e => e.type === 'change_reject'), acc = ag.filter(e => e.type === 'change_ok');
  if (rej.length) out.push({ bid: 'B16', src: 'event', i: k--, quote: `逐条确认 AI 的文件改动：接受 ${acc.length} 次、拒绝 ${rej.length} 次（拒绝的：${paths(rej)}）`, rule: 'B16-事件:拒绝 AI 改动' });
  else if (acc.length >= 3) out.push({ bid: 'B23', src: 'event', i: k--, quote: `逐条看过 AI 的 ${acc.length} 次文件改动后才接受`, rule: 'B23-事件:逐条确认改动' });
  const sw = ag.filter(e => e.type === 'agent_model');
  if (sw.length) out.push({ bid: 'B4', src: 'event', i: k--, quote: `作答中换过模型 ${sw.length} 次（${paths(sw)}）`, rule: 'B4-事件:换模型' });
  return { cands: out, split };
}
const snippet = (t: string, at: number, len: number) => t.slice(Math.max(0, at - 30), at + len + 30).replace(/\s+/g, ' ').trim().slice(0, 160);

// 05 页三：超级 Prompt（一条消息万箭齐发）
function isStructPrompt(q: string, hits: Set<string>) {
  const marks = (q.match(/^\s*#{1,4}\s+\S/gm) || []).length + ((q.match(/^\s*(\d+[.、)]|[-*•])\s+\S/gm) || []).length >= 3 ? 1 : 0) + (/(输入|输出|input|output)\s*[:：]/i.test(q) ? 1 : 0) + (hits.has('B11') && hits.has('B2') && hits.has('B7') ? 1 : 0);
  const kinds = ['B1', 'B2', 'B7', 'B8', 'B9', 'B11'].filter(b => hits.has(b)).length;
  return marks >= 3 || (q.length > 600 && kinds >= 4);
}

// ─────────── 模型：成立判定 + 定档（02 页一 · 03 页锚点 · 06 页七送模包） ───────────
const OBS_LABEL: Record<string, string> = { baseline: '基线型', conditional: '条件型', risk: '风险型', external: '场景外型' };
function specText() {
  return BIDS.map(b => {
    const x = BEHAVIORS[b];
    return `### ${b} ${x.cn}（${x.strength}·${OBS_LABEL[x.obs]}）\n评价要点：${x.point}\n判断标准：${x.criteria}\n易混淆点：${x.confuse}\n生效窗口：${x.window.replace(/\s+/g, ' ').slice(0, 300)}\n1 分：${x.anchors.a1}\n2 分：${x.anchors.a2}\n3 分：${x.anchors.a3}\n4 分：${x.anchors.a4}\n5 分：${x.anchors.a5}\n定档提示：${x.anchors.hint}`;
  }).join('\n\n');
}
const PREFIX = `你是 AI 使用行为评估专家，按一份固定量表（7 维度 · 25 个可观察行为）评一个候选人做考核任务时怎么用 AI。
每条待评证据分两步：
第一步判断是否成立：这段文字是否真的体现了该行为（对照判断标准和易混淆点）；
第二步若成立，严格对照该行为的 1–5 档锚点定档。
判定原则：
1. 看实际效果，不看措辞；不要求教科书说法。
2. 严格对照锚点定档，不凭印象；拿不准给低档——这是选拔场景，宁可低估。
3. 必须引用原文片段作依据，没有引文的判定无效。
4. 原样粘贴的任务书 / 材料不算候选人自己的表达。
5. 需要「对齐 AI 上一轮输出」的行为（B10 迭代、B15 质疑推理、B16 纠错、B18 偏差、B14 补背景），看给出的上一轮 AI 回答：对不上就判不成立。
6. 同一片段命中多个行为时逐个判，注意互斥：能核对的归 B1、能划界的归 B2；问「怎么推出来的」是 B15、说「这个数错了」是 B16；要求「长什么样」是 B7、给「做到什么算好」是 B9。
7. 发现以下负向时在 neg 里标出编号（没有就不填）：N3 自己记错反指责 AI · N5 辱骂 / 情绪发泄且无修改方向 · N11 把错误归因于 AI / 工具并放弃修正。

## 量表：25 个行为的判断标准与 1–5 档锚点
${specText()}

## 返回格式
只输出 JSON：{"results":[{"pkg":1,"bid":"B10","valid":true,"q":3,"why":"不超过 40 字","quote":"不超过 30 字原文","neg":""}]}
每个包里列出的每个行为都要给一条结果。`;

interface Evidence { bid: string; src: Candidate['src']; i: number; q: number; why: string; quote: string; valid: boolean; quoted?: boolean; related?: boolean; rule: string; /** 任务块编号（11-20）：对话按块；交付侧 / 事件证据归最后一块 */ block?: number }

async function judge(inp: FluencyInput, cands: Candidate[], stats: string, warn: string[]): Promise<{ evs: Evidence[]; negs: { id: string; i: number; quote: string }[] }> {
  // 同一条消息命中的多条规则合成一个包（06 页七：多规则合并，一次 multi-label）
  const key = (c: Candidate) => `${c.src}:${c.i}`;
  const groups = new Map<string, Candidate[]>();
  for (const c of cands) groups.set(key(c), [...(groups.get(key(c)) || []), c]);
  // 预算：每份 ≤25 个包；超了按 强规则 > 基线型 > 条件型 截断（06 页七）
  const rank = (g: Candidate[]) => Math.max(...g.map(c => (BEHAVIORS[c.bid].strength === '强' ? 3 : 0) + (BEHAVIORS[c.bid].obs === 'baseline' ? 2 : 0)));
  let pkgs = [...groups.values()];
  if (pkgs.length > 25) { const cut = pkgs.sort((a, b) => rank(b) - rank(a)).slice(25); warn.push(`候选包 ${pkgs.length} 个，超出预算 25，截掉 ${cut.length} 个（涉及 ${[...new Set(cut.flat().map(c => c.bid))].join(' ')}），这些记 N/A`); pkgs = pkgs.slice(0, 25); }
  pkgs.sort((a, b) => (a[0].i - b[0].i));
  const ctx = (g: Candidate[]) => {
    const c = g[0];
    if (c.src !== 'chat') return c.src === 'event' ? `【过程事件】${c.quote}` : `【${c.src === 'deliverable' ? '交付物正文' : '提交时写的 AI 参与说明'}】${c.src === 'disclosure' ? (inp.events.find(e => e.type === 'ai_disclosure')?.text || c.quote) : c.quote}`;
    const prev = inp.chat[c.i - 1], cur = inp.chat[c.i];
    const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.round(n * 0.33))}……（中间略）……${s.slice(-Math.round(n * 0.67))}` : s);
    const none = '（外部 AI 的回答平台看不到；只按候选人这条消息本身判断，需要对齐上一轮输出的行为，消息里看不出对着什么就判不成立）';
    return `${prev ? `上一轮 AI 回答：${prev.a ? clip(prev.a, 400) : none}\n` : ''}候选人第 ${c.i + 1} 条消息${c.quoted ? '（大部分是原样粘贴的任务书 / 材料）' : ''}：${clip(cur.q, 800)}\nAI 随后的回答：${cur.a ? clip(cur.a, 300) : '（看不到）'}`;
  };
  const evs: Evidence[] = [], negs: { id: string; i: number; quote: string }[] = [];
  const BATCH = 6;
  const batches: Candidate[][][] = [];
  for (let s = 0; s < pkgs.length; s += BATCH) batches.push(pkgs.slice(s, s + BATCH));
  const head = `## 这次的任务\n${inp.task.title}：${inp.task.brief.replace(/\s+/g, ' ').slice(0, 500)}\n## 程序算的使用情况\n${stats}\n## 交付物（节选，B7 / B12 / B17 要核对是否落地）\n${(inp.deliverable || '').slice(0, 1200)}\n`;
  for (const [bi, batch] of batches.entries()) {
    const body = batch.map((g, n) => `[包 ${n + 1}] 待判行为：${[...new Set(g.map(c => c.bid))].join('、')}\n${ctx(g)}`).join('\n\n');
    let data: any = null;
    try { data = await askJson(`${head}\n## 待评证据\n${body}`, 'Fluency · 判定定档', inp.institution, PREFIX, warn); } catch (e) { warn.push(`第 ${bi + 1} 批模型判定失败：${String((e as any)?.message).slice(0, 80)}；这批候选记未判`); continue; }
    for (const r of (data?.results || []) as any[]) {
      const g = batch[(Number(r?.pkg) || 0) - 1]; if (!g) continue;
      const c = g.find(x => x.bid === r.bid); if (!c) continue;
      const valid = !!r.valid;
      evs.push({ bid: c.bid, src: c.src, i: c.i, q: valid ? Math.max(1, Math.min(5, Math.round(Number(r.q) || 3))) : 0, why: String(r.why || '').slice(0, 120), quote: String(r.quote || c.quote).slice(0, 80), valid, quoted: c.quoted, rule: c.rule });
      const n = String(r.neg || '').match(/N(3|5|11)\b/);
      if (n && valid !== undefined && !negs.some(x => x.id === `N${n[1]}` && x.i === c.i)) negs.push({ id: `N${n[1]}`, i: c.i, quote: String(r.quote || c.quote).slice(0, 80) });
    }
  }
  return { evs, negs };
}

// ─────────── 补扫：正则没定位到的行为，让模型直接通读候选人原话找（借鉴宇宁 ai_fluency_v3.py 的 LLM 定向扫描） ───────────
// 只补「成立证据不足 2 条」的行为（1 条最多 3.5 分，要上 4 分得有第二处）；每条消息只问它生效窗口内的行为；
// 引文必须是这条消息里的原文，对不上就丢——防模型自己编。B19 只认程序判（PII / 脱敏），B21 / B22 只看交付侧，不补扫。
const SCAN_PREFIX = `你是 AI 使用行为评估专家，按一份固定量表（7 维度 · 25 个可观察行为）评一个候选人做考核任务时怎么用 AI。
这一步是「补扫」：程序的关键词没定位到足够证据的行为，请你直接通读候选人发给 AI 的原话找。
规则：
1. 每条消息只在它后面列的「可判行为」里找（已按量表的生效窗口筛过），列表外的行为不要报。
2. 只看候选人自己说的话：消息里粘贴的任务书 / 材料原文、转贴的 AI 回答、平台出的任务都不算候选人的表达。
3. 确实体现才报，对照判断标准和易混淆点；拿不准就不报——这是选拔场景，宁可漏报不误报。一条消息最多报 3 个行为。
4. 报了就严格按该行为的 1–5 档锚点定档，拿不准给低档。
5. 需要「对齐 AI 上一轮输出」的行为（B10 迭代、B15 质疑推理、B16 纠错、B18 偏差、B14 补背景）：看给出的上一轮 AI 回答，对不上就不报；看不到 AI 回答时，消息本身看不出针对什么也不报。
6. quote 必须从这条消息里原样摘一段连续原文（不超过 40 字），不许改写、拼接。

## 量表：25 个行为的判断标准与 1–5 档锚点
${specText()}

## 返回格式
只输出 JSON：{"results":[{"msg":1,"bid":"B5","q":3,"quote":"原文片段","why":"不超过 40 字"}]}；一条都没有就返回 {"results":[]}`;

async function scanGaps(inp: FluencyInput, a: Anchors, split: { ratio: number; self: string }[], evs: Evidence[], stats: string, logs: string[], warn: string[]): Promise<Evidence[]> {
  const chat = inp.chat;
  const have = new Map<string, number>();
  for (const e of evs) if (e.valid) have.set(e.bid, (have.get(e.bid) || 0) + 1);
  const skip = new Set(['B19', 'B21', 'B22', ...(chat.length < 4 ? [...NEED_4] : [])]);
  const gap = BIDS.filter(b => !skip.has(b) && (have.get(b) || 0) < 2);
  if (!gap.length) return [];
  const judged = new Set(evs.filter(e => e.src === 'chat').map(e => `${e.bid}:${e.i}`));
  const msgs = chat.map((c, i) => ({ i, bids: gap.filter(b => inWindow(b, i, a) && !(NEED_4.has(b) && a.size && a.size[i] < 4) && !judged.has(`${b}:${i}`)) }))
    .filter(m => m.bids.length && split[m.i].ratio <= 0.8 && (chat[m.i].q || '').trim().length >= 6);
  const MAX = 48;
  if (msgs.length > MAX) warn.push(`补扫只看前 ${MAX} 条消息（共 ${msgs.length} 条可扫）`);
  const todo = msgs.slice(0, MAX);
  if (!todo.length) return [];
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.round(n * 0.4))}……（中间略）……${s.slice(-Math.round(n * 0.6))}` : s);
  const none = '（看不到 AI 的回答）';
  const head = `## 这次的任务\n${inp.task.title}：${inp.task.brief.replace(/\s+/g, ' ').slice(0, 500)}\n## 程序算的使用情况\n${stats}\n`;
  const out: Evidence[] = [];
  const BATCH = 6;
  for (let s = 0; s < todo.length; s += BATCH) {
    const batch = todo.slice(s, s + BATCH);
    const body = batch.map((m, n) => {
      const prev = chat[m.i - 1];
      return `[消息 ${n + 1}] 候选人第 ${m.i + 1} 条 · 可判行为：${m.bids.map(b => `${b} ${BEHAVIORS[b].cn}`).join('、')}\n${prev ? `上一轮 AI 回答：${prev.a ? clip(prev.a, 300) : none}\n` : ''}${split[m.i].ratio >= 0.5 ? `（这条约 ${Math.round(split[m.i].ratio * 100)}% 是粘贴的任务书 / 材料）\n` : ''}候选人原话：${clip(chat[m.i].q, 800)}`;
    }).join('\n\n');
    let data: any = null;
    try { data = await askJson(`${head}\n## 待扫消息\n${body}`, 'Fluency · 补扫', inp.institution, SCAN_PREFIX, warn); } catch (e) { warn.push(`补扫第 ${s / BATCH + 1} 批失败：${String((e as any)?.message).slice(0, 80)}`); continue; }
    for (const r of (data?.results || []) as any[]) {
      const m = batch[(Number(r?.msg) || 0) - 1]; if (!m) continue;
      const bid = String(r?.bid || ''); if (!m.bids.includes(bid)) continue;
      const quote = String(r?.quote || '').trim().slice(0, 80);
      const key = (x: string) => squash(norm(x)).replace(/[「」"“”'‘’…。，,.!！?？:：;；]/g, '');
      const body = key(chat[m.i].q), qk = key(quote);
      if (!qk || !(body.includes(qk) || (qk.length >= 12 && body.includes(qk.slice(0, 12))))) continue;   // 引文对不上原话 → 丢
      if (out.some(e => e.bid === bid && e.i === m.i) || out.filter(e => e.i === m.i).length >= 3) continue;
      out.push({ bid, src: 'chat', i: m.i, q: Math.max(1, Math.min(5, Math.round(Number(r.q) || 3))), why: String(r.why || '').slice(0, 120), quote, valid: true, quoted: split[m.i].ratio > 0.8, rule: `${bid}-模型补扫` });
    }
  }
  logs.push(`补扫：${gap.length} 个行为正则证据不足 2 条（${gap.join(' ')}），模型通读 ${todo.length} 条消息，补到 ${out.length} 条${out.length ? `（${[...new Set(out.map(e => e.bid))].join(' ')}）` : ''}`);
  return out;
}

async function askJson(prompt: string, task_name: string, institution?: string, prefix?: string, warn?: string[]): Promise<any> {
  let lastErr: any = null;
  for (const m of [MODEL, 'qwen3.7-plus', 'qwen-plus'].filter((x, i, a) => a.indexOf(x) === i)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await generateContent(prompt + (attempt ? '\n\n上一次返回的 JSON 无法解析。这次只返回一个合法 JSON 对象，字符串里不要英文双引号（引用用「」），不要换行。' : ''), m, { jsonMode: true, prefix, temperature: 0 });
        await logTokenUsage({ tool_name: 'work', task_name, institution: institution || '', model_id: m, usageMetadata: res.usageMetadata } as any).catch(() => {});
        const p = parseJsonLoose(res.text); if (!p || typeof p !== 'object') throw new Error('不是 JSON');
        if (m !== MODEL && warn) warn.push(`${task_name} 主模型没成，用了兜底模型 ${m}`);   // 11-22 评审：以前换了模型报告里看不出来
        return p;
      } catch (e) { lastErr = e; if (!/JSON/.test(String((e as any)?.message))) break; }
    }
  }
  throw lastErr;
}

// ─────────── 04 负向 N1–N13（程序能判的部分） ───────────
export const NEGATIVES: Record<string, { name: string; target: string; action: 'A' | 'B' | 'C' | 'cap2' | 'downgrade1' | 'na' }> = {
  N1: { name: '未脱敏 PII 上传', target: 'B19', action: 'A' }, N2: { name: '明知涉敏仍要求 AI 处理', target: 'B19', action: 'A' },
  N3: { name: '自己记错反指责 AI', target: 'B16', action: 'B' }, N4: { name: '把 AI 产出说成全部人工', target: 'B22', action: 'B' },
  N5: { name: '情绪发泄无实质纠错', target: 'B15', action: 'B' }, N6: { name: '盲目刷轮次', target: 'B10', action: 'cap2' },
  N7: { name: '诱导伪造 / 规避限制', target: '*', action: 'C' }, N8: { name: '交付即提交零核查', target: 'B23', action: 'A' },
  N9: { name: '全盘照搬 AI 输出', target: 'B15', action: 'cap2' }, N10: { name: '整段粘贴任务书冒充自定目标', target: 'B1', action: 'downgrade1' },
  N11: { name: '把 AI 错误归因于工具、自我免责', target: 'B24', action: 'B' }, N12: { name: '拒答表单 / 提交后失联', target: 'B21', action: 'na' },
  N13: { name: '密钥 / 口令贴入对话', target: 'B19', action: 'A' },
};
const PII = [['手机号', /(?<!\d)1[3-9]\d{9}(?!\d)/g], ['身份证', /(?<!\d)\d{17}[\dXx](?!\d)/g], ['邮箱', /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/g], ['卡号', /(?<!\d)\d{16,19}(?!\d)/g]] as const;
const CRED = [/\bsk-[A-Za-z0-9._-]{16,}/, /\bAKIA[0-9A-Z]{16}\b/, /(?:password|passwd|pwd)\s*[=:]\s*\S{6,}/i];
const ABUSE = /(垃圾|傻[逼比]|蠢货|废物|弱智|智障|(?:^|[\s，,。！!])滚(?:开|吧|蛋)?(?:[\s，,。！!]|$)|妈的|他妈的)/;
const FILLER = /^(继续|再来|再试|换一版|换个|重来|好|可以|行|嗯|ok|continue|next)[\s。，,!！?？]*$/i;
// 只认「要求 AI 去造」：请求词 + 伪造动作，或伪造 + 对象。裸「造假」不算——候选人分析简历造假、统计造假原因是正常任务（11-16 实测误报，py 同样的问题）
const FORGE = /((帮我|给我|替我|你)[^。\n]{0,8}(伪造|编造|虚构|捏造|编一些|编几条)|(伪造|编造|虚构|捏造)(一些|几条|一份|一个|个)?(数据|引用|文献|结果|来源|出处)|(绕过|规避)(安全|限制|审查|校验))/;
const DENY = /(完全独立完成|未使用\s*AI|没(有)?用\s*AI|全部由我(自己)?完成|没有任何\s*AI|entirely (by|written by) (me|myself)|without (any )?ai|no ai (was )?used|all done by myself)/i;
const luhn = (n: string) => { const d = [...n].map(Number); let s = 0; for (let i = d.length - 1, k = 0; i >= 0; i--, k++) { let x = d[i]; if (k % 2) { x *= 2; if (x > 9) x -= 9; } s += x; } return s % 10 === 0; };
const gram3 = (s: string) => { const t = squash(s); const g = new Set<string>(); for (let i = 0; i + 3 <= t.length; i++) g.add(t.slice(i, i + 3)); return g; };
const jac = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };

function detectNegatives(inp: FluencyInput, split: { ratio: number; self: string }[], disclosure: string, usedAi: boolean) {
  const hits: { id: string; i: number; quote: string; quoted?: boolean }[] = [];
  inp.chat.forEach((c, i) => {
    const t = c.q || '', quoted = split[i].ratio > 0.8;
    const masked = /(\*{3,}|x{3,}|已脱敏|打码|匿名)/i.test(t);
    for (const [label, re] of PII) for (const m of t.matchAll(re)) {
      const s = m[0];
      if (label === '卡号' && !luhn(s)) continue;                                    // ② Luhn 不过 = 订单号 / 编号
      if (label === '邮箱' && (/@v?\d|name@|@commit/i.test(s))) continue;           // ③ 版本号 / 标识符
      if (masked) continue;
      hits.push({ id: 'N1', i, quote: `${label}：${s.slice(0, 4)}…`, quoted }); break;   // 严格模式：① 引用块不豁免，但标出来供申诉
    }
    if (CRED.some(re => re.test(t))) hits.push({ id: 'N13', i, quote: '凭据形态（已隐去）', quoted });
    if (FORGE.test(t)) hits.push({ id: 'N7', i, quote: t.match(FORGE)![0] });
    if (ABUSE.test(t) && !/(改成|应该是|请换|建议|不对的地方在于)/.test(t)) hits.push({ id: 'N5', i, quote: t.match(ABUSE)![0] });
    // N9：用户这一条和 AI 上一轮输出几乎一样（>98%）、没有加工
    if (i > 0 && t.length >= 50 && jac(gram3(t), gram3(inp.chat[i - 1].a || '')) > 0.98) hits.push({ id: 'N9', i, quote: '把 AI 上一轮输出原样发回' });
  });
  let run = 0;
  inp.chat.forEach((c, i) => { if (FILLER.test((c.q || '').trim())) { if (++run === 3) hits.push({ id: 'N6', i, quote: '连续 3 轮只说「继续 / 再来」' }); } else run = 0; });
  // N10：首条消息基本是任务书原文、没有自述
  if (inp.chat[0] && split[0].ratio > 0.8 && split[0].self.length < 40) hits.push({ id: 'N10', i: 0, quote: '第 1 条消息是整段粘贴的任务书，没有自己的目标表述' });
  // N4：交付侧说没用 AI，但记录里用了
  const deny = (disclosure + '\n' + (inp.deliverable || '').slice(-800)).match(DENY);
  if (deny && usedAi) hits.push({ id: 'N4', i: -1, quote: deny[0] });
  // 熔断：负向 B 最多 3 条，超了转人工（04 页）
  const nb = hits.filter(h => NEGATIVES[h.id]?.action === 'B');
  const out = hits.filter(h => NEGATIVES[h.id]?.action !== 'B').concat(nb.slice(0, 3));
  if (nb.length > 3) out.push({ id: 'OVERFLOW', i: -1, quote: '负向 B 超过 3 条，转人工复核' });
  return out;
}

// ─────────── 05 互斥仲裁 + 超级 Prompt 归并 ───────────
const PAIRS: [string, string, string][] = [
  ['B1', 'B2', '能核对的归 B1，能划界的归 B2'], ['B5', 'B10', '首个实质产出请求之前 → B5；之后 → B10'], ['B6', 'B23', '成品产出之前的分工 → B6；之后的核查 → B23'],
  ['B12', 'B17', '成品产出之前的要求 → B12；之后的评价 → B17'], ['B15', 'B16', '问「怎么推出来的」→ B15；说「这个数错了」→ B16'], ['B7', 'B9', '要求「长什么样」→ B7；提供「做到什么算好」→ B9'],
  ['B13', 'B23', '核查外部事实 → B13；核查自己交付物 → B23'], ['B14', 'B1', '补的是信息 → B14；定的是目的与标准 → B1'], ['B18', 'B20', 'AI 输出偏差 → B18；对第三方影响 → B20'],
  ['B21', 'B22', '是否披露 → B21；披露得准不准 → B22'], ['B2', 'B11', '划范围 → B2；拆环节 / 定角色 → B11'], ['B3', 'B4', '同类工具比较 → B4；要不要用 AI → B3'],
];
const bnum = (b: string) => Number(b.slice(1));
/** 两条证据引的是不是同一段话（同一成分）：去掉空白标点后，短的那条里有连续 8 个字出现在长的里（短于 8 字就整条包含） */
function sameComponent(a: string, b: string) {
  const z = (t: string) => norm(String(t || '')).replace(/[\s，。、,.!?！？；;：:「」“”"'（）()…·\-—]/g, '');
  const [s, l] = [z(a), z(b)].sort((x, y) => x.length - y.length);
  if (!s || !l) return false;
  if (s.length <= 8) return l.includes(s);
  for (let i = 0; i + 8 <= s.length; i++) if (l.includes(s.slice(i, i + 8))) return true;
  return false;
}
/** byComponent（评审团，11-23 潜历讨论）：超级 Prompt 和互斥只在「抢同一成分」时生效——同一条消息里不同的话对应不同指标，都算（复盘 4.1 第 5 条；一刀切只留 1 个主指标会漏判） */
function arbitrate(evs: Evidence[], structMsgs: Set<number>, logs: string[], byComponent = false) {
  const live = evs.filter(e => e.valid);
  // 超级 Prompt：一条消息只留 1 个主指标（B11 > B7 > B1），其余记「关联」不进聚合
  for (const i of structMsgs) {
    const on = live.filter(e => e.src === 'chat' && e.i === i && !e.related);
    if (on.length < 2) continue;
    const main = on.find(e => e.bid === 'B11') || on.find(e => e.bid === 'B7') || on.find(e => e.bid === 'B1') || on.sort((a, b) => b.q - a.q)[0];
    const drop = on.filter(e => e !== main && (!byComponent || sameComponent(e.quote, main.quote)));
    for (const e of drop) e.related = true;
    if (drop.length) logs.push(`第 ${i + 1} 条是结构化的超级 Prompt：主归 ${main.bid}，${drop.map(e => e.bid).join(' ')} ${byComponent ? '引的是同一段话，' : ''}记关联、不另计分（05 页三）${byComponent && drop.length < on.length - 1 ? `；${on.filter(e => e !== main && !drop.includes(e)).map(e => e.bid).join(' ')} 引的是别的话，照算` : ''}`);
  }
  // 互斥：同一片段上两项都成立，留档位高的；同档按编号小的（05 页二 ③，只为日志一致）
  const byMsg = new Map<string, Evidence[]>();
  for (const e of live) if (!e.related) byMsg.set(`${e.src}:${e.i}`, [...(byMsg.get(`${e.src}:${e.i}`) || []), e]);
  for (const [k, g] of byMsg) for (const [x, y, why] of PAIRS) {
    const ex = g.find(e => e.bid === x && !e.related), ey = g.find(e => e.bid === y && !e.related);
    if (!ex || !ey) continue;
    if (byComponent && !sameComponent(ex.quote, ey.quote)) continue;   // 同一条消息、不同的话：两项都算
    const drop = ex.q !== ey.q ? (ex.q < ey.q ? ex : ey) : (bnum(x) > bnum(y) ? ex : ey);
    drop.related = true;
    logs.push(`${k.replace('chat:', '第 ').replace(/^(第 )(\d+)$/, (_, a, n) => `${a}${Number(n) + 1} 条`)}：${x}↔${y} 互斥，留 ${drop === ex ? y : x}，${drop.bid} 记关联。判据：${why}`);
  }
}

// ─────────── 评审团（11-20）：切块 → 7 个维度评委 → 代码合分 → 总评 ───────────
// 为什么：v3 让一个模型同时记住 25 个行为 + 窗口 + 互斥 + 去重 + 封顶，规则越补越乱、出了错分不清是哪层。
// 评审团把它拆开：每个评委只管自己维度的 3–4 个行为，逐块读整段对话、引原话、按锚点定档；评委之间不抢指标（不用互斥 / 超级 Prompt 仲裁）；
// 原话核对、取最高档、一次 vs 多次，交给几行看得懂的代码；最后的解读（narrate）就是总评委。对话全文放在共用前缀里，7 个评委走提示缓存。
// 留头尾（11-22 评审：只留开头会把贴完材料后写在末尾的指令和核查要求截掉）
const clip = (t: string, n: number) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, Math.round(n * 0.4))}……（中间省略 ${s.length - n} 字）……${s.slice(s.length - Math.round(n * 0.6))}` : s; };
function dimSpec(bids: string[]) {
  return bids.map(b => { const x = BEHAVIORS[b]; return `### ${b} ${x.cn}\n评价要点：${x.point}\n判断标准：${x.criteria}\n易混淆点：${x.confuse}\n看哪里：${x.window.replace(/\s+/g, ' ').slice(0, 160)}\n1 分：${x.anchors.a1}\n2 分：${x.anchors.a2}\n3 分：${x.anchors.a3}\n4 分：${x.anchors.a4}\n5 分：${x.anchors.a5}\n定档提示：${x.anchors.hint}`; }).join('\n\n');
}
async function committeeJudge(inp: FluencyInput, B: { of: number[]; list: TaskBlock[] }, cands: Candidate[], logs: string[], warn: string[]): Promise<{ evs: Evidence[]; negs: { id: string; i: number; quote: string }[] }> {
  const chat = inp.chat, outsideOnly = chat.every(c => !c.a);
  const facts = cands.filter(c => c.src !== 'chat');
  const factLine = (c: Candidate, n: number) => `[F${n + 1}] ${c.src === 'event' ? '平台记录的动作' : c.src === 'deliverable' ? '交付物里' : '提交时的 AI 参与说明（候选人自述，只能用于 B21 / B22）'}（${c.bid} 相关）：${c.quote}`;
  const transcript = B.list.map(bl => `【任务块 ${bl.id + 1}｜${bl.label}｜第 ${bl.msgs[0] + 1}–${bl.msgs[bl.msgs.length - 1] + 1} 条】\n` + bl.msgs.map(i => `[${i + 1}] 候选人：${clip(chat[i].q, 700)}${chat[i].a ? `\n      AI：${clip(chat[i].a, 500)}` : ''}`).join('\n')).join('\n\n');
  const prefix = `你是「AI 驾驭能力」评审团里的一位评委。评审团按维度分工：每位评委只评分给自己的那几个行为，其他行为由别的评委负责，你不用管、也不用让。
候选人在做一道考核任务，下面是他和 AI 的全部对话（按任务块分好），以及平台记录的动作和交付侧信息。

评法（每位评委都一样）：
1. 只看候选人自己说的话和平台记录；他原样粘贴的任务书 / 材料不算他的表达。
2. 逐个任务块看：你负责的每个行为，在这一块里有没有真的发生。要对齐 AI 上一轮回答才能判的（迭代、纠错、质疑推理、补背景、偏差），看给出的 AI 回答，对不上就不算。
3. 发生了就引用候选人原话（逐字，不超过 40 字）或平台记录编号，按锚点定 1–5 档；看实际效果、不看措辞；拿不准给低档。
4. 同一个行为，每个任务块最多列 2 处最有代表性的（不同消息）；没发生就不列，不要硬凑。
5. 一条消息同时体现了你负责的两个行为，可以两个都列，但理由要分别说清各体现了哪一部分。
6. 「AI 参与说明」是候选人提交时的自述，**只能作为 B21（有没有披露）和 B22（贡献说得准不准）的证据**，不能拿来证明核查、纠错、验证等行为发生过——那些要在对话或平台记录里有对应的动作才算。B22 要把自述和记录对照：自述说「逐条核对 / 修正了错误」，但对话和平台记录里看不到对应动作，就是表述与实际不符，按锚点定低档。
7. 平台记录里的改写量这样看：自己改写约占交付物 10% 以内是小修，10–20% 是中等，20% 以上是大幅改写（拿到 AI 的东西后自己重写了不少）；定档时把这个量算进去，不要不管多少都给同一档。
8. 候选人没在对话里说、而是直接在产出物上标注 / 修改后让 AI 改：AI 的回复里常会复述「根据你标注的…已改为…」。这算候选人的迭代 / 纠错证据：quote 引 AI 回复里复述他要改的那句（逐字），why 开头写「据 AI 回复」。${outsideOnly ? '\n9. 这场只有候选人的提问原话（外部 AI 的回答看不到）：需要对齐 AI 回答的行为，只按提问本身能看出来的判。' : ''}

## 任务
${inp.task.title}：${clip(inp.task.brief, 500)}

## 平台记录（不是对话）
${facts.length ? facts.map(factLine).join('\n') : '（无）'}

## 最终交付物（节选；交付格式、要求有没有落地、AI 内容占比要对着它看）
${inp.deliverable?.trim() ? clip(inp.deliverable, 3000) : '（没有交付物正文）'}

## 对话（共 ${chat.length} 条，${B.list.length} 个任务块）
${transcript}`;
  const nums = Object.keys(DIMS).sort();
  const run = async (num: string) => {
    const bids = DIMS[num].behaviors.filter(b => b !== 'B21' && b !== 'B22' || facts.length);
    const p = await askJson(`## 你是「${DIMS[num].name}」评委，只评这几个行为
${dimSpec(bids)}

## 返回 JSON
{"behaviors":[{"bid":"${bids[0]}","evidence":[{"msg":<消息编号，平台记录写 0>,"fact":"<平台记录编号如 F2，没有就空>","q":<1-5>,"quote":"<候选人原话，逐字>","why":"<不超过 40 字：体现了什么、为什么是这一档>"}],"none":"<一处都没有时写一句为什么>"}],"negatives":[{"id":"N3|N5|N11","msg":<编号>,"quote":"<原话>"}]}
你负责的每个行为都要出现一次（没有证据就 evidence 为空、写 none）。negatives 只在看到「自己记错反指责 AI（N3）/ 辱骂或情绪发泄且无修改方向（N5）/ 把错误归因于 AI 并放弃修正（N11）」时填。`, `Fluency · 评委 ${num}`, undefined, prefix, warn);
    return { num, bids, p };
  };
  // 第一位评委先跑，把对话全文写进缓存；其余并行（最多 3 路）
  const outs = [await run(nums[0]).catch(e => ({ num: nums[0], bids: [] as string[], p: null, err: e }))];
  for (let i = 1; i < nums.length; i += 3) outs.push(...await Promise.all(nums.slice(i, i + 3).map(n => run(n).catch(e => ({ num: n, bids: [] as string[], p: null, err: e })))));
  const evs: Evidence[] = [], negs: { id: string; i: number; quote: string }[] = [];
  const lastBlock = B.of.length ? B.of[B.of.length - 1] : 0;
  for (const o of outs) {
    if (!o.p) { warn.push(`维度 ${o.num} 评委没给出结果：${String((o as any).err?.message || '').slice(0, 80)}`); continue; }
    let ok = 0, bad = 0;
    for (const r of Array.isArray(o.p.behaviors) ? o.p.behaviors : []) {
      const bid = String(r?.bid || ''); if (!o.bids.includes(bid)) continue;
      for (const x of Array.isArray(r.evidence) ? r.evidence.slice(0, 8) : []) {
        const n = Math.round(Number(x?.msg) || 0), quote = String(x?.quote || '').slice(0, 80), q = Math.max(1, Math.min(5, Math.round(Number(x?.q) || 0)));
        const fi = /^F(\d+)$/i.exec(String(x?.fact || '').trim());
        if (fi && facts[Number(fi[1]) - 1]) { const f = facts[Number(fi[1]) - 1]; evs.push({ bid, src: f.src, i: f.i, q, why: String(x?.why || '').slice(0, 120), quote: f.quote.slice(0, 80), valid: true, rule: `评委${o.num}-${f.rule}`, block: lastBlock }); ok++; continue; }
        if (n < 1 || n > chat.length || !quote) { bad++; continue; }
        // 原话核对：引文要在这条消息里找得到（忽略空白和标点差异）
        const z = (t: string) => norm(t).replace(/[\s，。、,.!?！？；;：:「」“”"'（）()…]/g, '');
        const fromAi = /^据\s*AI\s*回复/.test(String(x?.why || ''));   // 11-23：用户没说出口的修改，从 AI 回复里认
        const verified = z(fromAi ? chat[n - 1].a || '' : chat[n - 1].q).includes(z(quote).slice(0, 24));
        if (!verified) { bad++; continue; }
        evs.push({ bid, src: 'chat', i: n - 1, q, why: String(x?.why || '').slice(0, 120), quote, valid: true, rule: `评委${o.num}`, block: B.of[n - 1] });
        ok++;
      }
    }
    for (const g of Array.isArray(o.p.negatives) ? o.p.negatives : []) { const id = String(g?.id || ''); const n = Math.round(Number(g?.msg) || 0); if (/^N(3|5|11)$/.test(id) && n >= 1 && n <= chat.length && !negs.some(x => x.id === id && x.i === n - 1)) negs.push({ id, i: n - 1, quote: String(g?.quote || '').slice(0, 60) }); }
    logs.push(`评委 ${o.num}「${DIMS[o.num].name}」：成立证据 ${ok} 条${bad ? `，${bad} 条引文对不上原话已作废` : ''}`);
  }
  return { evs, negs };
}

// ─────────── 02 计分与聚合 ───────────
export interface BehaviorScore { bid: string; score: number | null; obs: string; na?: string; q_max?: number; k?: number; b?: number; /** 诊断：成立证据出现在几段不相邻的地方（不进分） */ occ?: number; capped?: boolean; r?: number | null; evidence: Evidence[]; related: Evidence[]; rejected: Evidence[]; negatives: string[] }
export interface DimScore { num: string; name: string; score: number | null; weight: number; observable: number; total: number; thin: boolean }
export interface FluencyReport {
  version: string; model: string; generated_at: string;
  overall: number | null; score100: number | null; tier: string; confidence: { level: '高' | '中' | '低'; note: string; c_obs: number; c_elig: number };
  status: 'ok' | 'no_total' | 'manual' | 'not_assessable'; status_note?: string;
  dims: DimScore[]; behaviors: Record<string, BehaviorScore>;
  negatives: { id: string; name: string; target: string; action: string; msg: number; quote: string; quoted?: boolean }[];
  profile: TaskProfile & { type_name: string; missing: string[] }; not_triggered: { bid: string; why: string }[];
  stats: { user_msgs: number; candidates: number; packages: number; valid: number; /** 模型补扫补到的证据条数 */ scanned?: number }; logs: string[]; warnings: string[];
  /** 对话从哪来：platform = 平台 AI 助手的记录；outside = 从截图 / 插件网页抽出来的外部 AI 提问（只有提问，没有 AI 回答） */
  d1_source?: 'platform' | 'outside';
  outside?: { asks: { t: number; q: string; complete: boolean; src: string }[]; note: string };
  /** 只出画像不出总分时（C_elig < 0.75），按公式算出来的数，只给校准看，不对外 */
  portrait_overall?: number | null;
  narrative?: FluencyNarrative | null;
}
/** 给人看的解读（模型按上面的结构化结果写，只许引用已有证据，不许加新判断） */
export interface FluencyNarrative {
  summary: string; tendency: string;
  highlights: { bid: string; title: string; text: string; quotes: string[] }[];
  gaps: { bid: string; title: string; text: string }[];
  patterns: { title: string; text: string }[];
  interview: { topic: string; why: string; ask: string; watch: string }[];
  advice: { verdict: string; fit: { task: string; basis: string; condition: string }[]; verify: string[] };
}
const TIERS: [number, string][] = [[4, '专家'], [3, '熟练者'], [1.5, '发展者'], [0, '新手']];
export const tierOf = (v: number | null) => (v == null ? '未评估' : TIERS.find(([t]) => v >= t)![1]);
const NA_REASON: Record<string, string> = { conditional: '未观测（条件未触发）', risk: '未观测（任务未涉及隐私数据）', external: '不可观测（没有交付侧披露）' };

function scoreBehavior(bid: string, evs: Evidence[], negs: { id: string }[], mode: 'v3' | 'v3-spec' | 'committee' = 'v3'): BehaviorScore {
  const obs = BEHAVIORS[bid].obs;
  const mine = evs.filter(e => e.bid === bid);
  const ok = mine.filter(e => e.valid && !e.related);
  const myNeg = negs.filter(n => NEGATIVES[n.id]?.target === bid);
  const base = { bid, obs, related: mine.filter(e => e.valid && e.related), rejected: mine.filter(e => !e.valid), negatives: myNeg.map(n => n.id) };
  if (!ok.length && !myNeg.length) return { ...base, score: obs === 'baseline' ? 0 : null, na: obs === 'baseline' ? undefined : NA_REASON[obs], evidence: [] };
  if (!ok.length) return { ...base, score: myNeg.some(n => NEGATIVES[n.id].action === 'na') ? null : 1, evidence: [] };
  const q_max = Math.max(...ok.map(e => e.q));
  // 02 页公式（11-20 按潜历复盘对齐 · 与宇宁 ai_fluency_v3 同口径）：同任务块同行为只算 1 条（取最高档，05 页 · 通用防重复）→
  // k = 支撑 q_max 的证据条数、b = 它们落在几个块；k = 1 且 b = 1 → 单点封顶 min(q_max, 4) − 0.5；跨块（b ≥ 2）不下调
  const topBlocks = new Set(ok.filter(e => e.q === q_max).map(e => e.block ?? 0));
  const k = topBlocks.size, b = topBlocks.size;
  let s: number = q_max, capped = false;
  // 评审团：封顶看「这个行为是偶然一次，还是一以贯之」——成立证据出现在 ≥ 2 处（不同块，或同块内不相邻的两段）就不封顶
  // 11-23 稳定性测试：「不相邻才算两次」让两次评分各挑的证据一相邻一隔开就翻（同一行为 3.5 ↔ 5）；改成「两条不同消息就算」，聊天考试台两次评分最大差 0.96 → 0.63
  const occTop = new Set(ok.filter(e => e.q >= q_max - 1 && e.i >= 0).map(e => e.i)).size + (ok.some(e => e.i < 0 && e.q >= q_max - 1) ? 1 : 0);
  // 默认 v3：k 按「不相邻的几段」数（同块内不相邻也算）——11-17 起线上一直这么算；v3-spec 照 02 页；评审团看一次 vs 多次
  const tops = ok.filter(e => e.q === q_max).map(e => e.i).sort((x, y) => x - y); let kSeg = 0, lSeg = -9; for (const i of tops) { if (i < 0 || i - lSeg > 1) kSeg++; lSeg = i; }
  if (mode === 'committee' ? occTop <= 1 : mode === 'v3-spec' ? k <= 1 && b <= 1 : kSeg <= 1) { s = Math.min(q_max, 4) - 0.5; capped = true; }   // 单点封顶 3.5（02 页三 · 决议③）
  // 诊断（不进分，11-20 给潜历看「偶然闪光 vs 一如既往」）：成立证据在几段不相邻的消息上出现（同块内也数）——11-17 以前的 k 就是这么数的
  const at = ok.map(e => e.i).filter(i => i >= 0).sort((x, y) => x - y); let occ = ok.some(e => e.i < 0) ? 1 : 0, last = -9; for (const i of at) { if (i - last > 1) occ++; last = i; }
  for (const n of myNeg) {
    const a = NEGATIVES[n.id].action;
    if (a === 'A') s = 1; else if (a === 'B' || a === 'cap2') s = Math.min(s, 2); else if (a === 'downgrade1') s = Math.max(1, s - 1);
  }
  const qs = ok.map(e => e.q).sort((a, b) => a - b), med = qs[Math.floor(qs.length / 2)];
  return { ...base, score: Math.round(Math.max(0, Math.min(5, s)) * 10) / 10, q_max, k, b, occ, capped, r: q_max - med, evidence: ok };
}

export async function assessFluency(inp: FluencyInput): Promise<FluencyReport> {
  // 插件抓到的外部 AI 网页（q 是「（插件读到的 chatgpt.com 页面 · …）」占位，原话混在网页正文 a 里）：还没抽成一问一答，不当 D1
  const all = [...(inp.chat || [])].filter(c => (c.q || '').trim()).sort((a, b) => a.t - b.t);
  const pages = all.filter(c => /^（插件读到的/.test(c.q));
  let chat = all.filter(c => !/^（插件读到的/.test(c.q));
  // D1 降级（07 页一）：站内没有对话，用外部 AI 的提问原话顶上；只有提问、看不到 AI 的回答
  const fromOutside = !chat.length && !!inp.outside?.asks?.length;
  if (fromOutside) chat = inp.outside!.asks.map(a => ({ t: a.t, q: a.q, a: '' }));
  const I = { ...inp, chat };
  const logs: string[] = [], warnings: string[] = [];
  const disclosure = String([...inp.events].reverse().find(e => e.type === 'ai_disclosure')?.text || '');
  const source = squash([inp.task.brief, ...(inp.task.rules || []), ...inp.task.materials.map(m => m.content || '')].join(''));
  const profile = inp.profile || await profileTask(I);
  const ce = cElig(profile);
  const base = { version: FLUENCY_VERSION, model: MODEL, generated_at: new Date().toISOString(), profile: { ...profile, type_name: TYPE_INFO[profile.type].name, missing: ce.missing }, logs, warnings };
  const notTriggered = [
    ...TYPE_INFO[profile.type].weak.map(b => ({ bid: b, why: `${TYPE_INFO[profile.type].name}类任务里是弱期待` })),
    ...(TYPE_INFO[profile.type].zero || []).map(b => ({ bid: b, why: `${TYPE_INFO[profile.type].name}类任务没有这个需求` })),
    ...ce.missing.flatMap(x => X_INFO[x].na.map(b => ({ bid: b, why: `任务缺「${X_INFO[x].name}」` }))),
  ].filter((x, i, a) => a.findIndex(y => y.bid === x.bid) === i);
  // D1 不可得：站内没问过 AI（在自己电脑上用的外部 AI 只有截图描述，读不到原话）→ 整体不可评（07 页一）
  if (!chat.length) {
    const emptyB = Object.fromEntries(BIDS.map(b => [b, { bid: b, score: null, obs: BEHAVIORS[b].obs, na: '不可观测（没有和 AI 的对话记录）', evidence: [], related: [], rejected: [], negatives: [] } as BehaviorScore]));
    return { ...base, overall: null, score100: null, tier: '未评估', confidence: { level: '低', note: '没有对话记录，不出分', c_obs: 0, c_elig: ce.value }, status: 'not_assessable',
      status_note: pages.length ? `插件抓到了 ${pages.length} 页外部 AI 的网页原文（${[...new Set(pages.map(p => (p.q.match(/读到的 (\S+) 页面/) || [])[1]).filter(Boolean))].join('、')}），他的提问混在网页正文里，还没抽成一问一答，这一版先不评。` : inp.mode === 'open' || inp.mode === 'plugin' ? '在自己电脑上做、没用平台的 AI 助手：平台只有屏幕截图，读不到他和 AI 说了什么，这套量表评不了。' : '全程没有用 AI 助手，没有对话记录可评。',
      dims: Object.keys(DIMS).map(num => ({ num, name: DIMS[num].name, score: null, weight: 0, observable: 0, total: DIMS[num].behaviors.length, thin: true })), behaviors: emptyB, negatives: [], not_triggered: notTriggered, stats: { user_msgs: 0, candidates: 0, packages: 0, valid: 0 } };
  }
  if (fromOutside) logs.push(`站内没问过 AI，用外部 AI 的提问原话顶上（${inp.outside!.asks.length} 条，${inp.outside!.note}）：只有提问、没有 AI 的回答，迭代 / 纠错 / 质疑推理这类要对齐 AI 上一轮输出的行为判定受限`);
  const a = anchorsOf(chat);
  const B = taskBlocks(chat, inp.events, fromOutside ? inp.outside!.asks.map(x => x.src) : null);
  a.rel = B.of.map((b, i) => B.of.slice(0, i).filter(x => x === b).length); a.size = B.of.map(b => B.list[b].msgs.length);
  logs.push(`任务块：${B.list.length} 块（${B.list.map(x => `${x.id} ${x.label}：第 ${x.msgs[0] + 1}–${x.msgs[x.msgs.length - 1] + 1} 条，${x.msgs.length} 条`).join('；')}）——窗口按块、同块同行为只算 1 条、跨块才算独立证据`);
  logs.push(`锚点：P1=${a.P1 == null ? '—' : a.P1 + 1} O1=${a.O1 == null ? '—' : a.O1 + 1} A_out=${a.Aout == null ? '—' : a.Aout + 1} O_last=${a.Olast == null ? '—' : a.Olast + 1} A_final=${a.Afinal == null ? '—' : a.Afinal + 1}（第几条用户消息）`);
  if (chat.length < 4) logs.push(`用户消息只有 ${chat.length} 条（<4）：B10 / B15 / B16 / B17 自动记 N/A`);
  const { cands, split } = locate(I, a, source, disclosure);
  const hitsBy = new Map<number, Set<string>>();
  for (const c of cands) if (c.src === 'chat') hitsBy.set(c.i, new Set([...(hitsBy.get(c.i) || []), c.bid]));
  const structMsgs = new Set([...hitsBy].filter(([i, h]) => isStructPrompt(chat[i].q, h)).map(([i]) => i));
  const ev = inp.events;
  const adopted = ev.filter(e => e.type === 'adopt').reduce((n, e) => n + (Number(e.chars) || 0), 0);
  const stats = `和站内 AI 助手对话 ${chat.length} 轮；采纳进交付物 ${ev.filter(e => e.type === 'adopt').length} 次（${adopted} 字）；粘贴 ${ev.filter(e => e.type === 'paste').length} 次；交付物 ${(inp.deliverable || '').length} 字${disclosure ? `；提交时写了 AI 参与说明：${disclosure.slice(0, 300)}` : '；提交时没写 AI 参与说明'}`;
  const committee = inp.engine === 'committee' || (!inp.engine && process.env.FLUENCY_ENGINE === 'committee');
  const lastBlock = B.of.length ? B.of[B.of.length - 1] : 0;
  let evs: Evidence[], modelNegs: { id: string; i: number; quote: string }[], scanned: Evidence[] = [];
  if (committee) {
    ({ evs, negs: modelNegs } = await committeeJudge(I, B, cands, logs, warnings));
    arbitrate(evs, structMsgs, logs, true);   // 评委各评各的；合分前由代码统一收口，只在两项引的是同一段话时才去重（11-23）（11-22 评审：同一句话在几个评委那里同时拿分）
  } else {
    ({ evs, negs: modelNegs } = await judge(I, cands, stats, warnings));
    scanned = await scanGaps(I, a, split, evs, stats, logs, warnings);
    evs.push(...scanned);
    for (const e of evs) e.block = e.src === 'chat' && e.i >= 0 && e.i < B.of.length ? B.of[e.i] : lastBlock;
    arbitrate(evs, structMsgs, logs);
  }
  // N4 的「记录里用了」：AI 的内容真进了交付物（采纳，或问过 AI 之后粘贴过成段内容），只问过一句不算
  const firstAsk = chat[0]?.t ?? Infinity;
  const aiIn = ev.some(e => e.type === 'adopt') || ev.some(e => e.type === 'paste' && e.t >= firstAsk && (Number(e.chars) || 0) >= 50);
  const negs = [...detectNegatives(I, split, disclosure, aiIn), ...modelNegs];
  for (const i of structMsgs) if (split[i]?.ratio > 0.8) logs.push(`第 ${i + 1} 条超级 Prompt 与任务书高度相似：加「表演嫌疑」标记，进人工抽检`);
  const behaviors: Record<string, BehaviorScore> = {};
  for (const b of BIDS) {
    let s = scoreBehavior(b, evs, negs, committee ? 'committee' : inp.engine === 'v3-spec' ? 'v3-spec' : 'v3');
    if (NEED_4.has(b) && chat.length < 4 && s.score === 0) s = { ...s, score: null, na: '未观测（用户消息不足 4 条）' };
    if (b === 'B10' && chat.length < 4) s = { ...s, score: null, na: '未观测（用户消息不足 4 条）' };
    const nt = notTriggered.find(x => x.bid === b);
    if (s.score == null && nt) s = { ...s, na: `本次未触发：${nt.why}` };
    behaviors[b] = s;
  }
  const dims: DimScore[] = Object.keys(DIMS).sort().map(num => {
    const bs = DIMS[num].behaviors, vals = bs.map(b => behaviors[b].score).filter((v): v is number => v != null);
    const thin = vals.length / bs.length < 0.5;
    return { num, name: DIMS[num].name, score: vals.length ? Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100 : null, weight: thin ? 0.5 : 1, observable: vals.length, total: bs.length, thin };
  });
  const avail = dims.filter(d => d.score != null);
  let overall = avail.length ? Math.round((avail.reduce((s, d) => s + d.weight * d.score!, 0) / avail.reduce((s, d) => s + d.weight, 0)) * 100) / 100 : null;
  const c_obs = Math.round((BIDS.filter(b => behaviors[b].score != null).length / BIDS.length) * 100) / 100;
  const level: '高' | '中' | '低' = ce.value >= 0.75 ? (c_obs >= 0.5 ? '高' : '中') : '低';
  const note = level === '高' ? '可用于排名与分档' : level === '中' ? '可用于分档，不做精细排序' : '仅作劣汰参考，不用于排名';
  let status: FluencyReport['status'] = 'ok', status_note: string | undefined;
  const negOut = negs.map(n => ({ id: n.id, name: NEGATIVES[n.id]?.name || '转人工', target: NEGATIVES[n.id]?.target || '*', action: NEGATIVES[n.id]?.action || 'C', msg: n.i, quote: n.quote, quoted: (n as any).quoted }));
  if (negOut.some(n => n.action === 'C')) { status = 'manual'; status_note = '触发一票否决类负向，不出自动总分，转人工复核'; overall = null; }
  else if (ce.value < 0.6) { status = 'no_total'; status_note = `任务可及性 C_elig ${ce.value} 低于 0.60：任务本身测不了这套量表，不予评估`; overall = null; }
  else if (ce.value < 0.75) { status = 'no_total'; status_note = `任务可及性 C_elig ${ce.value} 低于 0.75：只出画像不出总分（是任务设计的问题，不是候选人的）`; }
  const shown = status === 'ok' ? overall : null;
  const rep: FluencyReport = {
    ...base, overall: shown, score100: shown == null ? null : Math.round(shown * 20), tier: tierOf(shown),
    confidence: { level, note, c_obs, c_elig: ce.value }, status, status_note, dims, behaviors, negatives: negOut, not_triggered: notTriggered,
    stats: { user_msgs: chat.length, candidates: cands.length, packages: new Set(cands.map(c => `${c.src}:${c.i}`)).size, valid: evs.filter(e => e.valid && !e.related).length, scanned: scanned.length },
    portrait_overall: status === 'no_total' ? overall : null,
    d1_source: fromOutside ? 'outside' : 'platform',
    ...(fromOutside ? { outside: inp.outside! } : {}),
  };
  if (warnings.some(w => /兜底模型/.test(w))) rep.model = `${MODEL}（部分环节用了兜底模型，见 warnings）`;
  if (committee) rep.version = `${FLUENCY_VERSION} · 评审团`; else if (inp.engine === 'v3-spec') rep.version = `${FLUENCY_VERSION} · 照 02 页计分`;
  if (inp.narrate !== false) rep.narrative = await narrate(rep, I).catch(e => { warnings.push(`解读没写出来：${String(e?.message).slice(0, 80)}`); return null; });
  return rep;
}

// ─────────── 解读：高光 / 待提升 / 使用特点 / 面试核验 / 用人建议 ───────────
async function narrate(rep: FluencyReport, inp: FluencyInput): Promise<FluencyNarrative | null> {
  const lines = BIDS.map(b => {
    const x = rep.behaviors[b], sp = BEHAVIORS[b];
    if (x.score == null) return `${b} ${sp.cn}：不计分（${x.na || '未观测'}）`;
    const ev = x.evidence.slice(0, 3).map(e => `「${e.quote}」（${e.q} 档：${e.why}）`).join('；');
    return `${b} ${sp.cn}：${x.score} 分${x.capped ? '（单条证据，封顶 3.5）' : ''}${x.score === 0 ? '（基线行为，整段对话里没做）' : ''}，成立证据 ${x.evidence.length} 条${ev ? `：${ev}` : ''}${x.negatives.length ? `；负向 ${x.negatives.join(' ')}` : ''}`;
  }).join('\n');
  const dims = rep.dims.map(d => `${d.name} ${d.score ?? '—'}（${d.observable}/${d.total} 项可评${d.thin ? '，薄证据减权' : ''}）`).join('；');
  const p = await askJson(`下面是一个候选人做考核任务时和 AI 协作的量表评分结果（潜历「AI 驾驭能力」7 维度 · 25 行为，0–5 分）。请写给招聘方看的解读。
## 任务
${inp.task.title}（${rep.profile.type_name}类）：${inp.task.brief.replace(/\s+/g, ' ').slice(0, 300)}
## 结果
总分：${rep.overall ?? `不出总分（${rep.status_note || ''}）`}；段位：${rep.tier}；置信：${rep.confidence.level}（${rep.confidence.note}）；和 AI 对话 ${rep.stats.user_msgs} 轮
7 维度：${dims}
负向：${rep.negatives.map(n => `${n.id} ${n.name}「${n.quote}」`).join('；') || '无'}
## 25 个行为
${lines}
## 写法
- 只依据上面的分数和证据原文，不新增判断、不编证据；引用原话只用上面「」里的。
- 「0 分」是该做没做（基线行为），「不计分」是没机会或看不到——两者写法必须分开，不计分的不能写成短板。
- 以候选人的做法为主语，克制：写「这次记录里…」，不写「他具备 / 不具备」。
- 给招聘方看：写行为名称（如「目标澄清」），不写 B1 这类编号。
- 对话轮数很少时如实说证据有限，不要硬凑高光；高光只写分数 ≥3 的行为，没有就空数组。
- 待提升优先写 0 分的基线行为和 1–2 分的行为。
- 面试核验写 2–3 条：为什么要核验（指向哪几项分数）、具体追问一句、重点观察什么。
- 用人建议：初步判断一句；适合先拿来验证的任务 2–4 行（任务性质 / 依据哪几项 / 建议的工作条件）；承担哪些任务前要补充验证 2–3 条。
只返回 JSON：
{"summary":"两三句总评","tendency":"工作倾向，用 → 串起 3–4 个动作，如「先补背景 → 要方案 → 逐版修改」；证据不够就写「证据不足以概括」",
"highlights":[{"bid":"B5","title":"一句话标题","text":"两三句","quotes":["原话"]}],
"gaps":[{"bid":"B23","title":"一句话标题","text":"一两句，带改进方向"}],
"patterns":[{"title":"","text":""}],
"interview":[{"topic":"","why":"","ask":"","watch":""}],
"advice":{"verdict":"","fit":[{"task":"","basis":"","condition":""}],"verify":[""]}}`, 'Fluency · 解读', inp.institution);
  if (!p || typeof p !== 'object') return null;
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  const t = (v: any, n = 300) => String(v ?? '').slice(0, n);
  const title = (b: string) => BEHAVIORS[b]?.cn || '';
  return {
    summary: t(p.summary, 400), tendency: t(p.tendency, 120),
    highlights: arr(p.highlights).filter((h: any) => BEHAVIORS[h?.bid] && (rep.behaviors[h.bid].score ?? 0) >= 3).slice(0, 5).map((h: any) => ({ bid: h.bid, title: t(h.title, 60) || title(h.bid), text: t(h.text), quotes: arr(h.quotes).map((q: any) => t(q, 120)).slice(0, 3) })),
    gaps: arr(p.gaps).filter((g: any) => BEHAVIORS[g?.bid] && rep.behaviors[g.bid].score != null).slice(0, 5).map((g: any) => ({ bid: g.bid, title: t(g.title, 60) || title(g.bid), text: t(g.text) })),
    patterns: arr(p.patterns).slice(0, 3).map((x: any) => ({ title: t(x.title, 40), text: t(x.text) })),
    interview: arr(p.interview).slice(0, 3).map((x: any) => ({ topic: t(x.topic, 30), why: t(x.why, 200), ask: t(x.ask, 200), watch: t(x.watch, 200) })),
    advice: { verdict: t(p.advice?.verdict, 200), fit: arr(p.advice?.fit).slice(0, 4).map((x: any) => ({ task: t(x.task, 60), basis: t(x.basis, 80), condition: t(x.condition, 80) })), verify: arr(p.advice?.verify).slice(0, 3).map((x: any) => t(x, 160)) },
  };
}
