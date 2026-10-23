import { NextRequest } from 'next/server';
import { guard, fail, ok } from '../_guard';
import { searchTargets } from '@/lib/college-admin';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** 毕业生能派去的地方：?q= 工作台机构 / 企业库企业 / 人才培养需求单 */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { return ok({ data: await searchTargets(req.nextUrl.searchParams.get('q') || '') }); } catch (e) { return fail(e); }
}
