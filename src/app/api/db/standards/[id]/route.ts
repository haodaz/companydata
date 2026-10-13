import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { STANDARD_EDITABLE_KEYS, computeStandardCompleteness, sanitizeStandard, standardDedupeKey } from '@/lib/standard-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const { data, error } = await supabaseAdmin.from('industry_standards').select('*, search:standard_searches(id, query, profession, created_at)').eq('id', id).single();
    if (error) throw error;
    const { data: links } = await supabaseAdmin.from('standard_links').select('id, space_id, chapter_id, target, clause, note, confidence').eq('standard_id', id);
    return NextResponse.json({ success: true, standard: data, links: links || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 编辑 / 审核：人工改过的字段锁定，AI 不再覆盖 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const body = await req.json();
    const now = new Date().toISOString();
    const { data: current } = await supabaseAdmin.from('industry_standards').select('*').eq('id', id).single();
    if (!current) return NextResponse.json({ success: false, error: '标准不存在' }, { status: 404 });
    const locked = new Set<string>(current.human_locked_fields || []);
    const updates: Record<string, any> = { updated_at: now };
    const incoming: Record<string, any> = {};
    for (const k of STANDARD_EDITABLE_KEYS) if (body[k] !== undefined) incoming[k] = body[k] === '' ? null : body[k];
    const clean = Object.keys(incoming).length ? sanitizeStandard({ ...current, ...incoming }) : {};
    for (const k of Object.keys(incoming)) {
      const v = clean[k] ?? null; updates[k] = v;
      if (JSON.stringify(v) !== JSON.stringify(current[k] ?? null)) locked.add(k);
    }
    if (incoming.code !== undefined || incoming.title !== undefined) updates.dedupe_key = standardDedupeKey({ ...current, ...updates });
    for (const k of body.unlock || []) locked.delete(k);
    updates.human_locked_fields = Array.from(locked);
    if (body.human_review_status !== undefined) { updates.human_review_status = body.human_review_status; updates.human_review_at = now; }
    if (body.human_review_note !== undefined) updates.human_review_note = body.human_review_note;
    if (updates.title === null) return NextResponse.json({ success: false, error: '名称不能为空' }, { status: 400 });
    updates.completeness_score = computeStandardCompleteness({ ...current, ...updates });
    const { data, error } = await supabaseAdmin.from('industry_standards').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, standard: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const { error } = await supabaseAdmin.from('industry_standards').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
