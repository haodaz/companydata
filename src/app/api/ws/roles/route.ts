import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { getOrg } from '@/lib/ws/org';
import { addRole, knowhow } from '@/lib/ws/setup';

export const runtime = 'nodejs';

async function ctx(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return { err: NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 }) };
  const org = await getOrg(user, req.nextUrl.searchParams.get('org')).catch(() => null);
  if (!org) return { err: NextResponse.json({ ok: false, error: '没有企业' }, { status: 404 }) };
  return { user, org };
}
/** 加岗位：{ title, job_id? , jd_text?, city?, notes? }（没有 job_id 且给了 JD → 写回平方岗位库） */
export async function POST(req: NextRequest) {
  const c = await ctx(req); if (c.err) return c.err;
  try { return NextResponse.json({ ok: true, ...(await addRole(c.org!, c.user!.email, await req.json())) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
/** 改岗位内部备注：{ id, notes } */
export async function PATCH(req: NextRequest) {
  const c = await ctx(req); if (c.err) return c.err;
  const b = await req.json().catch(() => ({}));
  const notes: Record<string, string> = {}; for (const f of knowhow(c.org!.kind).role) if (b.notes && f.key in b.notes) notes[f.key] = String(b.notes[f.key] || '').trim().slice(0, 1000);
  const { error } = await db.from('ws_roles').update({ notes, updated_at: new Date().toISOString() }).eq('id', String(b.id)).eq('org_id', c.org!.id);
  return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const c = await ctx(req); if (c.err) return c.err;
  await db.from('ws_roles').delete().eq('id', req.nextUrl.searchParams.get('id') || '').eq('org_id', c.org!.id);
  return NextResponse.json({ ok: true });
}
