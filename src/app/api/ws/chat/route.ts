import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { getOrg } from '@/lib/ws/org';
import { appendUser, runTurn, WS_MODEL, type Msg } from '@/lib/ws/agent';
import { isKnownModel } from '@/lib/model-options';
import { ownProject } from '@/lib/ws/projects';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 总控对话：{ thread_id?, text, model? } → NDJSON 流（一行一个事件：thread / text / tool_start / tool_end / ask / error / done）。
 * 每一轮结束（或出错）都把整段历史存回 ws_threads；停在 ask_user 时下一次的 text 就是对那个问题的回答。
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const org = await getOrg(user, req.nextUrl.searchParams.get('org')).catch(() => null);
  if (!org) return NextResponse.json({ ok: false, error: '先绑定你的企业' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim().slice(0, 4000);
  if (!text) return NextResponse.json({ ok: false, error: '说点什么' }, { status: 400 });
  const model = isKnownModel(String(body.model || '')) ? String(body.model) : WS_MODEL;

  let project: any = null;
  if (body.project_id) project = await ownProject(org, String(body.project_id)).catch(() => null);
  let thread: any = null;
  if (body.thread_id) ({ data: thread } = await db.from('ws_threads').select('*').eq('id', String(body.thread_id)).eq('org_id', org.id).maybeSingle());
  if (!thread) {
    const { data, error } = await db.from('ws_threads').insert({ org_id: org.id, created_by: user.email, title: text.replace(/\s+/g, ' ').slice(0, 28), messages: [], ...(project ? { project_id: project.id } : {}) }).select('*').single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    thread = data;
  }
  if (!project && thread.project_id) project = await ownProject(org, thread.project_id).catch(() => null);
  const history: Msg[] = appendUser(thread.messages || [], text);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch {} };
      send({ t: 'thread', id: thread.id, title: thread.title, model });
      let added: Msg[] = [];
      const save = async (a: Msg[]) => { await db.from('ws_threads').update({ messages: [...history, ...a], updated_at: new Date().toISOString() }).eq('id', thread.id); };
      try { added = await runTurn(history, model, { org, email: user.email, projectId: project?.id || null, projectTitle: project?.title } as any, e => send(e), save); }
      catch (e: any) { send({ t: 'error', message: String(e?.message || e).slice(0, 400) }); }
      await db.from('ws_threads').update({ messages: [...history, ...added], updated_at: new Date().toISOString() }).eq('id', thread.id);
      send({ t: 'done' });
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
