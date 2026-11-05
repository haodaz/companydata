import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { appendUser, runTurn, WS_MODEL, type Msg } from '@/lib/ws/agent';
import { myTasks, taskPeople, workHomeKit } from '@/lib/work/home-agent';
import { loadMine } from '@/lib/work/chat-agent';
import { isKnownModel } from '@/lib/model-options';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 真活工作台 /work/ws（2026-11-05）：POST 和助理对话（同 /api/admin/work/chat 的 NDJSON 流，多了 focus = 右边开着的题 / 报告）；
 * 对话存 work_threads（和聊着出任务同一张表，两边都能接着聊）。
 * GET ?view=tasks 我的真活 / ?view=people[&task=] 候选人（不给 task 就是所有题的作答人）/ ?view=overview 总览。
 */
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
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    thread = data;
  }
  const f = body.focus && typeof body.focus === 'object' ? { task_id: s(body.focus.task_id), session_id: s(body.focus.session_id), title: s(body.focus.title), name: s(body.focus.name) } : null;
  const history: Msg[] = appendUser(thread.messages || [], text);
  const kit = workHomeKit({ email: user.email, role: user.role }, f);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch {} };
      send({ t: 'thread', id: thread.id, title: thread.title, model });
      let added: Msg[] = [];
      const save = async (a: Msg[]) => { await db.from('work_threads').update({ messages: [...history, ...a], updated_at: new Date().toISOString() }).eq('id', thread.id); };
      try { added = await runTurn(history, model, { org: { name: '真活台', kind: 'work' }, email: user.email } as any, e => send(e), save, kit); }
      catch (e: any) { send({ t: 'error', message: String(e?.message || e).slice(0, 400) }); }
      const task = [...added].reverse().flatMap((m: any) => (m.role === 'tool' ? m.results : [])).find((r: any) => r.ui?.task_id);
      await db.from('work_threads').update({ messages: [...history, ...added], ...(task && !thread.task_id ? { task_id: task.ui.task_id } : {}), updated_at: new Date().toISOString() }).eq('id', thread.id);
      send({ t: 'done' });
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}

const s = (v: any) => (v == null ? undefined : String(v).slice(0, 200));

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const q = new URL(req.url).searchParams; const view = q.get('view');
  const me = { email: user.email, role: user.role };
  try {
    if (view === 'tasks') return NextResponse.json({ ok: true, tasks: await myTasks(me, { all: q.get('all') === '1' }) });
    if (view === 'people') {
      const one = q.get('task');
      const tasks = one ? [await loadMine(me, one)].map(t => ({ task_id: t.id, token: t.share_token, title: t.task?.title || '', company: t.company_name })) : (await myTasks(me)).filter(t => t.started);
      const people = (await Promise.all(tasks.slice(0, 40).map(async t => (await taskPeople(t.task_id)).filter(p => !p.preview).map(p => ({ ...p, task_id: t.task_id, token: t.token, task_title: t.title, company: t.company }))))).flat();
      people.sort((a, b) => String(b.submitted_at || b.started_at).localeCompare(String(a.submitted_at || a.started_at)));
      return NextResponse.json({ ok: true, people });
    }
    if (view === 'overview') {
      const tasks = await myTasks(me);
      const live = tasks.filter(t => t.status === 'published');
      const recent = (await Promise.all(tasks.filter(t => t.submitted).slice(0, 12).map(async t => (await taskPeople(t.task_id)).filter(p => !p.preview && p.submitted_at).map(p => ({ ...p, task_id: t.task_id, token: t.token, task_title: t.title }))))).flat()
        .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))).slice(0, 8);
      return NextResponse.json({ ok: true, stats: { tasks: tasks.length, live: live.length, pending: tasks.filter(t => t.status === 'ready').length, started: tasks.reduce((a, t) => a + t.started, 0), submitted: tasks.reduce((a, t) => a + t.submitted, 0) }, tasks: tasks.slice(0, 8), recent });
    }
    return NextResponse.json({ ok: false, error: 'view?' }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }); }
}
