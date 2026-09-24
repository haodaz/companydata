/**
 * 技能空间 · 模拟操作台（前后端共用）。
 * 一个 sim 是一连串真实工作里的决策动作；新兵、专家、AI 都在同一个操作台上走一遍，留下「操作轨迹」（trace）。
 *   - 新兵的轨迹 → 逐步对照专家轨迹 + 按岗位标准评分
 *   - 专家的轨迹 → 被 AI 核心记录下来（模仿），并在关键决策点被追问「为什么」
 */

import { benchMatch, benchTimeline, sanitizeBenchSpec, sanitizeBenchTrace, type BenchSpec, type BenchTrace } from '@/lib/bench';

export type SimStepType = 'choose' | 'multi' | 'drill' | 'classify' | 'allocate' | 'slider' | 'text' | 'bench';

/** 操作后浮现的信息（下钻出的数据、同事的回复） */
export interface SimReveal { title: string; rows?: { label: string; a?: string; b?: string; delta?: string; hot?: boolean }[]; note?: string }

export interface SimOption { id: string; label: string; detail?: string; reveal?: SimReveal }

export interface SimStep {
  id: string;
  type: SimStepType;
  /** 场景推进：谁在什么时候说了什么 / 发生了什么 */
  scene?: { who: string; time?: string; text: string };
  prompt: string;
  options?: SimOption[];          // choose / multi / drill / classify 的条目
  max?: number;                   // multi / drill 最多选几个
  labels?: { id: string; label: string; tone?: 'hot' | 'cold' }[];  // classify 的分类
  total?: number;                 // allocate 总量
  unit?: string;                  // allocate / slider 单位
  min?: number; maxValue?: number; // slider 范围
  placeholder?: string;           // text
  bench?: BenchSpec;              // bench：虚拟工位设备定义（事件流采集）
}

/** 沉浸模式的美术：全景底图、各步骤的场景图、NPC 立绘（按 scene.who 匹配）。有 cover 就进沉浸模式（全屏场景 + NPC 对话 + 蒙版提问 + 工位 HUD） */
export interface SimArt { cover: string; scenes?: Record<string, string>; npcs?: Record<string, string> }

export interface Sim { title: string; intro: string; steps: SimStep[]; art?: SimArt }

/** 轨迹：stepId → 值。choose: string；multi/drill: string[]；classify / allocate: Record<optionId, string | number>；slider: number；text: string；bench: BenchTrace（事件流） */
export type SimTrace = Record<string, any>;

const optLabel = (step: SimStep, id: string) => step.options?.find(o => o.id === id)?.label || id;

/** 某一步的操作，写成一句人话（报告里展示、也用来喂给评分的大模型） */
export function describeStep(step: SimStep, value: any): string {
  if (value === undefined || value === null || value === '') return '（未操作）';
  switch (step.type) {
    case 'choose': return optLabel(step, value);
    case 'multi':
    case 'drill': return (value as string[]).length ? (value as string[]).map(v => optLabel(step, v)).join('、') : '（一个都没选）';
    case 'classify': return (step.options || []).map(o => `${o.label}→${step.labels?.find(l => l.id === value[o.id])?.label || '未标记'}`).join('；');
    case 'allocate': return (step.options || []).map(o => `${o.label} ${value[o.id] || 0}${step.unit || ''}`).join('；');
    case 'slider': return `${value}${step.unit || ''}`;
    case 'bench': { const m = (value as BenchTrace)?.metrics; return m ? `用时 ${Math.round(m.duration)} 秒 · 目标 ${m.goals_done}/${m.goals_total} · 违规 ${m.violations} · 操作 ${m.actions} 次` : '（未操作）'; }
    default: return String(value);
  }
}

/** 整条轨迹 → 文字记录 */
export function traceToText(sim: Sim, trace: SimTrace): string {
  return sim.steps.map((s, i) => {
    if (s.type === 'bench' && s.bench) {
      const tr = trace[s.id] as BenchTrace | undefined;
      return `【操作 ${i + 1} · 虚拟工位「${s.bench.name}」】${s.prompt}\n${tr?.events?.length ? benchTimeline(s.bench, tr) : '→ （未操作）'}`;
    }
    const skipped = s.type === 'multi' || s.type === 'drill' ? (s.options || []).filter(o => !(trace[s.id] || []).includes(o.id)).map(o => o.label) : [];
    return `【操作 ${i + 1}】${s.prompt}\n→ ${describeStep(s, trace[s.id])}${skipped.length ? `\n（没选：${skipped.join('、')}）` : ''}`;
  }).join('\n\n');
}

/** 这一步和专家的操作有多接近：1 完全一致 · 0.5 部分一致 · 0 不一致 · null 无法比较（文本 / 专家没做） */
export function compareStep(step: SimStep, mine: any, expert: any): number | null {
  if (expert === undefined || expert === null || step.type === 'text') return null;
  if (mine === undefined || mine === null) return 0;
  switch (step.type) {
    case 'choose': return mine === expert ? 1 : 0;
    case 'multi':
    case 'drill': {
      const a = new Set<string>(mine), b = new Set<string>(expert);
      const inter = [...a].filter(x => b.has(x)).length, union = new Set([...a, ...b]).size;
      const j = union ? inter / union : 1;
      return j === 1 ? 1 : j >= 0.5 ? 0.5 : 0;
    }
    case 'classify': {
      const ids = (step.options || []).map(o => o.id);
      const same = ids.filter(id => mine[id] === expert[id]).length;
      return same === ids.length ? 1 : same >= ids.length / 2 ? 0.5 : 0;
    }
    case 'allocate': {
      const ids = (step.options || []).map(o => o.id);
      const diff = ids.reduce((acc, id) => acc + Math.abs((mine[id] || 0) - (expert[id] || 0)), 0) / (2 * (step.total || 1));
      return diff <= 0.15 ? 1 : diff <= 0.4 ? 0.5 : 0;
    }
    case 'slider': { const d = Math.abs(mine - expert); return d <= 10 ? 1 : d <= 25 ? 0.5 : 0; }
    case 'bench': { if (!step.bench || !mine?.events || !expert?.events) return null; const m = benchMatch(step.bench, mine, expert); return m >= 80 ? 1 : m >= 50 ? 0.5 : 0; }
    default: return null;
  }
}

