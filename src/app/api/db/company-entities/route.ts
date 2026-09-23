import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { SUB_ENTITIES, type SubEntityKey } from '@/lib/company-fields';
import { refreshCompleteness } from '@/lib/company-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EDITABLE: Record<SubEntityKey, string[]> = {
  financings: ['finance_round', 'finance_round_str', 'finance_amount', 'finance_enterprise', 'publish_date', 'publish_date_str', 'source_url'],
  news: ['description', 'publish_date', 'publish_date_str', 'publish_source', 'source_url', 'kind'],
  executives: ['name', 'title', 'description', 'education', 'gender', 'age', 'is_founder', 'salary', 'share_holding', 'share_ratio', 'start_date', 'start_date_str', 'source_url'],
};

function tableOf(entity: string): { table: string; key: SubEntityKey } | null {
  if (!(entity in SUB_ENTITIES)) return null;
  return { table: SUB_ENTITIES[entity as SubEntityKey].table, key: entity as SubEntityKey };
}

/** 列表：?entity=financings|news|executives&companyId=1 */
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const t = tableOf(sp.get('entity') || '');
    const companyId = parseInt(sp.get('companyId') || '');
    if (!t || !companyId) return NextResponse.json({ success: false, error: 'Missing entity or companyId' }, { status: 400 });
    const order = t.key === 'executives' ? 'id' : 'publish_date';
    const { data, error } = await supabaseAdmin.from(t.table).select('*').eq('company_id', companyId).eq('if_delete', false).order(order, { ascending: t.key === 'executives', nullsFirst: false }).limit(500);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * 编辑 / 审核：{ entity, id, ...fields, human_review_status?, unlock?: string[] }
 * 人工改过的字段锁定，流水线不再覆盖；ids 批量时只改审核状态。
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const t = tableOf(body.entity || '');
    if (!t) return NextResponse.json({ success: false, error: 'Unknown entity' }, { status: 400 });
    const now = new Date().toISOString();

    if (Array.isArray(body.ids) && body.ids.length) {
      const { error } = await supabaseAdmin.from(t.table).update({ human_review_status: body.human_review_status, human_review_at: now, updated_at: now }).in('id', body.ids);
      if (error) throw error;
      return NextResponse.json({ success: true, updated: body.ids.length });
    }

    const id = parseInt(body.id);
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
    const { data: current } = await supabaseAdmin.from(t.table).select('*').eq('id', id).single();
    if (!current) return NextResponse.json({ success: false, error: '记录不存在' }, { status: 404 });
    const locked = new Set<string>(current.human_locked_fields || []);
    const updates: Record<string, any> = { updated_at: now };
    for (const k of EDITABLE[t.key]) {
      if (body[k] === undefined) continue;
      const v = body[k] === '' ? null : body[k];
      updates[k] = v;
      if (JSON.stringify(v ?? null) !== JSON.stringify(current[k] ?? null)) locked.add(k);
    }
    for (const k of body.unlock || []) locked.delete(k);
    updates.human_locked_fields = Array.from(locked);
    if (body.human_review_status !== undefined) { updates.human_review_status = body.human_review_status; updates.human_review_at = now; }
    const { data, error } = await supabaseAdmin.from(t.table).update(updates).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, row: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 删除 = 软删（if_delete，与平方同步字段一致），流水线不会复活它 */
export async function DELETE(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const t = tableOf(sp.get('entity') || '');
    const id = parseInt(sp.get('id') || '');
    if (!t || !id) return NextResponse.json({ success: false, error: 'Missing entity or id' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from(t.table).update({ if_delete: true, updated_at: new Date().toISOString() }).eq('id', id).select('company_id').single();
    if (error) throw error;
    if (data?.company_id) await refreshCompleteness(data.company_id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
