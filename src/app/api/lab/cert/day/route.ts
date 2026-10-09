import { NextRequest, NextResponse } from 'next/server';
import { certData } from '@/lib/lab-cert-server';
import { band, bandLevel, certNo } from '@/lib/lab-cert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 全天证书（证书只在一天走完时发；每一段只有成绩单）：?s=作答1,作答2,…（每段一份，同一个人、同一个空间、覆盖这一天的每一段）。
 * 链接里只放作答编号，不放访客编号；能打开就说明这些作答都在。返回证书页夹要的数据：每段当一项（满分 100）。
 */
export async function GET(req: NextRequest) {
  try {
    const sids = (req.nextUrl.searchParams.get('s') || '').split(',').filter(Boolean).slice(0, 20);
    if (!sids.length) return NextResponse.json({ ok: false, error: '缺少作答编号' }, { status: 400 });
    const certs = await Promise.all(sids.map(certData));
    const space = certs[0].space;
    if (certs.some(c => c.space.id !== space.id)) throw new Error('这些作答不属于同一个空间');
    const who = certs[0].visitor_id;
    // 不止一份时要是同一个人的（访客编号一致）；只有一段的空间一份就够
    if (certs.length > 1 && (!who || certs.some(c => c.visitor_id !== who))) throw new Error('这些作答不是同一个人的');
    const total = certs[0].chapter?.total || 1;
    const byN = new Map(certs.map(c => [c.chapter?.n || 1, c]));
    if (byN.size < total) throw new Error(`这一天还差 ${total - byN.size} 段，走完才发证书`);
    const list = [...byN.values()].sort((a, b) => (a.chapter?.n || 0) - (b.chapter?.n || 0));
    const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const avg = mean(list.map(c => c.score || 0));
    const overall = band(avg);
    const matches = list.map(c => c.match).filter((m): m is number => typeof m === 'number');
    const beats = list.map(c => c.beat).filter((m): m is number => typeof m === 'number');
    const weakest = [...list].sort((a, b) => (a.score || 0) - (b.score || 0))[0];
    const strongest = [...list].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const label = (c: typeof list[number]) => `${c.chapter?.slot ? `${c.chapter.slot} ` : ''}${c.chapter?.title || ''}`;
    // 这一天见过的所有人（按出场先后去重）
    const people = list.flatMap(c => c.art?.people || []).filter((p, i, a) => a.findIndex(x => x.name === p.name) === i).slice(0, 8);
    const first = list.find(c => c.art?.scene) || list[0];
    const last = list.reduce((a, c) => (c.date > a ? c.date : a), list[0].date);
    const day = {
      day: true,
      no: certNo(sids.slice().sort().join('')),
      date: last, score: avg, overall, level: bandLevel(overall),
      match: matches.length ? mean(matches) : null, beat: beats.length ? mean(beats) : null, peers: Math.max(...list.map(c => c.peers)),
      candidate: list[list.length - 1].candidate, space, skill: list[0].skill, chapter: null,
      dims: list.map(c => ({ key: c.id, name: label(c), weight: 100, score: c.score || 0, band: c.overall, comment: typeof c.match === 'number' ? `${c.match}%` : '' })),
      analysis: {
        summary: `全天 ${list.length} 段平均 ${avg} 分。做得最好的是「${label(strongest)}」（${strongest.overall.toFixed(1)}），最需要加强的是「${label(weakest)}」（${weakest.overall.toFixed(1)}）。${weakest.analysis.summary ? `那一段：${weakest.analysis.summary}` : ''}`,
        gaps: weakest.analysis.gaps.slice(0, 2), suggestions: weakest.analysis.suggestions.slice(0, 2),
      },
      art: { scene: first.art?.scene || '', place: first.art?.place || '', people, value: list.find(c => c.art?.value)?.art?.value || null },
      charts: { avg: Object.fromEntries(list.map(c => [c.id, c.charts?.dist?.length ? mean(c.charts.dist) : null])), expert: null, dist: [] as number[] },
      parts: list.map(c => ({ id: c.id, n: c.chapter?.n, slot: c.chapter?.slot, title: c.chapter?.title, overall: c.overall })),
    };
    return NextResponse.json({ ok: true, day });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
  }
}
