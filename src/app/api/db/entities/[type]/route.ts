import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { orIlike, pageParams } from '@/lib/pg-filter';
import { requireDownload } from '@/lib/download-permission';
import { ENTITY_TABLES, type LibraryType } from '@/lib/entity-fields';
import { upsertEntity } from '@/lib/entity-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ type: string }> };
const cfg = (t: string) => (t in ENTITY_TABLES ? ENTITY_TABLES[t as LibraryType] : null);

/** 工作场所 / 工具设备列表：search / category / kind / source / labOnly / withStats / exportAll；每条带关联的职业数 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const type = (await ctx.params).type;
    const c = cfg(type);
    if (!c) return NextResponse.json({ success: false, error: '未知实体' }, { status: 404 });
    const { searchParams } = new URL(req.url);
    const get = (k: string) => searchParams.get(k) || '';
    const exportAll = get('exportAll') === 'true';
    if (exportAll) { const denied = await requireDownload(req); if (denied) return denied; }
    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const build = () => {
      let q: any = (supabaseAdmin.from(c.table) as any).select('*', { count: 'exact' }).eq('if_delete', false);
      const s = get('search').trim();
      if (s) q = q.or(`${orIlike(['name', 'name_en', 'category', 'description'], s)},aliases.cs.{${JSON.stringify(s)}}`);
      if (get('category')) q = q.eq('category', get('category'));
      if (get('kind')) q = q.eq('kind', get('kind'));
      if (get('source')) q = q.eq('source', get('source'));
      if (get('labOnly') === '1') q = type === 'item' ? q.not('lab_bench', 'is', null) : q.not('image_url', 'is', null);
      return q.order('updated_at', { ascending: false }).order('id', { ascending: true });
    };
    const { data, count, error } = exportAll ? await selectAll(build).then(r => ({ ...r, count: r.data.length })) : await build().range(from, to);
    if (error) throw error;
    const rows: any[] = data || [];
    // 关联的职业数
    if (rows.length) {
      const { data: ls } = await supabaseAdmin.from('entity_links').select('to_id, from_id').eq('from_type', 'occupation').eq('to_type', type).eq('if_delete', false).in('to_id', rows.map(r => r.id));
      const n = new Map<number, number>();
      for (const l of ls || []) n.set(l.to_id, (n.get(l.to_id) || 0) + 1);
      for (const r of rows) r.occupation_count = n.get(r.id) || 0;
    }
    let stats: Record<string, number> | undefined;
    let facets: Record<string, number> | undefined;
    if (get('withStats') === '1') {
      const { data: all } = await selectAll(() => supabaseAdmin.from(c.table).select(type === 'item' ? 'id, kind, source, lab_bench, image_url' : 'id, category, source, image_url').eq('if_delete', false).order('id'));
      const { count: linkCount } = await supabaseAdmin.from('entity_links').select('id', { count: 'exact', head: true }).eq('to_type', type).eq('if_delete', false);
      stats = { total: 0, lab: 0, ai: 0, with_image: 0, bench: 0, links: linkCount || 0 };
      facets = {};
      for (const r of all as any[]) {
        stats.total++;
        if (r.source === 'lab') stats.lab++;
        if (r.source === 'ai') stats.ai++;
        if (r.image_url) stats.with_image++;
        if (r.lab_bench) stats.bench++;
        const f = (type === 'item' ? r.kind : r.category) || 'none';
        facets[f] = (facets[f] || 0) + 1;
      }
    }
    return NextResponse.json({ success: true, data: rows, total: count || 0, page, pageSize, stats, facets });
  } catch (e: any) {
    console.error('[Entities] GET', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/** 手工新建：{ name, ...字段 } */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const type = (await ctx.params).type;
    if (!cfg(type)) return NextResponse.json({ success: false, error: '未知实体' }, { status: 404 });
    const body = await req.json();
    const r = await upsertEntity(type as LibraryType, body, { mode: 'fill', source: 'manual' });
    return NextResponse.json({ success: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
