import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { collegeStaff } from '@/lib/college-admin';
import { appendUser, runTurn, WS_MODEL, type Msg } from '@/lib/ws/agent';
import { collegeKit } from '@/lib/college-agent';
import { isKnownModel } from '@/lib/model-options';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 教务总控对话：{ thread_id?, text, model? } → NDJSON 流（thread / text / tool_start / tool_end / ask / error / done）。历史存 college_threads。 */
export async function POST(req: NextRequest) {
  const user = await collegeStaff(req); if (!user) return NextResponse.json({ ok: false, error: '教务只对平方内部开放' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim().slice(0, 4000);
  if (!text) return NextResponse.json({ ok: false, error: '说点什么' }, { status: 400 });
  const model = isKnownModel(String(body.model || '')) ? String(body.model) : WS_MODEL;
  let thread: any = null;
  if (body.thread_id) ({ data: thread } = await db.from('college_threads').select('*').eq('id', String(body.thread_id)).maybeSingle());
  if (!thread) {
    const { data, error } = await db.from('college_threads').insert({ created_by: user.email, title: text.replace(/\s+/g, ' ').slice(0, 28), messages: [] }).select('*').single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    thread = data;
  }
  const history: Msg[] = appendUser(thread.messages || [], text);
  const kit = collegeKit(user.email);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch {} };
      send({ t: 'thread', id: thread.id, title: thread.title, model });
      let added: Msg[] = [];
      const save = async (a: Msg[]) => { await db.from('college_threads').update({ messages: [...history, ...a], updated_at: new Date().toISOString() }).eq('id', thread.id); };
      try { added = await runTurn(history, model, { org: { name: '百业学院', kind: 'college' }, email: user.email } as any, e => send(e), save, kit); }
      catch (e: any) { send({ t: 'error', message: String(e?.message || e).slice(0, 400) }); }
      await db.from('college_threads').update({ messages: [...history, ...added], updated_at: new Date().toISOString() }).eq('id', thread.id);
      send({ t: 'done' });
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
