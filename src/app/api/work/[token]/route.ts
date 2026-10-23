import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';

export const runtime = 'nodejs';

/** 参与者看到的题：任务书 / 交付物 / 规则 / 材料。rubric、基线、出题材料不给（评的是过程，标准不提前亮） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: t } = await db.from('work_tasks').select('id, status, company_name, role, problem, task, materials').eq('share_token', token).maybeSingle();
  if (!t || !['ready', 'published'].includes(t.status)) return NextResponse.json({ ok: false, error: '这个链接不可用' }, { status: 404 });
  // 案例推进式的参考答案 / 算式只给评卷用，候选人看不到
  const task = t.task?.stages ? { ...t.task, stages: t.task.stages.map((st: any) => ({ id: st.id, type: st.type, question: st.question, reveal: st.reveal })) } : t.task;
  return NextResponse.json({ ok: true, task: { id: t.id, company_name: t.company_name, role: t.role, statement: t.problem?.statement, task, materials: t.materials } });
}
