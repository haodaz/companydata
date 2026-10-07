/**
 * 审批一条下载许可（仅 admin）
 *   PATCH { action: 'approve' | 'reject' | 'revoke', note? }
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { invalidateDownloadCache } from '@/lib/download-permission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NEXT: Record<string, { from: string[]; to: string }> = {
  approve: { from: ['pending'], to: 'approved' },
  reject: { from: ['pending'], to: 'rejected' },
  revoke: { from: ['approved'], to: 'revoked' },
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ ok: false, error: '仅管理员可操作' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const step = NEXT[body?.action];
  if (!step) return NextResponse.json({ ok: false, error: '未知操作' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('download_permissions')
    .update({ status: step.to, decided_at: new Date().toISOString(), decided_by: user.userId, note: typeof body?.note === 'string' ? body.note.slice(0, 300) : null })
    .eq('id', id).in('status', step.from).select('user_id').maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: '这条申请的状态已经变了，请刷新' }, { status: 409 });
  invalidateDownloadCache(data.user_id);
  return NextResponse.json({ ok: true, status: step.to });
}
