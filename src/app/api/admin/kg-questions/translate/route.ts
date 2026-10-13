import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminUser } from '@/lib/session';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 转译草稿：把合格的问答（问题 + 职人回答 + 来源）整理成一条中立的「平方问答库」条目，给人改：
 * 去掉角色口吻和寒暄，只留有来源的事实；网上来的要标「据网上资料」；不加任何新事实。
 */
export async function POST(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const { ids } = await req.json();
  const { data: rows } = await supabaseAdmin.from('kg_questions').select('id, occupation_id, question, reply, sources, web_points, occupation:occupations(name)').in('id', ids || []);
  if (!rows?.length) return NextResponse.json({ success: false, error: '没选' }, { status: 400 });
  const occ = (rows[0] as any).occupation?.name || '';
  const prompt = `把下面关于「${occ}」的问答整理成知识库里的一条问答（给以后回答同类问题用）：
- question：把用户的问法改成规范、通用的问题；
- answer：中立陈述（不要第一人称、不要角色口吻和寒暄），只保留原回答里有来源编号支撑的事实，不加任何新内容；来自互联网（W 编号）的要写「据网上资料」；200 字以内；
- sources：原回答里用到的来源（title + url，没有 url 的写 null）。
返回 JSON：{ "question": ..., "answer": ..., "sources": [{ "title": ..., "url": ... }] }

${rows.map((r: any) => `问：${r.question}\n答：${r.reply}\n来源：${(r.sources || []).map((s: any) => `${s.id} ${s.title} ${s.url || ''}`).join('；')}${r.web_points ? `\n网上要点：${r.web_points}` : ''}`).join('\n\n')}`;
  const r = await generateContent(prompt, process.env.PERSONA_CHAT_MODEL || 'qwen-plus', { jsonMode: true });
  const p = parseJsonLoose(r.text) || {};
  return NextResponse.json({ success: true, occupation_id: rows[0].occupation_id, occupation: occ, question: String(p.question || rows[0].question), answer: String(p.answer || ''), sources: Array.isArray(p.sources) ? p.sources : [] });
}
