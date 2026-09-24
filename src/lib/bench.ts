/**
 * 虚拟工位（bench）：数字模拟的设备操作台，采的是「过程」而不是「结论」。
 *   - 设备用数据定义：变量（带动力学）、控件（旋钮 / 开关 / 按钮）、仪表、规则（违规 / 提醒）、目标（含保持时长与先后顺序）
 *   - 操作时每一次控件变化、每一次越线、每一个目标达成都写进带时间戳的事件流；面板快照也作为事件存进来（数字工位的「俯拍镜头」）
 *   - 跑完得到确定性的过程指标 + 一段人话时间线（喂给评分的大模型）+ 和专家事件序列的吻合度
 * 前后端共用，纯函数，不依赖 DOM；表达式用自带的小解析器求值，不用 eval。
 */

export interface BenchControl { id: string; label: string; kind: 'knob' | 'switch' | 'button'; min?: number; max?: number; step?: number; unit?: string; initial?: number; hint?: string }
export interface BenchGauge { id: string; label: string; unit: string; expr: string; min: number; max: number; digits?: number; warn?: string }
export interface BenchVar { id: string; label?: string; initial: number; rate?: string; set?: string; min?: number; max?: number }
export interface BenchRule { id: string; label: string; when: string; severity: 'violation' | 'warning'; once?: boolean }
export interface BenchGoal { id: string; label: string; when: string; hold?: number; after?: string }
export interface BenchAction { t: number; control: string; value: number }
export interface BenchSpec {
  name: string; brief: string;
  /** 每真实 1 秒推进多少模拟秒 */ timeScale: number;
  /** 模拟秒上限 */ maxSeconds: number;
  vars: BenchVar[]; controls: BenchControl[]; gauges: BenchGauge[]; rules: BenchRule[]; goals: BenchGoal[];
  /** 专家脚本：灌入时用它在模拟器里跑出专家轨迹 */ expertScript?: BenchAction[];
}

export interface BenchEvent { t: number; kind: 'control' | 'rule' | 'goal' | 'snapshot' | 'note' | 'finish'; control?: string; value?: number; prev?: number; id?: string; label?: string; severity?: 'violation' | 'warning'; state?: Record<string, number>; image?: string; text?: string }
export interface BenchMetrics { duration: number; actions: number; violations: number; warnings: number; goals_done: number; goals_total: number; reversals: number; max_idle: number; time_to_goal: Record<string, number | null>; order: string[] }
export interface BenchTrace { events: BenchEvent[]; final: Record<string, number>; duration: number; metrics: BenchMetrics; finished: boolean }

