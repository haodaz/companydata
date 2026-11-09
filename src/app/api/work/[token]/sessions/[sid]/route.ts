import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { timing } from '@/lib/work/deadline';

export const runtime = 'nodejs';

async function load(token: string, sid: string) {
  const { data: t } = await db.from('work_tasks').select('id, status, task').eq('share_token', token).maybeSingle();
  if (!t) return null;
  const { data: s } = await db.from('work_sessions').select('*').eq('id', sid).eq('task_id', t.id).maybeSingle();
  return s ? { t, s } : null;
}

/** 一次作答：参与者、进度、报告（交卷后） */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const x = await load(token, sid);
  if (!x) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  const { s, t } = x;
  const tm = timing(t.task, s);
  // 还没交卷时把作答现场带回去：刷新 / 换设备回来，时间接着走，聊天、内容、解锁进度都在
  const resume = s.submitted_at ? undefined : { ai_chat: (s.ai_chat || []).map((c: any) => ({ q: c.q, a: c.a })), draft: s.draft || null, unlocked: (s.events || []).filter((e: any) => e.type === 'stage_unlock').map((e: any) => e.id), last_t: Math.max(0, ...(s.events || []).map((e: any) => Number(e.t) || 0)) };
  return NextResponse.json({ ok: true, session: { elapsed_s: tm.elapsed, limit_s: tm.limit, expired: tm.expired, resume, id: s.id, participant: s.participant, started_at: s.started_at, submitted_at: s.submitted_at, deliverable: s.deliverable, report: s.report, score: s.score, events_n: (s.events || []).length, files: (s.events || []).filter((e: any) => e.type === 'file' && e.url).map((e: any) => ({ name: e.name, url: e.url, size: e.size || 0, part: e.part || '' })), ...(req.nextUrl.searchParams.get('full') && s.submitted_at ? { events: s.events || [], ai_chat: s.ai_chat || [] } : {}) } });
}

/** 过程同步（每 30 秒 / 每个动作攒一批）：{ events: [...], deliverable?: 草稿 }。交卷后不再收。POST 是给 sendBeacon 用的同义接口 */
export const POST = (req: NextRequest, ctx: { params: Promise<{ token: string; sid: string }> }) => PATCH(req, ctx);
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const x = await load(token, sid);
  if (!x) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  if (x.s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了' }, { status: 409 });
  if (timing(x.t.task, x.s).closed) return NextResponse.json({ ok: false, error: '时间到了', expired: true }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const incoming = (Array.isArray(body.events) ? body.events : []).slice(0, 500).map((e: any) => ({ t: Math.max(0, Number(e.t) || 0), type: String(e.type || '').slice(0, 20), ...(e.id ? { id: String(e.id).slice(0, 20) } : {}), ...(e.chars != null ? { chars: Number(e.chars) || 0 } : {}), ...(e.delta != null ? { delta: Number(e.delta) || 0 } : {}), ...(e.note ? { note: String(e.note).slice(0, 120) } : {}), ...(e.type === 'draft' && typeof e.text === 'string' ? { text: e.text.slice(0, 12000) } : {}) }));
  const events = [...(x.s.events || []), ...incoming].slice(-3000);
  const patch: Record<string, any> = { events };
  if (typeof body.deliverable === 'string') patch.deliverable = body.deliverable.slice(0, 60000);
  const withDraft = body.draft && typeof body.draft === 'object' && JSON.stringify(body.draft).length <= 800_000;   // 白板贴了很多图就只留本机
  let { error } = await db.from('work_sessions').update(withDraft ? { ...patch, draft: body.draft } : patch).eq('id', sid);
  if (error && withDraft && /draft/.test(error.message)) ({ error } = await db.from('work_sessions').update(patch).eq('id', sid));   // 迁移 068 还没跑
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, events_n: events.length });
}
