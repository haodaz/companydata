import { NextResponse } from 'next/server';
import { entityDetail, loadChatContext, type SourceRef } from '@/lib/kg/persona-chat';

export const runtime = 'nodejs';

/** 数据工厂职业页试聊的资料面板：?occupationId=&kind=&id=&section= */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const ref = { kind: sp.get('kind'), id: Number(sp.get('id')), section: sp.get('section') || undefined } as SourceRef;
    const c = await loadChatContext({ occupationId: Number(sp.get('occupationId')) });
    return NextResponse.json({ success: true, ...(await entityDetail(c.occ, c.knowledge, ref)) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}
