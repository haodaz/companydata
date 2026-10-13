import { NextResponse } from 'next/server';
import { chatReply, loadChatContext, logQuestion, opening, recordTurn } from '@/lib/kg/persona-chat';
import { getSessionUser } from '@/lib/session';
import { trackDemand } from '@/lib/flywheel/signals';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 数据工厂职业页试聊：GET ?occupationId= 开场白；POST { occupationId, question, history, chatId } 回答一轮 */
export async function GET(req: Request) {
  try {
    const occupationId = Number(new URL(req.url).searchParams.get('occupationId'));
    const c = await loadChatContext({ occupationId });
    const jobs = Number(c.knowledge.text.match(/一共 (\d+) 个在招/)?.[1] || 0);
    return NextResponse.json({ success: true, occupation: { id: c.occ.id, name: c.occ.name }, persona: c.persona, ...opening(c.occ, c.persona, jobs) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { occupationId, question, history = [], chatId = null } = await req.json();
    const q = String(question || '').trim().slice(0, 500);
    if (!q) return NextResponse.json({ success: false, error: '说点什么吧' }, { status: 400 });
    const c = await loadChatContext({ occupationId: Number(occupationId) });
    const r = await chatReply({ occ: c.occ, persona: c.persona, knowledge: c.knowledge, history, question: q });
    const user = await getSessionUser(req).catch(() => null);
    const cid = await recordTurn(chatId, { occupation_id: c.occ.id, surface: 'admin', visitor: (user as any)?.email || null }, { question: q, ...r });
    await logQuestion(cid, { occupation_id: c.occ.id, surface: 'admin', visitor: (user as any)?.email || null }, { question: q, ...r });
    // 数据飞轮：大家问什么 → 需求信号；平方答不上的 → 知识缺口（权重高，优先补齐、质检）
    trackDemand(req, [{ source: r.gap ? 'lab_chat_gap' : 'lab_chat', query: r.gap || q, profession: c.occ.name }]);
    return NextResponse.json({ success: true, chatId: cid, ...r });
  } catch (e: any) {
    console.error('[KgChat]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
