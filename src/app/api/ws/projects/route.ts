import { NextRequest, NextResponse } from 'next/server';
import { wsCtx, fail } from '../_ctx';
import { createProject, listProjects } from '@/lib/ws/projects';

export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const c = await wsCtx(req); if ('err' in c) return c.err;
  try { return NextResponse.json({ ok: true, projects: await listProjects(c.org) }); } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  const c = await wsCtx(req); if ('err' in c) return c.err;
  try { const b = await req.json(); return NextResponse.json({ ok: true, project: await createProject(c.org, c.user.email, b) }); } catch (e) { return fail(e); }
}
