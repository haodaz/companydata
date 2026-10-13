import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 平方问答库：GET 列表（?occupation=）；PATCH { id, status: ok|hidden, question?, answer? } */
export async function GET(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const occ = new URL(req.url).searchParams.get('occupation');
  let q = supabaseAdmin.from('occupation_faqs').select('*, occupation:occupations(id, name)').eq('if_delete', false);
  if (occ) q = q.eq('occupation_id', Number(occ));
  const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
export async function PATCH(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const { id, ...rest } = await req.json();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ['status', 'question', 'answer']) if (rest[k] !== undefined) patch[k] = rest[k];
  const { error } = await supabaseAdmin.from('occupation_faqs').update(patch).eq('id', id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
