import { NextRequest, NextResponse } from 'next/server';
import { publicCard } from '@/lib/game/pool';

export const dynamic = 'force-dynamic';

/** 接着玩：按存档里的卡 id 取回那一张（只给这一张） */
export async function GET(req: NextRequest) {
  const card = publicCard(req.nextUrl.searchParams.get('id') || '');
  return card ? NextResponse.json({ ok: true, card }) : NextResponse.json({ ok: false, error: '这张卡不在了' }, { status: 404 });
}