// ────────────────────────────────────────────
// 安全表达式求值：数字、变量、+ - * / %、比较、&& || !、三元、括号、min/max/abs/clamp
// ────────────────────────────────────────────
type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };
const OPS = ['&&', '||', '<=', '>=', '==', '!=', '+', '-', '*', '/', '%', '<', '>', '!', '(', ')', ',', '?', ':'];
function tokenize(src: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) { const m = src.slice(i).match(/^\d*\.?\d+(?:e-?\d+)?/i)!; out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if (/[a-zA-Z_]/.test(ch)) { const m = src.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)!; out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    const op = OPS.find(o => src.startsWith(o, i));
    if (!op) throw new Error(`表达式无法解析: ${src.slice(i, i + 8)}`);
    out.push({ t: 'op', v: op }); i += op.length;
  }
  return out;
}
const cache = new Map<string, Tok[]>();
export function evalExpr(src: string, env: Record<string, number>): number {
  if (!cache.has(src)) cache.set(src, tokenize(src));
  const toks = cache.get(src)!; let p = 0;
  const peek = () => toks[p]; const take = () => toks[p++];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as any).v === v;
  const num = (b: boolean) => (b ? 1 : 0);
  const ternary = (): number => { const c = or(); if (isOp('?')) { take(); const a = ternary(); if (!isOp(':')) throw new Error('缺少 :'); take(); const b = ternary(); return c ? a : b; } return c; };
  const or = (): number => { let a = and(); while (isOp('||')) { take(); const b = and(); a = num(!!a || !!b); } return a; };
  const and = (): number => { let a = cmp(); while (isOp('&&')) { take(); const b = cmp(); a = num(!!a && !!b); } return a; };
  const cmp = (): number => { let a = add(); for (;;) { const o = peek(); if (o?.t !== 'op' || !['<', '<=', '>', '>=', '==', '!='].includes(o.v)) return a; take(); const b = add(); a = num(o.v === '<' ? a < b : o.v === '<=' ? a <= b : o.v === '>' ? a > b : o.v === '>=' ? a >= b : o.v === '==' ? a === b : a !== b); } };
  const add = (): number => { let a = mul(); for (;;) { const o = peek(); if (o?.t !== 'op' || !['+', '-'].includes(o.v)) return a; take(); const b = mul(); a = o.v === '+' ? a + b : a - b; } };
  const mul = (): number => { let a = unary(); for (;;) { const o = peek(); if (o?.t !== 'op' || !['*', '/', '%'].includes(o.v)) return a; take(); const b = unary(); a = o.v === '*' ? a * b : o.v === '/' ? (b === 0 ? 0 : a / b) : (b === 0 ? 0 : a % b); } };
  const unary = (): number => { if (isOp('-')) { take(); return -unary(); } if (isOp('!')) { take(); return num(!unary()); } return atom(); };
  const atom = (): number => {
    const tk = take();
    if (!tk) throw new Error('表达式不完整');
    if (tk.t === 'num') return tk.v;
    if (tk.t === 'op' && tk.v === '(') { const v = ternary(); if (!isOp(')')) throw new Error('缺少 )'); take(); return v; }
    if (tk.t === 'id') {
      if (isOp('(')) { take(); const args: number[] = []; if (!isOp(')')) { args.push(ternary()); while (isOp(',')) { take(); args.push(ternary()); } } if (!isOp(')')) throw new Error('缺少 )'); take();
        switch (tk.v) { case 'min': return Math.min(...args); case 'max': return Math.max(...args); case 'abs': return Math.abs(args[0] || 0); case 'clamp': return Math.min(args[2], Math.max(args[1], args[0])); default: throw new Error(`未知函数 ${tk.v}`); } }
      const v = env[tk.v]; if (v === undefined) throw new Error(`未知变量 ${tk.v}`); return v;
    }
    throw new Error(`意外的 ${(tk as any).v}`);
  };
  const v = ternary();
  if (p < toks.length) throw new Error('表达式有多余内容');
  return Number.isFinite(v) ? v : 0;
}

// ────────────────────────────────────────────
// 模拟器
// ────────────────────────────────────────────
export interface BenchState { t: number; vars: Record<string, number>; controls: Record<string, number>; goalDone: Record<string, number | null>; goalHold: Record<string, number>; ruleActive: Record<string, boolean>; ruleFired: Record<string, boolean>; events: BenchEvent[]; lastActionT: number; maxIdle: number; lastDir: Record<string, number>; reversals: number }

export function benchEnv(spec: BenchSpec, st: BenchState): Record<string, number> {
  const env: Record<string, number> = { t: st.t, ...st.vars, ...st.controls };
  for (const g of spec.goals) env[`done_${g.id}`] = st.goalDone[g.id] !== null && st.goalDone[g.id] !== undefined ? 1 : 0;
  return env;
}

export function initBench(spec: BenchSpec): BenchState {
  const st: BenchState = { t: 0, vars: {}, controls: {}, goalDone: {}, goalHold: {}, ruleActive: {}, ruleFired: {}, events: [], lastActionT: 0, maxIdle: 0, lastDir: {}, reversals: 0 };
  for (const v of spec.vars) st.vars[v.id] = v.initial;
  for (const c of spec.controls) st.controls[c.id] = c.initial ?? 0;
  for (const g of spec.goals) { st.goalDone[g.id] = null; st.goalHold[g.id] = 0; }
  return st;
}

export function applyControl(spec: BenchSpec, st: BenchState, id: string, value: number) {
  const c = spec.controls.find(x => x.id === id);
  if (!c) return;
  let v = value;
  if (c.kind === 'knob') v = Math.min(c.max ?? 100, Math.max(c.min ?? 0, v));
  else v = v ? 1 : 0;
  const prev = st.controls[id];
  if (prev === v && c.kind !== 'button') return;
  st.controls[id] = v;
  st.events.push({ t: st.t, kind: 'control', control: id, value: v, prev, state: { ...st.vars } });
  st.maxIdle = Math.max(st.maxIdle, st.t - st.lastActionT); st.lastActionT = st.t;
  if (c.kind === 'knob') { const dir = Math.sign(v - prev); if (dir && st.lastDir[id] && dir !== st.lastDir[id]) st.reversals++; if (dir) st.lastDir[id] = dir; }
}

