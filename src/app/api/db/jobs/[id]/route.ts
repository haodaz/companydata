import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { JOB_FIELD_KEYS, jobCompleteness } from '@/lib/job-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select('*, company_ref:companies(id, name, name_en, segment, industry, campus_url, official_website)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, job: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * 编辑岗位。fields 里人工改过的字段会记入 human_locked_fields，之后重新提取不再覆盖。
 * body: { fields?: {...}, human_review_status?, human_review_note?, status?, unlock?: string[] }
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const body = await req.json();

    const { data: current, error: curErr } = await supabaseAdmin.from('jobs').select('*').eq('id', id).single();
    if (curErr) throw curErr;

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: now };
    const locked = new Set<string>(current.human_locked_fields || []);

    for (const [k, v] of Object.entries(body.fields || {})) {
      if (!JOB_FIELD_KEYS.includes(k)) continue;
      updates[k] = v === '' ? null : v;
      locked.add(k);
    }
    for (const k of body.unlock || []) locked.delete(k);
    if (updates.name === null) return NextResponse.json({ success: false, error: '岗位名称不能为空' }, { status: 400 });

    if (body.human_review_status !== undefined) { updates.human_review_status = body.human_review_status; updates.human_review_at = now; }
    if (body.human_review_note !== undefined) updates.human_review_note = body.human_review_note;
    if (body.status !== undefined) updates.status = body.status;
    updates.human_locked_fields = Array.from(locked);
    updates.completeness_score = jobCompleteness({ ...current, ...updates });

    const { data, error } = await supabaseAdmin.from('jobs').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, job: data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const id = parseInt((await params).id);
    const { error } = await supabaseAdmin.from('jobs').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
