import { NextRequest } from 'next/server';
import { guard, fail, ok } from '../_guard';
import { listCourses } from '@/lib/college-admin';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** 课程 = 百业工厂里有已发布章节的空间 */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { return ok({ data: await listCourses() }); } catch (e) { return fail(e); }
}