/** 推进 dt 模拟秒：积分变量，评估规则与目标 */
export function tickBench(spec: BenchSpec, st: BenchState, dt: number) {
  st.t += dt;
  const env = benchEnv(spec, st);
  const next: Record<string, number> = {};
  for (const v of spec.vars) {
    let val = st.vars[v.id];
    if (v.set) val = evalExpr(v.set, env);
    else if (v.rate) val += evalExpr(v.rate, env) * dt;
    if (v.min !== undefined) val = Math.max(v.min, val);
    if (v.max !== undefined) val = Math.min(v.max, val);
    next[v.id] = val;
  }
  st.vars = next;
  // 按钮是瞬时的：这一拍用完就复位
  for (const c of spec.controls) if (c.kind === 'button' && st.controls[c.id]) st.controls[c.id] = 0;
  const env2 = benchEnv(spec, st);
  for (const r of spec.rules) {
    const on = !!evalExpr(r.when, env2);
    if (on && !st.ruleActive[r.id] && !(r.once && st.ruleFired[r.id])) {
      st.events.push({ t: st.t, kind: 'rule', id: r.id, label: r.label, severity: r.severity, state: { ...st.vars } });
      st.ruleFired[r.id] = true;
    }
    st.ruleActive[r.id] = on;
  }
  for (const g of spec.goals) {
    if (st.goalDone[g.id] !== null) continue;
    if (g.after && st.goalDone[g.after] === null) continue;
    const ok = !!evalExpr(g.when, env2);
    if (!ok) { st.goalHold[g.id] = 0; continue; }
    st.goalHold[g.id] += dt;
    if (st.goalHold[g.id] >= (g.hold || 0)) { st.goalDone[g.id] = st.t; st.events.push({ t: st.t, kind: 'goal', id: g.id, label: g.label, state: { ...st.vars } }); }
  }
}

export function benchMetrics(spec: BenchSpec, st: BenchState): BenchMetrics {
  const actions = st.events.filter(e => e.kind === 'control');
  const seen = new Set<string>(); const order: string[] = [];
  for (const a of actions) { const k = a.control!; if (!seen.has(k)) { seen.add(k); order.push(k); } }
  return {
    duration: Math.round(st.t), actions: actions.length,
    violations: st.events.filter(e => e.kind === 'rule' && e.severity === 'violation').length,
    warnings: st.events.filter(e => e.kind === 'rule' && e.severity === 'warning').length,
    goals_done: spec.goals.filter(g => st.goalDone[g.id] !== null).length, goals_total: spec.goals.length,
    reversals: st.reversals, max_idle: Math.round(Math.max(st.maxIdle, st.t - st.lastActionT)),
    time_to_goal: Object.fromEntries(spec.goals.map(g => [g.id, st.goalDone[g.id] === null ? null : Math.round(st.goalDone[g.id]!)])),
    order,
  };
}

export function finishBench(spec: BenchSpec, st: BenchState, finished = true): BenchTrace {
  if (!st.events.some(e => e.kind === 'finish')) st.events.push({ t: st.t, kind: 'finish', state: { ...st.vars } });
  return { events: st.events, final: { ...st.vars, ...st.controls }, duration: Math.round(st.t), metrics: benchMetrics(spec, st), finished };
}

/** 无头跑一段脚本（专家轨迹 / 单元测试用） */
export function simulateScript(spec: BenchSpec, actions: BenchAction[], untilSec: number, dt = 1): BenchTrace {
  const st = initBench(spec);
  const sorted = [...actions].sort((a, b) => a.t - b.t); let i = 0;
  while (st.t < untilSec) {
    while (i < sorted.length && sorted[i].t <= st.t) { applyControl(spec, st, sorted[i].control, sorted[i].value); i++; }
    tickBench(spec, st, dt);
  }
  return finishBench(spec, st, true);
}

// ────────────────────────────────────────────
// 展示 / 评分
// ────────────────────────────────────────────
export const fmtT = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function controlText(spec: BenchSpec, e: BenchEvent): string {
  const c = spec.controls.find(x => x.id === e.control);
  if (!c) return `${e.control} → ${e.value}`;
  if (c.kind === 'switch') return `${c.label} ${e.value ? '开' : '关'}`;
  if (c.kind === 'button') return `按下「${c.label}」`;
  return `${c.label} ${e.prev ?? ''}${c.unit || ''} → ${e.value}${c.unit || ''}`;
}

