import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ENTITY_TABLES, entityCompleteness, sanitizeEntity, type LibraryType } from '@/lib/entity-fields';
import { linksOf } from '@/lib/entity-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ type: string; id: string }> };
const cfg = (t: string) => (t in ENTITY_TABLES ? ENTITY_TABLES[t as LibraryType] : null);

/** 详情 + 全部关联（会用它 / 在这里工作的职业、在哪个场所用、场所里有哪些东西）+ 能亲手体验的百业空间 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { type, id } = await ctx.params;
    const c = cfg(type);
    if (!c) return NextResponse.json({ success: false, error: '未知实体' }, { status: 404 });
    const { data: e, error } = await supabaseAdmin.from(c.table).select('*').eq('id', id).single();
    if (error || !e) return NextResponse.json({ success: false, error: '不存在' }, { status: 404 });
    const links = await linksOf(type, Number(id));
    const taskIds = Array.from(new Set(links.flatMap((l: any) => l.lab_task_ids || [])));
    const { data: spaces } = taskIds.length ? await supabaseAdmin.from('skill_tasks').select('id, title').in('id', taskIds) : { data: [] as any[] };
    return NextResponse.json({ success: true, entity: e, links, spaces: spaces || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/** 人工编辑：改到的字段锁定；也可改审核状态 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { type, id } = await ctx.params;
    const c = cfg(type);
    if (!c) return NextResponse.json({ success: false, error: '未知实体' }, { status: 404 });
    const body = await req.json();
    const { data: e } = await supabaseAdmin.from(c.table).select('*').eq('id', id).single();
    if (!e) return NextResponse.json({ success: false, error: '不存在' }, { status: 404 });
    const fields = sanitizeEntity(c.fields, body);
    const locked = new Set<string>(e.human_locked_fields || []);
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) if (JSON.stringify(e[k] ?? null) !== JSON.stringify(v ?? null)) { patch[k] = v; locked.add(k); }
    patch.human_locked_fields = Array.from(locked);
    if (body.human_review_status !== undefined) { patch.human_review_status = body.human_review_status; patch.human_review_at = new Date().toISOString(); }
    patch.completeness_score = entityCompleteness(c.fields, { ...e, ...patch });
    patch.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from(c.table).update(patch).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { type, id } = await ctx.params;
  const c = cfg(type);
  if (!c) return NextResponse.json({ success: false, error: '未知实体' }, { status: 404 });
  const { error } = await supabaseAdmin.from(c.table).update({ if_delete: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
