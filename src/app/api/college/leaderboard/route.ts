import { NextResponse } from 'next/server';
import { buildLeaderboard } from '@/lib/college-leaderboard';

export const runtime = 'nodejs';
export const revalidate = 600;   // 十分钟刷新一次，公开页不用每次现算

/** AI 职业能力榜（公开）：只有聚合分数，没有学籍和学员细节 */
export async function GET() {
  try { return NextResponse.json({ ok: true, ...(await buildLeaderboard()) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}
