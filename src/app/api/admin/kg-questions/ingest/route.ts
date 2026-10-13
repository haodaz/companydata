import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser, requireAdminUser } from '@/lib/session';

export const runtime = 'nodejs';

/** 入库：{ occupation_id, question, answer, sources, ids } → 平方问答库一条；对应问答标「已转译入库」 */
export async function POST(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const { occupation_id, question, answer, sources = [], ids = [] } = await req.json();
  if (!occupation_id || !String(question || '').trim() || !String(answer || '').trim()) return NextResponse.json({ success: false, error: '问题和回答都要有' }, { status: 400 });
  const user = await getSessionUser(req).catch(() => null);
  const { data, error } = await supabaseAdmin.from('occupation_faqs').insert({ occupation_id, question: String(question).trim(), answer: String(answer).trim(), sources, from_question_ids: ids, reviewer: user?.email || null }).select('id').single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (ids.length) await supabaseAdmin.from('kg_questions').update({ status: 'ingested', faq_id: data.id, reviewer: user?.email || null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', ids);
  return NextResponse.json({ success: true, id: data.id });
}
