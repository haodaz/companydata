import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';

export const runtime = 'nodejs';

/** 参与者看到的题：任务书 / 交付物 / 规则 / 材料。rubric、基线、出题材料不给（评的是过程，标准不提前亮） */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: t } = await db.from('work_tasks').select('id, status, company_name, role, problem, task, materials, owner_key').eq('share_token', token).maybeSingle();
  // 已发布的谁都能做；待发布的只有出题人带着管理密钥预览（?k=）能进；下架的不开
  const k = req.nextUrl.searchParams.get('k') || '';
  const preview = !!(t && k && k === t.owner_key);
  if (!t || !(t.status === 'published' || (t.status === 'ready' && preview))) return NextResponse.json({ ok: false, error: t?.status === 'ready' ? '这道题还没发布，出题人确认后才能做' : '这个链接不可用' }, { status: 404 });
  // 案例推进式的参考答案 / 算式只给评卷用，候选人看不到
  // 出题侧的东西不给候选人：AI 使用标准（评分照它评）、修订记录、通用大模型对比（2026-10-30）
  const { ai_policy: _p, revisions: _r, compare: _c, ...pub } = t.task || {};
  const task = pub.stages ? { ...pub, stages: pub.stages.map((st: any) => ({ id: st.id, type: st.type, question: st.question, reveal: st.reveal })) } : pub;
  return NextResponse.json({ ok: true, preview, status: t.status, task: { id: t.id, company_name: t.company_name, role: t.role, statement: t.problem?.statement, task, materials: t.materials } });
}
