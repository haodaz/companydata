import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { sessionByCode, normCode } from '@/lib/work/plugin';

export const runtime = 'nodejs';

/** 真活插件：凭真活码查这次作答（插件侧边栏、作答页都轮询它）——题目摘要、截止时间、记了多少、交付说明 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const x = await sessionByCode(code);
  if (!x) return NextResponse.json({ ok: false, error: '真活码不对，回到答题页再复制一次' }, { status: 404 });
  const { s, t } = x;
  const minutes = Number(t.task?.time_minutes) || 60;
  const ev = (s.events || []) as any[];
  const plugin = ev.filter(e => e.src === 'plugin');
  return NextResponse.json({
    ok: true, code: normCode(code), share_token: t.share_token, sid: s.id, name: s.participant?.name || '',
    task: { title: t.task?.title, company: t.company_name, role: t.role, time_minutes: minutes, brief: String(t.task?.brief || '').slice(0, 600), deliverables: t.task?.deliverables || [], materials: (t.materials || []).map((m: any) => ({ id: m.id, title: m.title })) },
    started_at: s.started_at, deadline: new Date(new Date(s.started_at).getTime() + minutes * 60_000).toISOString(),
    submitted: !!s.submitted_at, auditing: !!s.report?.auditing, deliverable: s.deliverable || '',
    recorded: { events: plugin.length, pages: plugin.filter(e => e.type === 'visit').length, ai: (s.ai_chat || []).filter((c: any) => c.src === 'plugin').length, last_t: plugin.length ? plugin[plugin.length - 1].t : null },
  });
}

/** 存交付说明（侧边栏和作答页都能写；交卷后不再收） */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const x = await sessionByCode(code);
  if (!x) return NextResponse.json({ ok: false, error: '真活码不对' }, { status: 404 });
  if (x.s.submitted_at) return NextResponse.json({ ok: false, error: '已经交卷了' }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.deliverable !== 'string') return NextResponse.json({ ok: false, error: '没有内容' }, { status: 400 });
  const { error } = await db.from('work_sessions').update({ deliverable: body.deliverable.slice(0, 60000) }).eq('id', x.s.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
