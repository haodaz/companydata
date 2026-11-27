/**
 * 统一评价记录（11-27，宇宁《评价体系-数据源与字段设计》）：一次作答 = 一条记录，不管 AI 对话来自站内助手、AI 工作台、
 * 插件读到的外部 AI 网页还是截图——都排成同一条消息流，每条标 source / tool_name，量表只读这一份。
 *   messages[]        站内助手（platform）· AI 工作台（platform，带 tool_calls）· 插件网页（external_tool）· 截图抽出的提问（screenshot_ocr）
 *                     外部 AI 的回答平台拿不到：提问后补一条 { role: 'assistant', unavailable: true }，下游窗口不会错位
 *   platform_meta     每轮实际用的模型、换模型 / 换工具记录（manual 主动 · failure 故障兜底 · unknown 外部工具看不出原因）、打开材料的时点
 *   files[]           候选人上传的文件和上传时点（交付附件；工作台里给 AI 的文件）
 *   deliverables[]    每份交付物正文 + diff_from_ai_output（和 AI 输出原样一致的比例、改写比例、最后一次 AI 输出到提交隔多久）
 *   answers           提交前的 AI 参与说明 + 交付后两问（lib/work/reflect）
 *   coverage          这条记录缺什么（量表据此标「不可观测」，而不是记低分）
 * 不只 AI 驾驭量表用：底座「AI 使用」的核验 / 整合、同题对比、导出给客户的数据集都可以读同一份。
 */
import { reflectText } from '@/lib/work/reflect';

