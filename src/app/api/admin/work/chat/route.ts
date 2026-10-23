import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { appendUser, runTurn, WS_MODEL, type Msg } from '@/lib/ws/agent';
import { workChatKit } from '@/lib/work/chat-agent';
import { isKnownModel } from '@/lib/model-options';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 聊着出题：{ thread_id?, text, model? } → NDJSON 流（thread / text / tool_start / tool_end / ask / error / done）。历史存 work_threads（只看自己的）。 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim().slice(0, 12000);
  if (!text) return NextResponse.json({ ok: false, error: '说点什么' }, { status: 400 });
  const model = isKnownModel(String(body.model || '')) ? String(body.model) : WS_MODEL;
  let thread: any = null;
  if (body.thread_id) ({ data: thread } = await db.from('work_threads').select('*').eq('id', String(body.thread_id)).eq('created_by', user.email).maybeSingle());
  if (!thread) {
    const { data, error } = await db.from('work_threads').insert({ created_by: user.email, title: text.replace(/\s+/g, ' ').slice(0, 28), messages: [] }).select('*').single();
    if (error) return NextResponse.json({ ok: false, error: /work_threads/.test(error.message) ? '聊着出题还没开通（迁移 047 待跑）' : error.message }, { status: 500 });
    thread = data;
  }
  const history: Msg[] = appendUser(thread.messages || [], text);
  const kit = workChatKit({ email: user.email, role: user.role });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch {} };
      send({ t: 'thread', id: thread.id, title: thread.title, model });
      let added: Msg[] = [];
      const save = async (a: Msg[]) => { await db.from('work_threads').update({ messages: [...history, ...a], updated_at: new Date().toISOString() }).eq('id', thread.id); };
      try { added = await runTurn(history, model, { org: { name: '真活台', kind: 'work' }, email: user.email } as any, e => send(e), save, kit); }
      catch (e: any) { send({ t: 'error', message: String(e?.message || e).slice(0, 400) }); }
      // 这段对话出的题挂到线程上（右侧面板和「最近」列表用）
      const task = [...added].reverse().flatMap((m: any) => (m.role === 'tool' ? m.results : [])).find((r: any) => r.ui?.kind === 'work_task');
      await db.from('work_threads').update({ messages: [...history, ...added], ...(task ? { task_id: task.ui.task_id } : {}), updated_at: new Date().toISOString() }).eq('id', thread.id);
      send({ t: 'done' });
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}

/** 我的对话列表；?id= 取一段 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const { data } = await db.from('work_threads').select('*').eq('id', id).eq('created_by', user.email).maybeSingle();
    return data ? NextResponse.json({ ok: true, thread: data }) : NextResponse.json({ ok: false, error: '没有这段对话' }, { status: 404 });
  }
  const { data, error } = await db.from('work_threads').select('id, title, task_id, updated_at').eq('created_by', user.email).order('updated_at', { ascending: false }).limit(40);
  if (error) return NextResponse.json({ ok: true, data: [] });   // 迁移 047 没跑
  return NextResponse.json({ ok: true, data: data || [] });
}
