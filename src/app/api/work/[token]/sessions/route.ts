import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { newCode } from '@/lib/work/plugin';

export const runtime = 'nodejs';

/** 开始作答：{ name, contact? } → session id（留名字就能做，不用登录） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: t } = await db.from('work_tasks').select('id, status').eq('share_token', token).maybeSingle();
  if (!t || !['ready', 'published'].includes(t.status)) return NextResponse.json({ ok: false, error: '这个链接不可用' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) return NextResponse.json({ ok: false, error: '留个名字' }, { status: 400 });
  const mode = body.mode === 'open' ? 'open' : body.mode === 'plugin' ? 'plugin' : 'bench';   // bench 站内工作台 / open 用自己的软件（录屏 + 上传）/ plugin 用自己的网页工具（真活插件记过程）
  // 插件模式：发一个真活码，插件凭它把记到的东西挂到这次作答上（撞码就重抽）
  let code: string | undefined;
  if (mode === 'plugin') for (let i = 0; i < 5 && !code; i++) { const c = newCode(); const { data: hit } = await db.from('work_sessions').select('id').eq('participant->>code', c).maybeSingle(); if (!hit) code = c; }
  const { data, error } = await db.from('work_sessions').insert({ task_id: t.id, participant: { name, contact: String(body.contact || '').slice(0, 80), mode, ...(code ? { code } : {}) }, events: [{ t: 0, type: 'start', note: mode }] }).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session_id: data.id, ...(code ? { code } : {}) });
}
