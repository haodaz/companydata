import { NextRequest } from 'next/server';
import { guard, fail, ok } from '../_guard';
import { overview } from '@/lib/college-admin';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { return ok({ data: await overview() }); } catch (e) { return fail(e); }
}
