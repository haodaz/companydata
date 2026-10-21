import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { INSTRUMENT_CATEGORIES, INSTRUMENT_EXHIBITIONS, isDomesticCountry } from '@/lib/instrument-categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 科研仪器厂商 = 企业实体库里有「仪器类目」的企业（数据部门 10-21 #21，用户定：企业实体库的筛选视图，另有专门的统计卡便于核算）。
 * GET ?category=&scope=cn|intl&exhibition=&search=&page=&pageSize=
 * 返回列表 + 统计：厂商数（国内 / 海外）、22 类覆盖（每类厂商数、国内厂商数）、产品数、有产品的厂商、按展会来源
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams;
    const category = u.get('category') || '', scope = u.get('scope') || '', exhibition = u.get('exhibition') || '', search = (u.get('search') || '').trim();
    const page = Math.max(1, parseInt(u.get('page') || '1')), pageSize = Math.min(200, Math.max(10, parseInt(u.get('pageSize') || '50')));

    const { data } = await selectAll(() => supabaseAdmin.from('companies')
      .select('id, name, name_en, country, official_website, logo_url, supplier_categories, supplier_exhibitions, completeness_score, human_review_status')
      .not('if_delete', 'is', true).not('supplier_categories', 'eq', '{}').not('supplier_categories', 'is', null).order('id'));
    const all = data as any[];
    const { data: prods } = await selectAll(() => supabaseAdmin.from('research_products').select('supplier_id, category').not('if_delete', 'is', true).order('id'));
    const prodBy = new Map<number, number>();
    for (const p of (prods || []) as any[]) if (p.supplier_id) prodBy.set(p.supplier_id, (prodBy.get(p.supplier_id) || 0) + 1);

    // 统计卡：全量口径
    const coverage = INSTRUMENT_CATEGORIES.map(c => {
      const sup = all.filter(s => (s.supplier_categories || []).includes(c.key));
      return { key: c.key, name: c.name, type: c.type, suppliers: sup.length, domestic: sup.filter(s => isDomesticCountry(s.country)).length, products: ((prods || []) as any[]).filter(p => p.category === c.key).length };
    });
    const byExhibition = INSTRUMENT_EXHIBITIONS.map(e => ({ name: e.name, scope: e.scope, suppliers: all.filter(s => (s.supplier_exhibitions || []).includes(e.name)).length }));
    const stats = {
      suppliers: all.length,
      domestic: all.filter(s => isDomesticCountry(s.country)).length,
      categories_covered: coverage.filter(c => c.suppliers > 0).length,
      categories_total: INSTRUMENT_CATEGORIES.length,
      categories_missing_domestic: coverage.filter(c => c.domestic === 0).map(c => c.name),
      products: (prods || []).length,
      suppliers_with_products: [...prodBy.keys()].length,
      from_exhibitions: all.filter(s => (s.supplier_exhibitions || []).length).length,
    };

    let rows = all;
    if (category) rows = rows.filter(s => (s.supplier_categories || []).includes(category));
    if (scope === 'cn') rows = rows.filter(s => isDomesticCountry(s.country));
    if (scope === 'intl') rows = rows.filter(s => !isDomesticCountry(s.country));
    if (exhibition) rows = rows.filter(s => (s.supplier_exhibitions || []).includes(exhibition));
    if (search) { const q = search.toLowerCase(); rows = rows.filter(s => `${s.name} ${s.name_en || ''}`.toLowerCase().includes(q)); }
    const total = rows.length;
    const list = rows.sort((a, b) => (prodBy.get(b.id) || 0) - (prodBy.get(a.id) || 0) || (b.supplier_categories?.length || 0) - (a.supplier_categories?.length || 0))
      .slice((page - 1) * pageSize, page * pageSize).map(s => ({ ...s, domestic: isDomesticCountry(s.country), products: prodBy.get(s.id) || 0 }));
    return NextResponse.json({ success: true, data: list, total, page, pageSize, stats, coverage, byExhibition });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
