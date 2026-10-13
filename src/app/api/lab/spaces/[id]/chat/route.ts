import { NextResponse } from 'next/server';
import { chatReply, loadChatContext, opening, recordTurn } from '@/lib/kg/persona-chat';
import { LAB_GUEST } from '@/lib/lab-guest';
import { getSessionUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** 体验百业 / 百业工厂：和这个空间的数字职人聊这一行。GET 开场白；POST { question, history, chatId, surface } 回答一轮 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const c = await loadChatContext({ spaceId: id });
    const nick = String(new URL(_req.url).searchParams.get('nickname') || '').trim().slice(0, 16);
    if (nick) c.persona = { ...c.persona, nickname: nick };
    const jobs = Number(c.knowledge.text.match(/一共 (\d+) 个在招/)?.[1] || 0);
    // 独立对话页的左半边：立绘（人物首页那张全身像）+ 工作场景（第一章的封面，没有就用空间的）
    const { data: ch } = await supabaseAdmin.from('lab_chapters').select('sim').eq('task_id', id).order('seq').limit(1).maybeSingle();
    const scene = ch?.sim?.art?.cover || c.space?.sim?.art?.cover || null;
    return NextResponse.json({ success: true, occupation: { id: c.occ.id, name: c.occ.name }, persona: c.persona, scene, title: c.space?.title || '', ...opening(c.occ, c.persona, jobs) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { question, history = [], chatId = null, surface = 'lab', nickname = '' } = await req.json();
    const q = String(question || '').trim().slice(0, 500);
    if (!q) return NextResponse.json({ success: false, error: '说点什么吧' }, { status: 400 });
    // 游客一段对话最多 30 轮，防刷
    if (req.headers.get(LAB_GUEST) && Array.isArray(history) && history.length > 60) return NextResponse.json({ success: false, error: '这段聊得够久啦，刷新一下重新开始吧' }, { status: 429 });
    const c = await loadChatContext({ spaceId: id });
    const nick = String(nickname || '').trim().slice(0, 16);
    const r = await chatReply({ occ: c.occ, persona: nick ? { ...c.persona, nickname: nick } : c.persona, knowledge: c.knowledge, history, question: q });
    const user = req.headers.get(LAB_GUEST) ? null : await getSessionUser(req).catch(() => null);
    const cid = await recordTurn(chatId, { space_id: id, occupation_id: c.occ.id, surface: surface === 'studio' ? 'studio' : 'lab', visitor: (user as any)?.email || null }, { question: q, ...r });
    return NextResponse.json({ success: true, chatId: cid, ...r });
  } catch (e: any) {
    console.error('[PersonaChat]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
