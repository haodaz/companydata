import { NextRequest } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { guard, fail, ok } from '../_guard';
import { createPlacement, listPlacements, PLACE_STATUS } from '@/lib/college-admin';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** 分配：GET ?enrollment_id|status  /  POST { enrollment_id, target_kind, target_id, target_name, note? }  /  PATCH { id, status?, note? } */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  const sp = req.nextUrl.searchParams;
  try { return ok({ data: await listPlacements({ enrollment_id: sp.get('enrollment_id') || undefined, status: sp.get('status') || undefined }) }); } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { return ok({ placement: await createPlacement(await req.json(), g.user.email) }); } catch (e) { return fail(e); }
}
export async function PATCH(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  const b = await req.json(); if (!b.id) return fail('缺 id', 400);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status && PLACE_STATUS[b.status as keyof typeof PLACE_STATUS]) patch.status = b.status;
  if (typeof b.note === 'string') patch.note = b.note.slice(0, 1000);
  const { error } = await db.from('college_placements').update(patch).eq('id', b.id);
  return error ? fail(error) : ok({});
}
