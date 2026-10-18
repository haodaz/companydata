import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';

export const runtime = 'nodejs';

async function load(token: string, sid: string) {
  const { data: t } = await db.from('work_tasks').select('id, status').eq('share_token', token).maybeSingle();
  if (!t) return null;
  const { data: s } = await db.from('work_sessions').select('*').eq('id', sid).eq('task_id', t.id).maybeSingle();
  return s ? { t, s } : null;
}

/** 一次作答：参与者、进度、报告（交卷后） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const x = await load(token, sid);
  if (!x) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  const { s } = x;
  return NextResponse.json({ ok: true, session: { id: s.id, participant: s.participant, started_at: s.started_at, submitted_at: s.submitted_at, deliverable: s.deliverable, report: s.report, score: s.score, events_n: (s.events || []).length } });
}

/** 过程同步（每 30 秒 / 每个动作攒一批）：{ events: [...], deliverable?: 草稿 }。交卷后不再收 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const x = await load(token, sid);
  if (!x) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  if (x.s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了' }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const incoming = (Array.isArray(body.events) ? body.events : []).slice(0, 500).map((e: any) => ({ t: Math.max(0, Number(e.t) || 0), type: String(e.type || '').slice(0, 20), ...(e.id ? { id: String(e.id).slice(0, 20) } : {}), ...(e.chars != null ? { chars: Number(e.chars) || 0 } : {}), ...(e.delta != null ? { delta: Number(e.delta) || 0 } : {}), ...(e.note ? { note: String(e.note).slice(0, 120) } : {}) }));
  const events = [...(x.s.events || []), ...incoming].slice(-3000);
  const patch: Record<string, any> = { events };
  if (typeof body.deliverable === 'string') patch.deliverable = body.deliverable.slice(0, 60000);
  const { error } = await db.from('work_sessions').update(patch).eq('id', sid);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, events_n: events.length });
}