// ─────────── 交付物和 AI 输出的差异 ───────────
const squash = (s: string) => String(s || '').replace(/[\s#*`>|\-_=~]+/g, '');
const K = 10;   // 10 个字一片：中文里 10 字连着一样基本就是照搬，短语巧合撞不上
function shingles(t: string): Set<string> { const g = new Set<string>(); for (let i = 0; i + K <= t.length; i++) g.add(t.slice(i, i + K)); return g; }
/** 平台在交卷时接在交付物后面的东西（附件说明、读到的链接正文）不算他写的 */
export function ownText(deliverable: string) { return String(deliverable || '').split(/\n#{2,3} ?(附件（|交付说明里的链接|Attachments \()/)[0]; }

export interface DiffStat {
  part: string; title: string; chars: number;
  /** 和 AI 输出原样一致的字占比（剔掉同样出现在任务书 / 材料里的字） */
  ai_verbatim_ratio: number;
  /** 1 − ai_verbatim_ratio：自己写或改过的比例；没用 AI 时为 null */
  changed_ratio: number | null;
}
export interface AiDiff {
  parts: DiffStat[]; overall: DiffStat | null;
  /** 最后一次 AI 输出（站内回答 / 工作台写文件）到提交隔了几秒 */
  since_last_ai_sec: number | null;
  /** 最后一次把 AI 内容放进交付物（采纳 / 粘贴）之后，他自己又改了几次、多少字 */
  edits_after_last_in: { count: number; chars: number } | null;
  ai_chars: number;
}

function coverage(text: string, ai: Set<string>, src: Set<string>) {
  const t = squash(text);
  if (t.length < K) return { chars: t.length, ratio: 0 };
  const cov = new Uint8Array(t.length);
  for (let i = 0; i + K <= t.length; i++) { const g = t.slice(i, i + K); if (ai.has(g) && !src.has(g)) cov.fill(1, i, i + K); }
  let n = 0; for (const c of cov) n += c;
  return { chars: t.length, ratio: Math.round((n / t.length) * 1000) / 1000 };
}

/** 交付物按「## D1 标题（格式）」切成几份；只有一份时整篇算一份 */
export function splitParts(deliverable: string): { part: string; title: string; text: string }[] {
  const own = ownText(deliverable);
  const heads = [...own.matchAll(/^## (D\d+) ([^\n（(]*)/gm)];
  if (!heads.length) return [{ part: 'D1', title: '', text: own }];
  return heads.map((m, i) => ({ part: m[1], title: m[2].trim(), text: own.slice(m.index!, i + 1 < heads.length ? heads[i + 1].index : undefined) }));
}

/** AI 写出来的全部文字：站内回答 + 工作台里 AI 写进文件的内容 */
export function aiOutputs(aiChat: any[]): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = [];
  for (const c of aiChat || []) {
    if (/^（插件读到的/.test(c?.q || '')) continue;   // 外部网页正文混着他自己的话，不当 AI 输出
    if (c?.a) out.push({ t: Number(c.t) || 0, text: String(c.a) });
    for (const m of Array.isArray(c?.steps) ? c.steps : []) {
      if (m?.role !== 'assistant') continue;
      for (const k of m.calls || []) { const i = k?.input || {}; for (const v of [i.content, i.new_text, i.code]) if (typeof v === 'string' && v.length > 20) out.push({ t: Number(c.t) || 0, text: v }); }
    }
  }
  return out;
}

export function aiDiff(deliverable: string, aiChat: any[], events: { t: number; type: string; [k: string]: any }[], sourceText: string): AiDiff | null {
  const outs = aiOutputs(aiChat);
  if (!outs.length || !squash(ownText(deliverable))) return null;
  const ai = new Set<string>(); for (const o of outs) for (const g of shingles(squash(o.text))) ai.add(g);
  const src = shingles(squash(sourceText));
  const parts: DiffStat[] = splitParts(deliverable).map(p => { const c = coverage(p.text, ai, src); return { part: p.part, title: p.title, chars: c.chars, ai_verbatim_ratio: c.ratio, changed_ratio: Math.round((1 - c.ratio) * 1000) / 1000 }; });
  const all = coverage(ownText(deliverable), ai, src);
  const ev = [...(events || [])].sort((a, b) => a.t - b.t);
  const submitT = [...ev].reverse().find(e => e.type === 'submit')?.t ?? (ev.length ? ev[ev.length - 1].t : null);
  const lastAi = Math.max(...outs.map(o => o.t));
  const lastIn = [...ev].reverse().find(e => e.type === 'adopt' || e.type === 'paste');
  const after = lastIn ? ev.filter(e => e.t > lastIn.t && (e.type === 'edit' || e.type === 'ws_edit')) : [];
  return {
    parts, overall: { part: '*', title: '全部', chars: all.chars, ai_verbatim_ratio: all.ratio, changed_ratio: Math.round((1 - all.ratio) * 1000) / 1000 },
    since_last_ai_sec: submitT != null && Number.isFinite(lastAi) ? Math.max(0, Math.round(submitT - lastAi)) : null,
    edits_after_last_in: lastIn ? { count: after.length, chars: after.reduce((n, e) => n + Math.abs(Number(e.delta) || 0), 0) } : null,
    ai_chars: outs.reduce((n, o) => n + o.text.length, 0),
  };
}

// ─────────── 统一记录 ───────────
export type MsgSource = 'platform' | 'external_tool' | 'screenshot_ocr';
export interface RecordMsg {
  role: 'user' | 'assistant'; t: number; timestamp: string | null; source: MsgSource; tool_name: string;
  content?: string; unavailable?: true; quoted?: boolean;
  attachments?: { name: string; kind: 'open_material' | 'workspace' | 'upload'; given_at: number; by: 'auto' | 'user' }[];
  tool_calls?: { type: string; query?: string; path?: string }[];
  model?: string; failed?: string[]; complete?: boolean;
}
export interface FluencyRecord {
  schema: 'qianli-fluency-record/1';
  session_id: string; task_id: string; task_title: string; mode: 'bench' | 'agent' | 'open' | 'plugin'; lang: string;
  started_at: string | null; submitted_at: string | null;
  task_template: { brief: string; rules: string[]; materials: { id: string; title: string }[] };
  messages: RecordMsg[];
  platform_meta: { models: string[]; mode_switches: { t: number; from: string; to: string; reason: 'manual' | 'failure' | 'unknown' }[]; materials_opened: { id: string; t: number }[] };
  files: { name: string; uploaded_at: number; part: string; size: number }[];
  deliverables: { part: string; title: string; content_text: string; diff_from_ai_output: DiffStat | null }[];
  diff: AiDiff | null;
  answers: { disclosure: string; share: number | null; best: string; worst: string; fix: string; text: string } | null;
  coverage: { platform_chat: number; agent_turns: number; external_pages: number; outside_asks: number; assistant_unavailable: number; has_answers: boolean; has_diff: boolean; missing: string[] };
}

function quotedRatio(text: string, source: string) {
  const t = squash(text); if (t.length < 80 || !source) return 0;
  let n = 0, hit = 0; for (let i = 0; i + 30 <= t.length; i += 15) { n++; if (source.includes(t.slice(i, i + 30))) hit++; }
  return n ? hit / n : 0;
}

/**
 * task：work_tasks 行（task / materials）；s：work_sessions 行（events / ai_chat / deliverable / started_at / submitted_at / report）。
 * 外部 AI 的提问用报告里已经抽过的（report.fluency.outside），这里不再调模型。
 */
export function buildRecord(task: any, s: any): FluencyRecord {
  const events: any[] = [...(s.events || [])].sort((a, b) => (a.t || 0) - (b.t || 0));
  const chat: any[] = [...(s.ai_chat || [])].sort((a, b) => (a.t || 0) - (b.t || 0));
  const t0 = s.started_at ? new Date(s.started_at).getTime() : null;
  const ts = (t: number) => (t0 == null ? null : new Date(t0 + (Number(t) || 0) * 1000).toISOString());
  const env = task.task?.env?.type;
  const mode: FluencyRecord['mode'] = env === 'agent' ? 'agent' : events.some(e => /^plugin_/.test(e.type)) ? 'plugin' : events.some(e => e.type === 'rec_start') ? 'open' : 'bench';
  const source = squash([task.task?.brief, ...(task.task?.rules || []), ...(task.materials || []).map((m: any) => m.content || '')].join(''));
  const msgs: RecordMsg[] = [];
  const switches: FluencyRecord['platform_meta']['mode_switches'] = [];
  let lastTool = '';
  const noteTool = (t: number, tool: string, reason: 'manual' | 'unknown') => { if (lastTool && tool && tool !== lastTool) switches.push({ t, from: lastTool, to: tool, reason }); if (tool) lastTool = tool; };
  let pages = 0, agentTurns = 0, plat = 0;
  for (const c of chat) {
    const t = Number(c.t) || 0;
    if (/^（插件读到的/.test(c.q || '')) {
      const host = (String(c.q).match(/读到的 (\S+) 页面/) || [])[1] || '';
      pages++; noteTool(t, host, 'unknown');
      // 网页正文里一问一答混在一起，分不开谁说的：整页记一条，role 记 assistant、标出处，由抽提问那一步再拆
      msgs.push({ role: 'assistant', t, timestamp: ts(t), source: 'external_tool', tool_name: host, content: String(c.a || '') });
      continue;
    }
    const q = String(c.q || '');
    if (Array.isArray(c.steps)) {
      agentTurns++;
      const tool = `ai_workbench:${c.model || ''}`;
      noteTool(t, tool, 'manual');
      msgs.push({ role: 'user', t, timestamp: ts(t), source: 'platform', tool_name: tool, content: q, quoted: quotedRatio(q, source) > 0.8, ...(c.plan ? { tool_calls: [{ type: 'plan_mode' }] } : {}) });
      const calls = (c.steps as any[]).filter(m => m?.role === 'assistant').flatMap(m => (m.calls || []).map((k: any) => ({ type: String(k?.name || ''), ...(k?.input?.query ? { query: String(k.input.query).slice(0, 200) } : {}), ...(k?.input?.path ? { path: String(k.input.path).slice(0, 160) } : {}) })));
      const text = (c.steps as any[]).filter(m => m?.role === 'assistant').map(m => m.text || '').filter(Boolean).join('\n\n') || String(c.a || '');
      msgs.push({ role: 'assistant', t, timestamp: ts(t), source: 'platform', tool_name: tool, content: text, model: c.model || '', ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    plat++;
    const model = c.model || 'qwen-plus（2026-11-27 前没逐轮记录）';
    if (c.failed?.length) switches.push({ t, from: c.failed[0], to: c.model, reason: 'failure' });
    msgs.push({ role: 'user', t, timestamp: ts(t), source: 'platform', tool_name: 'assistant', content: q, quoted: quotedRatio(q, source) > 0.8, ...(c.mat || c.files?.length ? { attachments: [
      ...(c.files || []).map((f: any) => ({ name: String(f.name || ''), kind: 'upload' as const, given_at: Number(events.find(e => e.type === 'ai_file' && e.url === f.url)?.t ?? t), by: 'user' as const })),
      ...(c.mat ? [{ name: c.mat.title || c.mat.id, kind: 'open_material' as const, given_at: t, by: 'auto' as const }] : []),
    ] } : {}) });
    msgs.push({ role: 'assistant', t, timestamp: ts(t), source: 'platform', tool_name: 'assistant', content: String(c.a || ''), model, ...(c.failed?.length ? { failed: c.failed } : {}) });
  }
  // 截图 / 插件网页里抽出来的外部 AI 提问（报告里已经抽过的）：每条提问后补一条「这里本该有 AI 回答、但看不到」
  const outside = s.report?.fluency?.outside;
  let unavailable = 0;
  if (outside?.asks?.length && !plat && !agentTurns) {
    for (const a of outside.asks) {
      const src: MsgSource = a.src === 'page' ? 'external_tool' : 'screenshot_ocr';
      msgs.push({ role: 'user', t: a.t, timestamp: ts(a.t), source: src, tool_name: a.tool || '', content: a.q, complete: a.complete !== false, quoted: quotedRatio(a.q, source) > 0.8 });
      msgs.push({ role: 'assistant', t: a.t, timestamp: ts(a.t), source: src, tool_name: a.tool || '', unavailable: true });
      unavailable++;
    }
  }
  msgs.sort((a, b) => a.t - b.t);
  // AI 工作台里主动换模型（agent_model 事件）也记一笔，和逐轮的 model 互相印证
  // （选了没发问的那几次轮次里看不到，补上；note = 换成的模型）
  for (const e of events.filter(e => e.type === 'agent_model')) { const to = `ai_workbench:${e.note || ''}`; if (e.note && !switches.some(x => x.to === to && Math.abs(x.t - e.t) < 600)) switches.push({ t: e.t, from: '', to, reason: 'manual' }); }
  switches.sort((a, b) => a.t - b.t);
  const removed = new Set(events.filter(e => e.type === 'file_remove').map(e => e.url));
  // 交付附件（file 事件）+ AI 工作台里他自己新建、AI 读得到的文件（ws_new；part 记 workspace）
  const files = [
    ...events.filter(e => e.type === 'ai_file').map(e => ({ name: String(e.name || ''), uploaded_at: Number(e.t) || 0, part: 'to_ai', size: Number(e.size) || 0 })),
    ...events.filter(e => e.type === 'file' && e.url && !removed.has(e.url)).map(e => ({ name: String(e.name || ''), uploaded_at: Number(e.t) || 0, part: String(e.part || ''), size: Number(e.size) || 0 })),
    ...events.filter(e => e.type === 'ws_new' && e.note).map(e => ({ name: String(e.note), uploaded_at: Number(e.t) || 0, part: 'workspace', size: 0 })),
  ].sort((a, b) => a.uploaded_at - b.uploaded_at);
  const disc = [...events].reverse().find(e => e.type === 'ai_disclosure');
  const diff = aiDiff(s.deliverable || '', chat, events, [task.task?.brief, ...(task.materials || []).map((m: any) => m.content || '')].join('\n'));
  const parts = splitParts(s.deliverable || '');
  const answers = disc ? { disclosure: String(disc.text || ''), share: disc.share ?? null, best: String(disc.best || ''), worst: String(disc.worst || ''), fix: String(disc.fix || ''), text: reflectText(disc) } : null;
  const missing: string[] = [];
  if (!plat && !agentTurns && !unavailable && !pages) missing.push('没有任何 AI 对话记录');
  if (unavailable) missing.push(`外部 AI 的回答看不到（${unavailable} 处）`);
  if (pages && !unavailable) missing.push('插件读到的外部 AI 网页还没拆成一问一答');
  if (!answers || (answers.share == null && !answers.best && !answers.worst)) missing.push('交付后两问未作答');
  if (!diff) missing.push('算不出交付物和 AI 输出的差异（没有 AI 输出或交付物为空）');
  if (plat && !chat.some(c => c.model)) missing.push('站内助手逐轮模型未记录（11-27 前的作答）');
  return {
    schema: 'qianli-fluency-record/1',
    session_id: s.id, task_id: task.id, task_title: task.task?.title || '', mode, lang: task.task?.lang || 'zh',
    started_at: s.started_at || null, submitted_at: s.submitted_at || null,
    task_template: { brief: task.task?.brief || '', rules: task.task?.rules || [], materials: (task.materials || []).map((m: any) => ({ id: m.id, title: m.title })) },
    messages: msgs,
    platform_meta: { models: [...new Set(msgs.filter(m => m.role === 'assistant' && m.model).map(m => m.model!))], mode_switches: switches, materials_opened: events.filter(e => e.type === 'open_material').map(e => ({ id: String(e.id || ''), t: Number(e.t) || 0 })) },
    files,
    deliverables: parts.map(p => ({ part: p.part, title: p.title, content_text: p.text, diff_from_ai_output: diff?.parts.find(x => x.part === p.part) || null })),
    diff, answers,
    coverage: { platform_chat: plat, agent_turns: agentTurns, external_pages: pages, outside_asks: unavailable, assistant_unavailable: unavailable, has_answers: !!answers && (answers.share != null || !!answers.best || !!answers.worst), has_diff: !!diff, missing },
  };
}
