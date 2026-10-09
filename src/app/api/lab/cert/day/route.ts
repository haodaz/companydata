import { NextRequest, NextResponse } from 'next/server';
import { certData } from '@/lib/lab-cert-server';
import { band, bandLevel, certNo, passed, PASS_SCORE } from '@/lib/lab-cert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 证书夹：?s=作答1,作答2,…（同一个人、同一个空间，每段一份，取最好的一次）。
 * 越攒越厚：每一段的成绩都放进去；每一段都通过（≥ 60 分）才有全天成绩和证书，否则告诉你还差哪几段（没走 / 没通过要重做）。
 * 链接里只放作答编号，不放访客编号；能打开就说明这些作答都在。一天只有一段也是同样的逻辑。
 */
export async function GET(req: NextRequest) {
  try {
    const sids = (req.nextUrl.searchParams.get('s') || '').split(',').filter(Boolean).slice(0, 20);
    if (!sids.length) return NextResponse.json({ ok: false, error: '缺少作答编号' }, { status: 400 });
    const certs = await Promise.all(sids.map(certData));
    const space = certs[0].space;
    if (certs.some(c => c.space.id !== space.id)) throw new Error('这些作答不属于同一个空间');
    const who = certs[0].visitor_id;
    if (certs.length > 1 && (!who || certs.some(c => c.visitor_id !== who))) throw new Error('这些作答不是同一个人的');
    const total = certs[0].chapter?.total || 1;
    // 每段只留最好的一次
    const byN = new Map<number, (typeof certs)[number]>();
    for (const c of certs) { const n = c.chapter?.n || 1; const cur = byN.get(n); if (!cur || (c.score || 0) > (cur.score || 0)) byN.set(n, c); }
    const list = [...byN.values()].sort((a, b) => (a.chapter?.n || 0) - (b.chapter?.n || 0));
    const strip = ({ mine: _m, visitor_id: _v, folder: _f, ...c }: (typeof certs)[number]) => c;
    const parts = list.map(strip);

    // 还差哪几段：没走的、没通过的（附章节编号，页面上给「去做 / 去重做」）
    const chapters: any[] = certs[0].chapters_all || [];
    const todo = chapters.map((c: any, i: number) => {
      const got = list.find(x => (x.chapter?.n || 1) === i + 1);
      if (!got) return { n: i + 1, id: c.id, slot: c.slot || '', title: c.title, status: 'todo' as const, score: null };
      if (!passed(got.score)) return { n: i + 1, id: c.id, slot: c.slot || '', title: c.title, status: 'fail' as const, score: got.score };
      return null;
    }).filter(Boolean);
    const complete = list.length === total && list.every(c => passed(c.score));

    let day: any = null;
    if (complete) {
      const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
      const avg = mean(list.map(c => c.score || 0));
      const overall = band(avg);
      const matches = list.map(c => c.match).filter((m): m is number => typeof m === 'number');
      const beats = list.map(c => c.beat).filter((m): m is number => typeof m === 'number');
      const weakest = [...list].sort((a, b) => (a.score || 0) - (b.score || 0))[0];
      const strongest = [...list].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const label = (c: (typeof list)[number]) => `${c.chapter?.slot ? `${c.chapter.slot} ` : ''}${c.chapter?.title || ''}`;
      const people = list.flatMap(c => c.art?.people || []).filter((p, i, a) => a.findIndex(x => x.name === p.name) === i).slice(0, 8);
      const first = list.find(c => c.art?.scene) || list[0];
      const last = list.reduce((a, c) => (c.date > a ? c.date : a), list[0].date);
      day = {
        day: true, no: certNo(list.map(c => c.id).sort().join('')),
        date: last, score: avg, overall, level: bandLevel(overall),
        match: matches.length ? mean(matches) : null, beat: beats.length ? mean(beats) : null, peers: Math.max(...list.map(c => c.peers)),
        candidate: list[list.length - 1].candidate, space, skill: list[0].skill, chapter: null,
        dims: list.map(c => ({ key: c.id, name: label(c), weight: 100, score: c.score || 0, band: c.overall, comment: typeof c.match === 'number' ? `${c.match}%` : '' })),
        analysis: {
          summary: `全天 ${list.length} 段，每段都过了 ${PASS_SCORE} 分，平均 ${avg} 分。${list.length > 1 ? `做得最好的是「${label(strongest)}」（${strongest.overall.toFixed(1)}），最需要加强的是「${label(weakest)}」（${weakest.overall.toFixed(1)}）。` : ''}${weakest.analysis.summary || ''}`,
          gaps: weakest.analysis.gaps.slice(0, 2), suggestions: weakest.analysis.suggestions.slice(0, 2),
        },
        art: { scene: first.art?.scene || '', place: first.art?.place || '', people, value: list.find(c => c.art?.value)?.art?.value || null },
        charts: { avg: Object.fromEntries(list.map(c => [c.id, c.charts?.dist?.length ? mean(c.charts.dist) : null])), expert: null, dist: [] as number[] },
      };
    }
    return NextResponse.json({ ok: true, folder: { day, parts, complete, total, todo, space } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
  }
}
