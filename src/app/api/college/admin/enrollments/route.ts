import { NextRequest } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { guard, fail, ok } from '../_guard';
import { createEnrollment, listEnrollments, ENROLL_STATUS } from '@/lib/college-admin';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

/** 学籍：GET ?student_id|space_id|status  /  POST { student_id, space_id, demand_id? } 录入一门课  /  PATCH { id, status?, note?, nova_name? } */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  const sp = req.nextUrl.searchParams;
  try { return ok({ data: await listEnrollments({ student_id: sp.get('student_id') || undefined, space_id: sp.get('space_id') || undefined, status: sp.get('status') || undefined }) }); } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { const b = await req.json(); return ok({ enrollment: await createEnrollment(String(b.student_id), String(b.space_id), g.user.email, b.demand_id || null) }); } catch (e) { return fail(e); }
}
export async function PATCH(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  const b = await req.json(); if (!b.id) return fail('缺 id', 400);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status && ENROLL_STATUS[b.status as keyof typeof ENROLL_STATUS]) patch.status = b.status;
  if (typeof b.note === 'string') patch.note = b.note.slice(0, 2000);
  if (typeof b.nova_name === 'string') patch.nova_name = b.nova_name.slice(0, 60);
  const { error } = await db.from('college_enrollments').update(patch).eq('id', b.id);
  return error ? fail(error) : ok({});
}
