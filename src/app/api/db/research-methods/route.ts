import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 实验方法库（迁移 058，2026-11-02）：仪器 / 试剂 ↔ 方法 ↔ 学科 / 百业科研空间的中间层。
 * GET            全部方法（一百来个，一次给完）+ 统计
 * GET ?id=       单个方法 + 用到的通用仪器（百业工具设备库）+ 挂上的科研产品（前 40 条）
 */
const methodFilter = (k: string) => `methods.eq.${k},methods.like."${k},%",methods.like."%,${k}",methods.like."%,${k},%"`;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams;
    const id = u.get('id');
    if (id) {
      const { data: m, error } = await supabaseAdmin.from('research_methods').select('*').eq('id', id).single();
      if (error) throw error;
      const { data: ls } = await supabaseAdmin.from('entity_links').select('to_id').eq('from_type', 'method').eq('from_id', m.id).eq('to_type', 'item').eq('if_delete', false);
      const ids = (ls || []).map(l => l.to_id);
      const { data: items } = ids.length ? await supabaseAdmin.from('work_items').select('id, name, kind, lab_bench').in('id', ids) : { data: [] as any[] };
      const { data: prods, count } = await supabaseAdmin.from('research_products').select('id, name, brand, model_no, type, kind, category, supplier:companies(id, name)', { count: 'exact' })
        .not('if_delete', 'is', true).or(methodFilter(m.key)).order('id', { ascending: false }).limit(40);
      return NextResponse.json({ success: true, data: { ...m, items: items || [], products: prods || [], products_total: count || 0 } });
    }
    const { data, error } = await supabaseAdmin.from('research_methods').select('id, key, name, name_en, aliases, field, disciplines, summary, level, generic_instruments, product_count, steps, pitfalls, human_review_status').eq('if_delete', false).order('field').order('product_count', { ascending: false });
    if (error) throw error;
    const rows = (data || []).map(m => ({ ...m, steps_n: (m.steps || []).length, pitfalls_n: (m.pitfalls || []).length, steps: undefined, pitfalls: undefined }));
    const { count: linked } = await supabaseAdmin.from('research_products').select('id', { count: 'exact', head: true }).not('if_delete', 'is', true).not('methods', 'is', null);
    const { count: products } = await supabaseAdmin.from('research_products').select('id', { count: 'exact', head: true }).not('if_delete', 'is', true);
    const { count: itemLinks } = await supabaseAdmin.from('entity_links').select('id', { count: 'exact', head: true }).eq('from_type', 'method').eq('to_type', 'item').eq('if_delete', false);
    const fields = Array.from(new Set(rows.map(r => r.field).filter(Boolean)));
    return NextResponse.json({ success: true, data: rows, stats: { methods: rows.length, with_guide: rows.filter(r => r.steps_n).length, products, linked, item_links: itemLinks || 0, fields: fields.map(f => ({ field: f, n: rows.filter(r => r.field === f).length })) } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
