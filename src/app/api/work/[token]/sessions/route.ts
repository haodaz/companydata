import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';

export const runtime = 'nodejs';

/** 开始作答：{ name, contact? } → session id（留名字就能做，不用登录） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: t } = await db.from('work_tasks').select('id, status').eq('share_token', token).maybeSingle();
  if (!t || !['ready', 'published'].includes(t.status)) return NextResponse.json({ ok: false, error: '这个链接不可用' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) return NextResponse.json({ ok: false, error: '留个名字' }, { status: 400 });
  const mode = body.mode === 'open' ? 'open' : 'bench';   // bench 站内工作台 / open 用自己的软件（录屏 + 上传）
  const { data, error } = await db.from('work_sessions').insert({ task_id: t.id, participant: { name, contact: String(body.contact || '').slice(0, 80), mode }, events: [{ t: 0, type: 'start', note: mode }] }).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session_id: data.id });
}
