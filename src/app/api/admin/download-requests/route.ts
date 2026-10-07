/**
 * 下载许可审批（仅 admin）
 *   GET            → 全部申请记录（带申请人邮箱），待审批在前
 *   GET ?count=1   → { pending }（侧导航红点用）
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  if (new URL(req.url).searchParams.get('count')) {
    const { count } = await supabaseAdmin.from('download_permissions').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    return NextResponse.json({ ok: true, pending: count || 0 });
  }
  const { data, error } = await supabaseAdmin.from('download_permissions')
    .select('id, user_id, status, reason, requested_at, decided_at, note')
    .order('requested_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const ids = [...new Set((data || []).map((r) => r.user_id))];
  const { data: users } = ids.length
    ? await supabaseAdmin.from('system_users').select('id, email').in('id', ids)
    : { data: [] as { id: string; email: string }[] };
  const emails = new Map((users || []).map((u: any) => [u.id, u.email as string]));
  const rows = (data || []).map((r) => ({ ...r, email: emails.get(r.user_id) || '' }))
    .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  return NextResponse.json({ ok: true, data: rows });
}
