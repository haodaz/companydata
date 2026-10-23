import { NextRequest } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { guard, fail, ok } from '../../_guard';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req); if (g.denied) return g.denied;
  const { id } = await params;
  const { data, error } = await db.from('college_threads').select('*').eq('id', id).maybeSingle();
  if (error || !data) return fail(error || '没有这段对话', 404);
  return ok({ thread: data });
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req); if (g.denied) return g.denied;
  const { id } = await params;
  const { error } = await db.from('college_threads').delete().eq('id', id);
  return error ? fail(error) : ok({});
}
