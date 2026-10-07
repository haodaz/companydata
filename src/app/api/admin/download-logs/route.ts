/**
 * 下载日志（仅 admin）：GET ?limit=200&user=<user_id>
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 200, 1), 1000);
  let q = supabaseAdmin.from('download_logs').select('id, user_id, email, role, target, params, via, ip, created_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (sp.get('user')) q = q.eq('user_id', sp.get('user')!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
