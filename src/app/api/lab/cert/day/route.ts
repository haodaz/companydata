import { NextRequest, NextResponse } from 'next/server';
import { certData } from '@/lib/lab-cert-server';
import { band, bandLevel, certNo } from '@/lib/lab-cert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 全天证书：?s=作答1,作答2,…（每段一份，同一个人、同一个空间、覆盖这一天的每一段）。
 * 链接里只放作答编号，不放访客编号；能打开就说明这些作答都在。
 */
export async function GET(req: NextRequest) {
  try {
    const sids = (req.nextUrl.searchParams.get('s') || '').split(',').filter(Boolean).slice(0, 20);
    if (!sids.length) return NextResponse.json({ ok: false, error: '缺少作答编号' }, { status: 400 });
    const certs = await Promise.all(sids.map(certData));
    const space = certs[0].space;
    if (certs.some(c => c.space.id !== space.id)) throw new Error('这些作答不属于同一个空间');
    const who = certs[0].visitor_id;
    if (!who || certs.some(c => c.visitor_id !== who)) throw new Error('这些作答不是同一个人的');
    const total = certs[0].chapter?.total || 1;
    const byN = new Map(certs.map(c => [c.chapter?.n || 1, c]));
    if (byN.size < total) throw new Error(`这一天还差 ${total - byN.size} 段`);
    const list = [...byN.values()].sort((a, b) => (a.chapter?.n || 0) - (b.chapter?.n || 0)).map(({ mine: _m, visitor_id: _v, ...c }) => c);
    const avg = Math.round(list.reduce((a, c) => a + (c.score || 0), 0) / list.length);
    const overall = band(avg);
    const last = list.reduce((a, c) => (c.date > a ? c.date : a), list[0].date);
    return NextResponse.json({ ok: true, day: { no: certNo(sids.slice().sort().join('')), space, candidate: list[list.length - 1].candidate, date: last, score: avg, overall, level: bandLevel(overall), chapters: list, skill: list[0].skill } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
  }
}