/** 事件流 → 人话时间线 + 指标（喂给评分模型、也在报告里展示） */
export function benchTimeline(spec: BenchSpec, trace: BenchTrace): string {
  const lines: string[] = [];
  const keyVars = spec.gauges.slice(0, 3);
  const snap = (state?: Record<string, number>) => state ? keyVars.map(g => { try { return `${g.label} ${evalExpr(g.expr, { t: 0, ...trace.final, ...state }).toFixed(g.digits ?? 0)}${g.unit}`; } catch { return ''; } }).filter(Boolean).join('，') : '';
  for (const e of trace.events) {
    if (e.kind === 'control') lines.push(`${fmtT(e.t)} ${controlText(spec, e)}（${snap(e.state)}）`);
    else if (e.kind === 'rule') lines.push(`${fmtT(e.t)} ${e.severity === 'violation' ? '⛔ 违规' : '⚠ 提醒'}：${e.label}（${snap(e.state)}）`);
    else if (e.kind === 'goal') lines.push(`${fmtT(e.t)} ✅ 达成：${e.label}`);
    else if (e.kind === 'note') lines.push(`${fmtT(e.t)} 口述：${e.text}`);
    else if (e.kind === 'finish') lines.push(`${fmtT(e.t)} 结束操作`);
  }
  const m = trace.metrics;
  lines.push('', `【过程指标】用时 ${fmtT(m.duration)}，操作 ${m.actions} 次，目标达成 ${m.goals_done}/${m.goals_total}，违规 ${m.violations}，提醒 ${m.warnings}，反复调整 ${m.reversals} 次，最长停顿 ${m.max_idle} 秒，操作顺序：${m.order.map(id => spec.controls.find(c => c.id === id)?.label || id).join(' → ')}`);
  const missed = spec.goals.filter(g => m.time_to_goal[g.id] === null).map(g => g.label);
  if (missed.length) lines.push(`未达成：${missed.join('、')}`);
  return lines.join('\n');
}

