import { NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminUser } from '@/lib/session';
import { FILL_PARTS, fillOccupationPart } from '@/lib/kg/fill-occupation';

export const runtime = 'nodejs';
export const maxDuration = 800;

/** 排补全任务：{ ids, part } → 这些问题涉及的职业逐个补这一块（后台跑），问题标「已排任务」 */
export async function POST(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const { ids = [], occupationIds = [], part, model } = await req.json();
  if (!FILL_PARTS[part]) return NextResponse.json({ success: false, error: '选一块要补的' }, { status: 400 });
  // 两种来源：选中的问题（问题标「已排任务」）/ 排产建议直接给职业（这些职业里还没处理的问题一起标上）
  const { data: rows } = ids.length
    ? await supabaseAdmin.from('kg_questions').select('id, occupation_id').in('id', ids)
    : await supabaseAdmin.from('kg_questions').select('id, occupation_id').in('occupation_id', occupationIds).in('status', ['new', 'ok']).not('gap', 'is', null);
  const occs = Array.from(new Set([...(rows || []).map(r => r.occupation_id), ...occupationIds].filter(Boolean))) as number[];
  if (!occs.length) return NextResponse.json({ success: false, error: '这些问题没有对应的职业' }, { status: 400 });
  const qids = (rows || []).map(r => r.id);
  if (qids.length) await supabaseAdmin.from('kg_questions').update({ status: 'task', task_part: part, task_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', qids);
  after(async () => {
    for (const o of occs) await fillOccupationPart(o, part, model).catch(e => console.warn('[kg-task]', o, part, e?.message));
  });
  return NextResponse.json({ success: true, occupations: occs.length, part: FILL_PARTS[part] });
}
