import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { COMPETITION_EDITABLE_KEYS, computeCompetitionCompleteness, parseDeadline, sanitizeCompetition } from '@/lib/competition-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const { data, error } = await supabaseAdmin.from('competitions').select('*, search:competition_searches(id, query, company, created_at), organizer_company:companies!competitions_organizer_company_id_fkey(id, name, segment)').eq('id', id).single();
    if (error) throw error;
    return NextResponse.json({ success: true, competition: data });
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
    const { data: current } = await supabaseAdmin.from('competitions').select('*').eq('id', id).single();
    if (!current) return NextResponse.json({ success: false, error: '赛事不存在' }, { status: 404 });
    const locked = new Set<string>(current.human_locked_fields || []);
    const updates: Record<string, any> = { updated_at: now };
    const incoming: Record<string, any> = {};
    for (const k of COMPETITION_EDITABLE_KEYS) if (body[k] !== undefined) incoming[k] = body[k] === '' ? null : body[k];
    const clean = Object.keys(incoming).length ? sanitizeCompetition({ ...current, ...incoming }) : {};
    for (const k of Object.keys(incoming)) {
      const v = clean[k] ?? null;
      updates[k] = v;
      if (JSON.stringify(v) !== JSON.stringify(current[k] ?? null)) locked.add(k);
    }
    if (incoming.registration_deadline_str !== undefined) updates.registration_deadline = parseDeadline(updates.registration_deadline_str);
    for (const k of body.unlock || []) locked.delete(k);
    updates.human_locked_fields = Array.from(locked);
    if (body.human_review_status !== undefined) { updates.human_review_status = body.human_review_status; updates.human_review_at = now; }
    if (body.human_review_note !== undefined) updates.human_review_note = body.human_review_note;
    if (updates.name === null) return NextResponse.json({ success: false, error: '赛事名称不能为空' }, { status: 400 });
    updates.completeness_score = computeCompetitionCompleteness({ ...current, ...updates });
    const { data, error } = await supabaseAdmin.from('competitions').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, competition: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const { error } = await supabaseAdmin.from('competitions').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
