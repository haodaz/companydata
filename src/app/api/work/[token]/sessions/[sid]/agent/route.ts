import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { timing } from '@/lib/work/deadline';
import { errL } from '@/lib/work/errors-en';
import { withCost } from '@/lib/token-logger';
import { stepOnce, type Msg, type Result } from '@/lib/ws/agent';
import { AGENT_MODELS, AGENT_TOOLS, DEFAULT_AGENT_MODEL, PLAN_NOTE, PLAN_TOOLS, agentSystem, outputsOf, workspaceNote } from '@/lib/work/agent-bench';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * AI 工作台的代理（11-17 beta）：前端带着工作区清单来，服务端调一步模型，把工具调用交回前端去沙盒里执行；
 * 前端执行完带着结果再来，直到模型不再调工具。每一步都落在 ai_chat 这一轮的 steps 里（q = 候选人这句话，a = 代理的文字 + 动作摘要），
 * 所以老的评分（AI 使用、AI 驾驭量表）不用改就能读，量表要细看时读 steps。
 * body：{ q, model, files, plan? } 开新一轮（plan = 先出计划，这一轮只许看）· { results, files } 交回工具结果 · { results, stop: true } 候选人叫停 · { search } 代理的联网检索
 * stream: true 时按行回 NDJSON：{t:'text',delta} 逐字 · {t:'input',chars} 正在写工具参数（写长文件）· 最后一行 {t:'done', ...结果}
 */
