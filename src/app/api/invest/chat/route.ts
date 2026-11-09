import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { appendUser, runTurn, type Msg } from '@/lib/ws/agent';
import { investKit } from '@/lib/invest/agent';

export const runtime = 'nodejs';
export const maxDuration = 300;
// 用户 11-09：阿里优先，Claude 保底（环境变量可换）
const CHAIN = [process.env.INVEST_MODEL || 'qwen3.7-plus', process.env.INVEST_FALLBACK_MODEL || 'claude-opus-5-5'];

/** /invest 的对话：POST 发一句（NDJSON 流），GET 列表 / ?id= 一段，DELETE ?id= 删一段。所有登录用户都能用，对话只属于本人 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim().slice(0, 8000);
  if (!text) return NextResponse.json({ ok: false, error: '说点什么' }, { status: 400 });
  let thread: any = null;
  if (body.thread_id) ({ data: thread } = await db.from('invest_threads').select('*').eq('id', String(body.thread_id)).eq('created_by', user.email).maybeSingle());
  if (!thread) {
    const { data, error } = await db.from('invest_threads').insert({ created_by: user.email, title: text.replace(/\s+/g, ' ').slice(0, 28), messages: [] }).select('*').single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    thread = data;
  }
  const history: Msg[] = appendUser(thread.messages || [], text);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch {} };
      send({ t: 'thread', id: thread.id, title: thread.title });
      let done: Msg[] = [];   // 已经落库的步骤：换模型时从这里接着做，不从头再查一遍
      const save = async (a: Msg[]) => { done = a; await db.from('invest_threads').update({ messages: [...history, ...a], updated_at: new Date().toISOString() }).eq('id', thread.id); };
      for (let i = 0; i < CHAIN.length; i++) {
        const base = [...history, ...done], kept = done;
        try {
          const added = await runTurn(base, CHAIN[i], { org: { name: '产业投资地图', kind: 'invest' }, email: user.email } as any, e => send(e), async a => save([...kept, ...a]), investKit());
          await save([...kept, ...added]);
          break;
        } catch (e: any) {
          console.warn(`[invest] ${CHAIN[i]} 失败：${String(e?.message || e).slice(0, 200)}`);
          if (i === CHAIN.length - 1) send({ t: 'error', message: '助理暂时连不上，稍后再试一次。' });
        }
      }
      send({ t: 'done' }); controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) { const { data } = await db.from('invest_threads').select('*').eq('id', id).eq('created_by', user.email).maybeSingle(); return data ? NextResponse.json({ ok: true, thread: data }) : NextResponse.json({ ok: false, error: '没有这段对话' }, { status: 404 }); }
  const { data, error } = await db.from('invest_threads').select('id, title, updated_at').eq('created_by', user.email).order('updated_at', { ascending: false }).limit(60);
  return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, threads: data });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const { error } = await db.from('invest_threads').delete().eq('id', req.nextUrl.searchParams.get('id') || '').eq('created_by', user.email);
  return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
