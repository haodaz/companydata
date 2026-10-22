import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { sessionByCode } from '@/lib/work/plugin';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 真活插件交卷：{ deliverable?, auto? }。侧边栏「结束作答」或到时间自动结束（auto：没写交付说明也照样收卷，按未交付评）。
 * 收卷后走和别的模式同一条交卷流程（/api/work/<token>/sessions/<sid>/submit → AI 分段审计 → 报告）。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const x = await sessionByCode(code);
  if (!x) return NextResponse.json({ ok: false, error: '真活码不对' }, { status: 404 });
  const { s, t } = x;
  if (s.submitted_at) return NextResponse.json({ ok: true, already: true, share_token: t.share_token, sid: s.id });
  const body = await req.json().catch(() => ({}));
  if (typeof body.deliverable === 'string') await db.from('work_sessions').update({ deliverable: body.deliverable.slice(0, 60000) }).eq('id', s.id);
  const r = await fetch(`${req.nextUrl.origin}/api/work/${t.share_token}/sessions/${s.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto: !!body.auto, events: [{ t: Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000), type: 'plugin_stop', note: body.auto ? '时间到，自动结束' : '侧边栏结束作答', src: 'plugin' }] }) });
  const j = await r.json().catch(() => ({ ok: false, error: '交卷失败' }));
  if (!j.ok) return NextResponse.json({ ok: false, error: j.error || '交卷失败' }, { status: r.status || 500 });
  return NextResponse.json({ ok: true, staged: !!j.staged, share_token: t.share_token, sid: s.id });
}
