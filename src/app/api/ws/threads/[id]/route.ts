import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { getOrg } from '@/lib/ws/org';

export const runtime = 'nodejs';

async function own(req: NextRequest, id: string) {
  const user = await getSessionUser(req); if (!user) return { err: NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 }) };
  const org = await getOrg(user, req.nextUrl.searchParams.get('org')).catch(() => null);
  if (!org) return { err: NextResponse.json({ ok: false, error: '没有企业' }, { status: 404 }) };
  const { data } = await db.from('ws_threads').select('*').eq('id', id).eq('org_id', org.id).maybeSingle();
  if (!data) return { err: NextResponse.json({ ok: false, error: '没有这段对话' }, { status: 404 }) };
  return { thread: data };
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const r = await own(req, id); if (r.err) return r.err;
  return NextResponse.json({ ok: true, thread: r.thread });
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const r = await own(req, id); if (r.err) return r.err;
  await db.from('ws_threads').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
