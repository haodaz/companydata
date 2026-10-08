import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { logDemand, type DemandInput } from '@/lib/flywheel/signals';
import { SOURCES } from '@/lib/flywheel/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 外部信号接入（以后的 ToC 产品走这里）：
 *   POST /api/flywheel/signal   header x-flywheel-key: $FLYWHEEL_INGEST_KEY（或已登录后台）
 *   body: { source: 'toc_search', query, actor?, company?, meta? } 或数组（一次最多 200 条）
 * source 只收 SOURCES 里登记过的；ToC 用 toc_ 开头的几种。
 */
export async function POST(req: Request) {
  const key = process.env.FLYWHEEL_INGEST_KEY;
  const byKey = !!key && req.headers.get('x-flywheel-key') === key;
  if (!byKey && !(await getSessionUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const list = (Array.isArray(body) ? body : [body]).filter(Boolean).slice(0, 200);
  let accepted = 0;
  for (const x of list) {
    if (!SOURCES[x.source]) continue;
    const input: DemandInput = { source: x.source, query: String(x.query || '').slice(0, 1000), actor: x.actor ? String(x.actor).slice(0, 200) : null, company_name: x.company ? String(x.company).slice(0, 100) : null, profession: x.profession || null, meta: typeof x.meta === 'object' && x.meta ? x.meta : {} };
    await logDemand(input);
    accepted++;
  }
  return NextResponse.json({ ok: true, accepted, rejected: list.length - accepted });
}
