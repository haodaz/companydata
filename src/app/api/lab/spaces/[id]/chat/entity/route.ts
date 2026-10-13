import { NextResponse } from 'next/server';
import { entityDetail, loadChatContext, type SourceRef } from '@/lib/kg/persona-chat';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

/** 和我聊 · 资料面板：?kind=occupation|job|company|standard|task&id=&section=（只给这段对话资料里引用过的） */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const sp = new URL(req.url).searchParams;
    const ref = { kind: sp.get('kind'), id: Number(sp.get('id')), section: sp.get('section') || undefined } as SourceRef;
    const c = await loadChatContext({ spaceId: id });
    return NextResponse.json({ success: true, ...(await entityDetail(c.occ, c.knowledge, ref, id)) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}
