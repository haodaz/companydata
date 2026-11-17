import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { timing } from '@/lib/work/deadline';
import { errL } from '@/lib/work/errors-en';
import { withCost } from '@/lib/token-logger';
import { stepOnce, type Msg, type Result } from '@/lib/ws/agent';
import { AGENT_MODELS, AGENT_TOOLS, DEFAULT_AGENT_MODEL, agentSystem, outputsOf } from '@/lib/work/agent-bench';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * AI 工作台的代理（11-17 beta）：前端带着工作区清单来，服务端调一步模型，把工具调用交回前端去沙盒里执行；
 * 前端执行完带着结果再来，直到模型不再调工具。每一步都落在 ai_chat 这一轮的 steps 里（q = 候选人这句话，a = 代理的文字 + 动作摘要），
 * 所以老的评分（AI 使用、AI 驾驭量表）不用改就能读，量表要细看时读 steps。
 * body：{ q, model, files } 开新一轮 · { results, files } 交回工具结果 · { results, stop: true } 候选人叫停
 */
type Turn = { t: number; q: string; a: string; model: string; steps: Msg[]; stopped?: boolean; n?: number };
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
  turns.forEach((tn, i) => { const old = i < turns.length - 3; out.push({ role: 'user', text: tn.q }); for (const m of tn.steps) out.push(slim(m, old)); if (tn.stopped && out[out.length - 1]?.role === 'tool') out.push({ role: 'assistant', text: '（用户叫停了这一轮）', calls: [] }); });
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
    cur = { t: tsec, q: String(body.q).trim().slice(0, 8000), a: '', model, steps: [], n: 0 };
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
  const kit = { system: agentSystem(t, files, outputs, t.task?.lang), tools: AGENT_TOOLS, run: async () => ({ result: null, label: '' }), org: t.company_name || '', task: 'Work · AI 工作台代理' };
  try {
    const t0 = Date.now();
    const out = await withCost({ tool_name: 'work', task_name: 'Work · AI 工作台代理', stage: 'use' }, () => stepOnce(historyOf(turns), cur.model, kit));
    cur.steps.push({ role: 'assistant', text: out.text, calls: out.calls, provider: out.provider, at: new Date().toISOString() });
    cur.n = (cur.n || 0) + 1;
    cur.a = summary(cur);
    await save();
    return NextResponse.json({ ok: true, text: out.text, calls: out.calls, done: !out.calls.length, ms: Date.now() - t0, t: tsec });
  } catch (e: any) {
    // 模型出错：这一轮留个说明，别让对话停在半截
    cur.steps.push({ role: 'assistant', text: `（AI 出错了：${String(e?.message || e).slice(0, 120)}）`, calls: [] });
    cur.a = summary(cur); await save();
    return NextResponse.json({ ok: false, error: `AI 出错了，再说一次试试（${String(e?.message || e).slice(0, 80)}）` }, { status: 500 });
  }
}

/** 刷新 / 换设备回来：把这次作答和代理的对话还原给前端（文件内容不回传，前端从草稿恢复） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('id').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('ai_chat, draft').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false }, { status: 404 });
  const turns = (s.ai_chat || []).filter((x: any) => Array.isArray(x?.steps)).map((tn: Turn) => ({ t: tn.t, q: tn.q, model: tn.model, stopped: !!tn.stopped, steps: tn.steps.map(m => slim(m, true)) }));
  return NextResponse.json({ ok: true, turns, draft: s.draft || null });
}
