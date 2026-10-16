import { NextResponse } from 'next/server';
import { readBasketToken, ingestBasketPage } from '@/lib/basket';

export const maxDuration = 300;

/** 插件「放进篮子」：收一页人正在看的页面文字，提炼、入库、打采集标记 */
export async function POST(req: Request) {
  const user = await readBasketToken(req);
  if (!user) return NextResponse.json({ ok: false, error: '篮子口令无效或已过期，请到「数据外采篮」页面重新生成' }, { status: 401 });
  try {
    const body = await req.json();
    if (!Number(body.companyId) || !body.url || !body.text) return NextResponse.json({ ok: false, error: '缺少企业、网址或页面文字' }, { status: 400 });
    const r = await ingestBasketPage(user, { companyId: Number(body.companyId), url: String(body.url), title: body.title, text: String(body.text), links: Array.isArray(body.links) ? body.links : [], kind: body.kind });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