type Turn = { t: number; q: string; a: string; model: string; steps: Msg[]; stopped?: boolean; n?: number; plan?: boolean; /** 这一轮开始时的工作区快照（只进给模型的历史，不进 q） */ ws?: string };
const SEARCH_MODEL = process.env.AGENT_SEARCH_MODEL || 'qwen-plus';
const MAX_STEPS = 40;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n……（后面 ${s.length - n} 字略）` : s);

/** 存库 / 回放时控制体积：写文件的整段内容、太长的工具结果截短；越早的截得越狠 */
function slim(m: Msg, hard: boolean): Msg {
  if (m.role === 'assistant') return { ...m, raw: undefined, calls: m.calls.map(c => ({ ...c, input: c.input && typeof c.input.content === 'string' && c.input.content.length > (hard ? 400 : 20000) ? { ...c.input, content: clip(c.input.content, hard ? 400 : 20000) } : c.input })) };
  if (m.role === 'tool') return { ...m, results: m.results.map(r => ({ ...r, content: clip(r.content, hard ? 600 : 6000) })) };
  return m;
}
function historyOf(turns: Turn[]): Msg[] {
  const out: Msg[] = [];
  turns.forEach((tn, i) => { const old = i < turns.length - 3; out.push({ role: 'user', text: tn.ws ? `${tn.q}\n\n${tn.ws}` : tn.q }); for (const m of tn.steps) out.push(slim(m, old)); if (tn.stopped && out[out.length - 1]?.role === 'tool') out.push({ role: 'assistant', text: '（用户叫停了这一轮）', calls: [] }); });
  return out;
}
const summary = (tn: Turn) => tn.steps.flatMap(m => m.role === 'assistant' ? [m.text, ...m.calls.map(c => `［${c.name}${c.input?.path ? ` ${c.input.path}` : ''}］`)] : []).filter(Boolean).join('\n').slice(0, 8000);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('id, task, materials, company_name, role').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: errL(t, '链接不可用') }, { status: 404 });
  if (t.task?.env?.type !== 'agent') return NextResponse.json({ ok: false, error: '这道题不是AI 工作台' }, { status: 400 });
  const { data: s } = await db.from('work_sessions').select('id, ai_chat, submitted_at, started_at').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: errL(t, '没有这次作答') }, { status: 404 });
  if (s.submitted_at) return NextResponse.json({ ok: false, error: errL(t, '已经交卷了') }, { status: 409 });
  if (timing(t.task, s).closed) return NextResponse.json({ ok: false, error: errL(t, '时间到了'), expired: true }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  // 代理的联网检索：前端执行 web_search 时来这里（结果也会作为工具结果记进这一轮）
  if (typeof body.search === 'string') {
    const q = body.search.trim().slice(0, 300);
    if (!q) return NextResponse.json({ ok: false, error: '检索词为空' }, { status: 400 });
    try {
      const r = await generateContent(`联网检索并回答：${q}\n要求：列 3–6 条要点，每条是检索到的事实（带数字的写清口径和时间），句末用 [n] 标来源编号；查不到就直说查不到，不要编。`, SEARCH_MODEL, { webSearch: true });
      await logTokenUsage({ tool_name: 'work', task_name: 'Work · AI 工作台检索', institution: t.company_name || '', model_id: SEARCH_MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
      return NextResponse.json({ ok: true, text: String(r.text || '').slice(0, 6000) });
    } catch (e: any) { return NextResponse.json({ ok: false, error: `检索失败：${String(e?.message || e).slice(0, 120)}` }, { status: 500 }); }
  }
  const turns: Turn[] = (s.ai_chat || []).filter((x: any) => Array.isArray(x?.steps));
  const others = (s.ai_chat || []).filter((x: any) => !Array.isArray(x?.steps));
  const tsec = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 300).map((f: any) => ({ path: String(f.path || '').slice(0, 200), size: Number(f.size) || 0, by: f.by }));
  const save = async () => { await db.from('work_sessions').update({ ai_chat: [...others, ...turns].slice(-200) }).eq('id', sid); };

  let cur: Turn;
  if (typeof body.q === 'string' && body.q.trim()) {
    const model = AGENT_MODELS.some(m => m.id === body.model) ? body.model : DEFAULT_AGENT_MODEL;
    // 上一轮还停在工具调用上（页面刷新 / 断网）：补一条「没执行」的结果，让对话成对
    const last = turns[turns.length - 1], tail = last?.steps[last.steps.length - 1];
    if (tail?.role === 'assistant' && tail.calls.length) last.steps.push({ role: 'tool', results: tail.calls.map(c => ({ id: c.id, name: c.name, content: JSON.stringify({ error: '没有执行（页面中断）' }), is_error: true })) });
    cur = { t: tsec, q: String(body.q).trim().slice(0, 8000), a: '', model, steps: [], n: 0, ...(body.plan ? { plan: true } : {}), ws: workspaceNote(files, outputsOf(t)) };
    turns.push(cur);
  } else {
    cur = turns[turns.length - 1];
    const tail = cur?.steps[cur.steps.length - 1];
    if (!cur || tail?.role !== 'assistant' || !tail.calls.length) return NextResponse.json({ ok: false, error: '没有在等的工具调用' }, { status: 400 });
    const got = new Map<string, any>((Array.isArray(body.results) ? body.results : []).map((r: any) => [String(r.id), r]));
    const results: Result[] = tail.calls.map(c => { const r = got.get(c.id); return { id: c.id, name: c.name, content: String(r?.content ?? JSON.stringify({ error: body.stop ? '用户叫停了，没执行' : '没有结果' })).slice(0, 20000), ...(r?.is_error || !r ? { is_error: true } : {}) }; });
    cur.steps.push({ role: 'tool', results });
    if (body.stop) { cur.stopped = true; cur.a = summary(cur); await save(); return NextResponse.json({ ok: true, done: true, stopped: true }); }
  }
  if ((cur.n || 0) >= MAX_STEPS) { cur.a = summary(cur) + `\n（这一轮已经连续走了 ${MAX_STEPS} 步，先停下来，请你看看结果再说下一步）`; await save(); return NextResponse.json({ ok: true, done: true, text: `这一轮已经连续走了 ${MAX_STEPS} 步，我先停下来。你看看现在的结果，告诉我下一步怎么做。`, calls: [] }); }

  const outputs = outputsOf(t);
  // eager_input_streaming：工具参数边生成边推（写长文件时进度能动）；千问那边只取 name / description / input_schema，不受影响
  const kit = { system: agentSystem(t, outputs, t.task?.lang) + (cur.plan ? PLAN_NOTE : ''), tools: (cur.plan ? AGENT_TOOLS.filter(x => PLAN_TOOLS.has(x.name)) : AGENT_TOOLS).map(x => ({ ...x, eager_input_streaming: true }) as any), run: async () => ({ result: null, label: '' }), org: t.company_name || '', task: 'Work · AI 工作台代理', streamInput: true, maxTokens: 16000 };
  const run = async (emit: (e: any) => void) => {
    const t0 = Date.now();
    try {
      const call = () => withCost({ tool_name: 'work', task_name: 'Work · AI 工作台代理', stage: 'use' }, () => stepOnce(historyOf(turns), cur.model, kit, e => { if (e.t === 'text') emit({ t: 'text', delta: e.delta }); else if (e.t === 'tool_progress' && e.part === 'input') emit({ t: 'input', chars: e.data?.chars || 0 }); }));
      let out = await call();
      // 输出到上限被截断（一次写了太长的文件）：工具调用不完整已丢弃。平台直接告诉代理拆开写、当场重试（最多 2 次），不把皮球踢给用户（11-17：模拟里连写 4 次 3.2 万 token 都被截断）
      for (let k = 0; k < 2 && out.truncated; k++) {
        cur.steps.push({ role: 'assistant', text: `${out.text ? out.text + '\n\n' : ''}（这一步输出太长被截断了，没有写成。）`, calls: [], provider: out.provider, at: new Date().toISOString() });
        cur.steps.push({ role: 'user', text: '（平台提示：你上一步一次输出的内容超过了单步上限，被截断、没有生效。把文件拆开写：先用 write_file 写前 150 行左右，再用 write_file 加 append: true 一段段接上；每次不超过 200 行。现在继续。）' });
        emit({ t: 'text', delta: '\n（这一步太长被截断了，改成分段写…）\n' });
        out = await call();
      }
      if (out.truncated) out.text = `${out.text ? out.text + '\n\n' : ''}（这一步输出太长被截断了，文件没有写成。）`;
      cur.steps.push({ role: 'assistant', text: out.text, calls: out.calls, provider: out.provider, at: new Date().toISOString() });
      cur.n = (cur.n || 0) + 1;
      cur.a = summary(cur);
      await save();
      return { ok: true, text: out.text, calls: out.calls, done: !out.calls.length, plan: !!cur.plan, ms: Date.now() - t0, t: tsec };
    } catch (e: any) {
      // 模型出错：这一轮留个说明，别让对话停在半截
      cur.steps.push({ role: 'assistant', text: `（AI 出错了：${String(e?.message || e).slice(0, 120)}）`, calls: [] });
      cur.a = summary(cur); await save();
      return { ok: false, error: `AI 出错了，再说一次试试（${String(e?.message || e).slice(0, 80)}）` };
    }
  };
  if (!body.stream) { const r = await run(() => {}); return NextResponse.json(r, { status: r.ok ? 200 : 500 }); }
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(ctrl) {
      const line = (o: any) => { try { ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { /* 前端断了 */ } };
      let last = 0;
      const r = await run(e => { if (e.t === 'input') { if (e.chars - last < 200) return; last = e.chars; } line(e); });
      line({ ...r, t: 'done' });   // r 里的 t 是开始后第几秒，别把 done 标记盖掉
      ctrl.close();
    },
  }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}

/** 刷新 / 换设备回来：把这次作答和代理的对话还原给前端（文件内容不回传，前端从草稿恢复） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('id').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('ai_chat, draft').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false }, { status: 404 });
  const turns = (s.ai_chat || []).filter((x: any) => Array.isArray(x?.steps)).map((tn: Turn) => ({ t: tn.t, q: tn.q, model: tn.model, stopped: !!tn.stopped, plan: !!tn.plan, steps: tn.steps.map(m => slim(m, true)) }));
  return NextResponse.json({ ok: true, turns, draft: s.draft || null });
}
