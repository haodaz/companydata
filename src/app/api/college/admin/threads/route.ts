import { NextRequest } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { guard, fail, ok } from '../_guard';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** 最近的教务对话 */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  const { data, error } = await db.from('college_threads').select('id, title, created_by, updated_at').order('updated_at', { ascending: false }).limit(60);
  return error ? fail(error) : ok({ data });
}
