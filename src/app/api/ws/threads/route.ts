import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { getOrg } from '@/lib/ws/org';

export const runtime = 'nodejs';

/** 本企业最近的对话（侧栏「最近」） */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const org = await getOrg(user, req.nextUrl.searchParams.get('org')).catch(() => null); if (!org) return NextResponse.json({ ok: true, threads: [] });
  const { data, error } = await db.from('ws_threads').select('id, title, updated_at, created_by').eq('org_id', org.id).order('updated_at', { ascending: false }).limit(40);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, threads: data || [] });
}