/** 与专家轨迹的整体吻合度 0-100 */
export function traceMatch(sim: Sim, mine: SimTrace, expert?: SimTrace | null): number | null {
  if (!expert) return null;
  const scores = sim.steps.map(s => compareStep(s, mine[s.id], expert[s.id])).filter((x): x is number => x !== null);
  return scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : null;
}

/** 大模型生成的 sim 不一定规整：在这里兜底清洗；清洗后不足 3 步则视为无效 */
export function sanitizeSim(raw: any): Sim | null {
  if (!raw || !Array.isArray(raw.steps)) return null;
  const TYPES: SimStepType[] = ['choose', 'multi', 'drill', 'classify', 'allocate', 'slider', 'text', 'bench'];
  const steps: SimStep[] = [];
  raw.steps.forEach((s: any, i: number) => {
    const type = TYPES.includes(s?.type) ? s.type as SimStepType : null;
    if (!type || !s.prompt) return;
    if (type === 'bench') { const bench = sanitizeBenchSpec(s.bench); if (!bench) return; steps.push({ id: String(s.id || `s${i + 1}`), type, prompt: String(s.prompt), bench, scene: s.scene?.text ? { who: String(s.scene.who || '同事'), time: s.scene.time ? String(s.scene.time) : undefined, text: String(s.scene.text) } : undefined }); return; }
    const options: SimOption[] = (Array.isArray(s.options) ? s.options : []).map((o: any, j: number) => ({ id: String(o.id || `o${j + 1}`), label: String(o.label || '').trim(), detail: o.detail ? String(o.detail) : undefined })).filter((o: SimOption) => o.label);
    if (['choose', 'multi', 'classify', 'allocate'].includes(type) && options.length < 2) return;
    const step: SimStep = { id: String(s.id || `s${i + 1}`), type, prompt: String(s.prompt), options: options.length ? options : undefined };
    if (s.scene?.text) step.scene = { who: String(s.scene.who || '同事'), time: s.scene.time ? String(s.scene.time) : undefined, text: String(s.scene.text) };
    if (type === 'multi') step.max = Math.min(options.length - 1, Math.max(1, parseInt(s.max) || 2));
    if (type === 'classify') {
      const labels = (Array.isArray(s.labels) ? s.labels : []).map((l: any, j: number) => ({ id: String(l.id || `l${j + 1}`), label: String(l.label || '') })).filter((l: any) => l.label);
      if (labels.length < 2) return;
      step.labels = labels.slice(0, 3);
    }
    if (type === 'allocate') { step.total = Math.max(1, Number(s.total) || 100); step.unit = String(s.unit || ''); }
    if (type === 'slider') { step.min = Number(s.min) || 0; step.maxValue = Number(s.maxValue) || 100; step.unit = String(s.unit || '%'); }
    if (type === 'text') step.placeholder = s.placeholder ? String(s.placeholder) : undefined;
    steps.push(step);
  });
  if (steps.length < 3) return null;
  if (steps[steps.length - 1].type !== 'text') steps.push({ id: 'final', type: 'text', prompt: '最后，用几句话写下你的结论。' });
  const sim: Sim = { title: String(raw.title || '模拟操作'), intro: String(raw.intro || ''), steps: steps.slice(0, 8) };
  const url = (v: any) => typeof v === 'string' && /^(\/|https?:\/\/)/.test(v) ? v.slice(0, 500) : null;
  if (raw.art && url(raw.art.cover)) {
    const pick = (o: any) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).map(([k, v]) => [String(k).slice(0, 60), url(v)]).filter(([, v]) => v)) as Record<string, string>;
    sim.art = { cover: url(raw.art.cover)!, scenes: pick(raw.art.scenes), npcs: pick(raw.art.npcs) };
  }
  return sim;
}

/** 清洗一条轨迹，只保留合法的值 */
export function sanitizeTrace(sim: Sim, raw: any): SimTrace {
  const out: SimTrace = {};
  for (const s of sim.steps) {
    const v = raw?.[s.id];
    const ids = new Set((s.options || []).map(o => o.id));
    if (s.type === 'choose') { if (typeof v === 'string' && ids.has(v)) out[s.id] = v; }
    else if (s.type === 'multi' || s.type === 'drill') out[s.id] = (Array.isArray(v) ? v : []).filter((x: any) => ids.has(x)).slice(0, s.max || 99);
    else if (s.type === 'classify') { const m: Record<string, string> = {}; const ls = new Set((s.labels || []).map(l => l.id)); for (const id of ids) if (v && ls.has(v[id])) m[id] = v[id]; out[s.id] = m; }
    else if (s.type === 'allocate') { const m: Record<string, number> = {}; for (const id of ids) m[id] = Math.max(0, Number(v?.[id]) || 0); out[s.id] = m; }
    else if (s.type === 'slider') out[s.id] = Math.min(s.maxValue ?? 100, Math.max(s.min ?? 0, Number(v) || 0));
    else if (s.type === 'bench') { const tr = sanitizeBenchTrace(v); if (tr) out[s.id] = tr; }
    else out[s.id] = typeof v === 'string' ? v.slice(0, 4000) : '';
  }
  return out;
}
