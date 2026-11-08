import { NextRequest, NextResponse } from 'next/server';
import { draw } from '@/lib/game/pool';

export const dynamic = 'force-dynamic';

/** 入行：抽一张卡（卡池不公开）。?not=<上一张的 id> 尽量别连着抽到同一张 */
export async function GET(req: NextRequest) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const { card, peers } = draw(seed, req.nextUrl.searchParams.get('not') || undefined, req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'zh');
  return NextResponse.json({ ok: true, seed, card, peers });
}
