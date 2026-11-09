import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { newCode } from '@/lib/work/plugin';
import { findInvite, inviteOnly } from '@/lib/work/invite';

export const runtime = 'nodejs';

/** 这条专属链接有没有已经开始的作答（换浏览器打开时接回去） */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: t } = await db.from('work_tasks').select('id, context').eq('share_token', token).maybeSingle();
  const inv = t && findInvite(t, req.nextUrl.searchParams.get('invite'));
  if (!t || !inv) return NextResponse.json({ ok: true, session_id: null });
  const { data: s } = await db.from('work_sessions').select('id').eq('task_id', t.id).eq('participant->>invite', inv.code).order('created_at').limit(1).maybeSingle();
  return NextResponse.json({ ok: true, session_id: s?.id || null });
}

/** 开始作答：{ name, contact? } → session id（留名字就能做，不用登录） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: t } = await db.from('work_tasks').select('id, status, owner_key, context').eq('share_token', token).maybeSingle();
  const body = await req.json().catch(() => ({}));
  const preview = !!(t && body.k && body.k === t.owner_key);   // 出题人预览做题台：待发布也能开一次作答，记成预览
  if (!t || !(t.status === 'published' || (t.status === 'ready' && preview))) return NextResponse.json({ ok: false, error: '这个链接不可用' }, { status: 404 });
  // 换一种作答方式：还是这一次作答，时钟不重置（11-09）
  const { data: prev } = body.from ? await db.from('work_sessions').select('id, participant, submitted_at').eq('id', String(body.from)).eq('task_id', t.id).maybeSingle() : { data: null };
  // 专属链接：一条只对应一次作答，已经开始过就接回那一次
  const inv = findInvite(t, body.invite);
  if (!preview && !prev && inviteOnly(t) && !inv) return NextResponse.json({ ok: false, error: '这个任务只接受专属邀请链接，请联系发给你链接的公司。' }, { status: 403 });
  if (inv) {
    const { data: ex } = await db.from('work_sessions').select('id, participant').eq('task_id', t.id).eq('participant->>invite', inv.code).order('created_at').limit(1).maybeSingle();
    if (ex) return NextResponse.json({ ok: true, session_id: ex.id, ...(ex.participant?.code ? { code: ex.participant.code } : {}) });
  }
  const name = String(body.name || prev?.participant?.name || inv?.label || '').trim().slice(0, 40);
  if (!name) return NextResponse.json({ ok: false, error: '留个名字' }, { status: 400 });
  const mode = body.mode === 'open' ? 'open' : body.mode === 'plugin' ? 'plugin' : 'bench';   // bench 站内工作台 / open 用自己的软件（录屏 + 上传）/ plugin 用自己的网页工具（真活插件记过程）
  // 插件模式：发一个真活码，插件凭它把记到的东西挂到这次作答上（撞码就重抽）
  let code: string | undefined;
  if (mode === 'plugin') for (let i = 0; i < 5 && !code; i++) { const c = newCode(); const { data: hit } = await db.from('work_sessions').select('id').eq('participant->>code', c).maybeSingle(); if (!hit) code = c; }
  if (prev && !prev.submitted_at) {
    const { error } = await db.from('work_sessions').update({ participant: { ...prev.participant, mode, ...(code ? { code } : {}) } }).eq('id', prev.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, session_id: prev.id, ...(code ? { code } : {}) });
  }
  const { data, error } = await db.from('work_sessions').insert({ task_id: t.id, participant: { name, contact: String(body.contact || '').slice(0, 80), mode, ...(inv ? { invite: inv.code } : {}), ...(code ? { code } : {}), ...(preview ? { preview: true } : {}) }, events: [{ t: 0, type: 'start', note: mode }] }).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session_id: data.id, ...(code ? { code } : {}) });
}