function lcs(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

/** 与专家的吻合度 0-100：操作顺序相似（50）+ 目标达成与违规接近（50） */
export function benchMatch(spec: BenchSpec, mine: BenchTrace, expert: BenchTrace): number {
  const seq = (t: BenchTrace) => t.events.filter(e => e.kind === 'control').map(e => { const c = spec.controls.find(x => x.id === e.control); const dir = c?.kind === 'knob' ? (e.value! > (e.prev ?? 0) ? '+' : '-') : String(e.value); return `${e.control}${dir}`; });
  const a = seq(mine), b = seq(expert);
  const order = a.length && b.length ? lcs(a, b) / Math.max(a.length, b.length) : 0;
  const goals = expert.metrics.goals_total ? mine.metrics.goals_done / expert.metrics.goals_total : 0;
  const viol = 1 / (1 + Math.max(0, mine.metrics.violations - expert.metrics.violations));
  const speed = expert.metrics.duration ? Math.max(0, 1 - Math.abs(mine.metrics.duration - expert.metrics.duration) / (2 * expert.metrics.duration)) : 1;
  return Math.round((order * 50 + goals * 25 + viol * 15 + speed * 10));
}

// ────────────────────────────────────────────
// 清洗
// ────────────────────────────────────────────
export function sanitizeBenchSpec(raw: any): BenchSpec | null {
  if (!raw || !Array.isArray(raw.controls) || !Array.isArray(raw.vars) || !Array.isArray(raw.goals)) return null;
  const spec: BenchSpec = {
    name: String(raw.name || '虚拟工位'), brief: String(raw.brief || ''), timeScale: Math.max(1, Number(raw.timeScale) || 10), maxSeconds: Math.max(60, Number(raw.maxSeconds) || 900),
    vars: raw.vars.filter((v: any) => v?.id).map((v: any) => ({ id: String(v.id), label: v.label ? String(v.label) : undefined, initial: Number(v.initial) || 0, rate: v.rate ? String(v.rate) : undefined, set: v.set ? String(v.set) : undefined, min: v.min !== undefined ? Number(v.min) : undefined, max: v.max !== undefined ? Number(v.max) : undefined })),
    controls: raw.controls.filter((c: any) => c?.id && c?.label).map((c: any) => ({ id: String(c.id), label: String(c.label), kind: ['knob', 'switch', 'button'].includes(c.kind) ? c.kind : 'switch', min: c.min !== undefined ? Number(c.min) : 0, max: c.max !== undefined ? Number(c.max) : 100, step: c.step !== undefined ? Number(c.step) : undefined, unit: c.unit ? String(c.unit) : '', initial: Number(c.initial) || 0, hint: c.hint ? String(c.hint) : undefined })),
    gauges: (Array.isArray(raw.gauges) ? raw.gauges : []).filter((g: any) => g?.id && g?.expr).map((g: any) => ({ id: String(g.id), label: String(g.label || g.id), unit: String(g.unit || ''), expr: String(g.expr), min: Number(g.min) || 0, max: Number(g.max) || 100, digits: g.digits !== undefined ? Number(g.digits) : undefined, warn: g.warn ? String(g.warn) : undefined })),
    rules: (Array.isArray(raw.rules) ? raw.rules : []).filter((r: any) => r?.id && r?.when).map((r: any) => ({ id: String(r.id), label: String(r.label || r.id), when: String(r.when), severity: r.severity === 'warning' ? 'warning' : 'violation', once: !!r.once })),
    goals: raw.goals.filter((g: any) => g?.id && g?.when).map((g: any) => ({ id: String(g.id), label: String(g.label || g.id), when: String(g.when), hold: g.hold ? Number(g.hold) : undefined, after: g.after ? String(g.after) : undefined })),
    expertScript: Array.isArray(raw.expertScript) ? raw.expertScript.filter((a: any) => a?.control).map((a: any) => ({ t: Number(a.t) || 0, control: String(a.control), value: Number(a.value) || 0 })) : undefined,
  };
  if (!spec.controls.length || !spec.goals.length) return null;
  // 表达式都要能求值
  try { const st = initBench(spec); const env = benchEnv(spec, st); for (const v of spec.vars) { if (v.rate) evalExpr(v.rate, env); if (v.set) evalExpr(v.set, env); } for (const g of spec.gauges) evalExpr(g.expr, env); for (const r of spec.rules) evalExpr(r.when, env); for (const g of spec.goals) evalExpr(g.when, env); } catch { return null; }
  return spec;
}

const MAX_EVENTS = 600, MAX_SNAPSHOTS = 16, MAX_IMAGE = 60_000;
export function sanitizeBenchTrace(raw: any): BenchTrace | null {
  if (!raw || !Array.isArray(raw.events)) return null;
  let snaps = 0;
  const events: BenchEvent[] = raw.events.filter((e: any) => e && typeof e.t === 'number' && ['control', 'rule', 'goal', 'snapshot', 'note', 'finish'].includes(e.kind)).slice(0, MAX_EVENTS).map((e: any) => {
    const out: BenchEvent = { t: Math.max(0, e.t), kind: e.kind };
    if (e.control !== undefined) out.control = String(e.control);
    if (e.value !== undefined) out.value = Number(e.value);
    if (e.prev !== undefined) out.prev = Number(e.prev);
    if (e.id) out.id = String(e.id); if (e.label) out.label = String(e.label).slice(0, 200);
    if (e.severity) out.severity = e.severity === 'warning' ? 'warning' : 'violation';
    if (e.state && typeof e.state === 'object') out.state = Object.fromEntries(Object.entries(e.state).filter(([, v]) => typeof v === 'number') as [string, number][]);
    if (e.text) out.text = String(e.text).slice(0, 500);
    if (e.kind === 'snapshot' && typeof e.image === 'string' && e.image.startsWith('data:image/') && e.image.length <= MAX_IMAGE && snaps < MAX_SNAPSHOTS) { out.image = e.image; snaps++; }
    return out;
  }).filter((e: BenchEvent) => e.kind !== 'snapshot' || e.image);
  const m = raw.metrics || {};
  return {
    events, final: Object.fromEntries(Object.entries(raw.final || {}).filter(([, v]) => typeof v === 'number') as [string, number][]),
    duration: Math.max(0, Number(raw.duration) || 0), finished: raw.finished !== false,
    metrics: { duration: Number(m.duration) || 0, actions: Number(m.actions) || 0, violations: Number(m.violations) || 0, warnings: Number(m.warnings) || 0, goals_done: Number(m.goals_done) || 0, goals_total: Number(m.goals_total) || 0, reversals: Number(m.reversals) || 0, max_idle: Number(m.max_idle) || 0, time_to_goal: m.time_to_goal && typeof m.time_to_goal === 'object' ? m.time_to_goal : {}, order: Array.isArray(m.order) ? m.order.map(String) : [] },
  };
}
