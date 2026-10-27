import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { publicShowcase } from '@/lib/work/showcase';

export const runtime = 'nodejs';

/** 任务库（明牌）：登录的出任务用户都能看；只给去标识后的题面，不给原任务 id 和出题逻辑 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  return NextResponse.json({ ok: true, items: publicShowcase() });
}
