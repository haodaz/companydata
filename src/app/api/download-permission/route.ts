/**
 * 当前用户的数据下载许可
 *   GET  → { allowed, status, isAdmin }
 *   POST → 提交申请 { reason? }（已有待审批 / 已批准的不重复建）
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { canDownload, downloadStatusOf } from '@/lib/download-permission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const isAdmin = user.role === 'admin';
  const st = isAdmin ? { status: 'approved' as const } : await downloadStatusOf(user.userId);
  return NextResponse.json({ ok: true, allowed: await canDownload(user), isAdmin, ...st });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  if (user.role === 'admin') return NextResponse.json({ ok: true, status: 'approved' });
  const cur = await downloadStatusOf(user.userId);
  if (cur.status === 'pending' || cur.status === 'approved') return NextResponse.json({ ok: true, ...cur });
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  const { error } = await supabaseAdmin.from('download_permissions').insert({ user_id: user.userId, reason: reason || null });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: 'pending' });
}
