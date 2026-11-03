import { NextRequest } from 'next/server';
import { guard, fail, ok } from '../_guard';
import { listExams, reviewLink } from '@/lib/college-exams';
export const runtime = 'nodejs';

/** 科研能力测评题（迁移 060）：GET 列表（状态、核对疑问数、导师改动数）；POST { id } 生成 / 取回导师校正链接 */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { return ok({ data: await listExams() }); } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { const b = await req.json(); return ok({ token: await reviewLink(String(b.id)) }); } catch (e) { return fail(e); }
}
