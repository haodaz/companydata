import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { INSTRUMENT_CATEGORIES, isDomesticCountry } from '@/lib/instrument-categories';
import { PRODUCT_TYPES } from '@/lib/research-products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 科研产品库（仪器设备 / 试剂耗材 / 服务），服务于仪器设备服务的评价 + 资源推荐平台。
 * GET ?id=  单个产品 + 资料（手册 / 规格书 / 操作手册…，不带全文）
 * GET ?type=&category=&supplier=&origin=domestic|imported&doc=1&price=1&search=&page=&pageSize=
 * 统计卡：产品数（按类型）、厂商数、类目覆盖、有资料 / 有规格参数 / 有价格 / 国产占比
 */
/** 图：存进桶的用桶里的公开链接（防盗链 / 换图也能看），没存下来的用原图链 */
const imgUrl = (g: any) => g?.storage_path ? supabaseAdmin.storage.from('research-images').getPublicUrl(g.storage_path).data.publicUrl : g?.url || null;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams;
    const id = u.get('id');
    if (id) {
      const { data: p, error } = await supabaseAdmin.from('research_products').select('*, supplier:companies(id, name, name_en, country, official_website)').eq('id', id).single();
      if (error) throw error;
      const { data: docs } = await supabaseAdmin.from('research_product_docs').select('id, doc_type, title, url, file_type, size_bytes, lang, storage_path, pages, fetched_at').eq('product_id', id).not('if_delete', 'is', true).order('doc_type');
      return NextResponse.json({ success: true, data: { ...p, images: ((p.images || []) as any[]).map(g => ({ ...g, src: imgUrl(g) })), docs: docs || [] } });
    }
    const type = u.get('type') || '', category = u.get('category') || '', supplier = u.get('supplier') || '', origin = u.get('origin') || '';
    const onlyDoc = u.get('doc') === '1', onlyPrice = u.get('price') === '1', search = (u.get('search') || '').trim().toLowerCase();
    const page = Math.max(1, parseInt(u.get('page') || '1')), pageSize = Math.min(200, Math.max(10, parseInt(u.get('pageSize') || '50')));

    const { data } = await selectAll(() => supabaseAdmin.from('research_products')
      .select('id, external_id, name, brand, model_no, specification, price, type, kind, category, labels, disciplines, applications, brand_origin, service_mode, status, supplier_id, source_url, specs, images, human_review_status, updated_at')
      .not('if_delete', 'is', true).order('id'));
    const all = data as any[];
    const { data: docRows } = await selectAll(() => supabaseAdmin.from('research_product_docs').select('product_id, doc_type').not('if_delete', 'is', true).order('id'));
    const docsBy = new Map<number, string[]>();
    for (const d of (docRows || []) as any[]) docsBy.set(d.product_id, [...(docsBy.get(d.product_id) || []), d.doc_type]);
    const supIds = [...new Set(all.map(p => p.supplier_id).filter(Boolean))];
    const sups = new Map<number, any>();
    for (let i = 0; i < supIds.length; i += 300) {
      const { data: s } = await supabaseAdmin.from('companies').select('id, name, country').in('id', supIds.slice(i, i + 300));
      for (const c of s || []) sups.set(c.id, c);
    }
    const hasSpecs = (p: any) => p.specs && Object.keys(p.specs).length > 0;
    const stats = {
      products: all.length,
      byType: PRODUCT_TYPES.map(t => ({ ...t, n: all.filter(p => p.type === t.value).length })),
      suppliers: supIds.length,
      categories_covered: new Set(all.map(p => p.category).filter(Boolean)).size,
      categories_total: INSTRUMENT_CATEGORIES.length,
      with_docs: all.filter(p => docsBy.has(p.id)).length,
      docs: (docRows || []).length,
      docsByType: Object.entries(((docRows || []) as any[]).reduce((m: any, d) => ({ ...m, [d.doc_type]: (m[d.doc_type] || 0) + 1 }), {})).map(([k, n]) => ({ key: k, n })),
      with_specs: all.filter(hasSpecs).length,
      with_images: all.filter(p => (p.images || []).length).length,
      with_price: all.filter(p => p.price && !/询价|面议|咨询/.test(p.price)).length,
      domestic: all.filter(p => p.brand_origin === 'domestic' || (!p.brand_origin && isDomesticCountry(sups.get(p.supplier_id)?.country))).length,
    };
    let rows = all;
    if (type) rows = rows.filter(p => p.type === type);
    if (category) rows = rows.filter(p => p.category === category);
    if (supplier) rows = rows.filter(p => String(p.supplier_id) === supplier);
    if (origin === 'domestic') rows = rows.filter(p => p.brand_origin === 'domestic' || (!p.brand_origin && isDomesticCountry(sups.get(p.supplier_id)?.country)));
    if (origin === 'imported') rows = rows.filter(p => !(p.brand_origin === 'domestic' || (!p.brand_origin && isDomesticCountry(sups.get(p.supplier_id)?.country))));
    if (onlyDoc) rows = rows.filter(p => docsBy.has(p.id));
    if (onlyPrice) rows = rows.filter(p => p.price && !/询价|面议|咨询/.test(p.price));
    if (search) rows = rows.filter(p => `${p.name} ${p.brand || ''} ${p.model_no || ''} ${p.labels || ''} ${p.applications || ''} ${sups.get(p.supplier_id)?.name || ''}`.toLowerCase().includes(search));
    const total = rows.length;
    const list = rows.sort((a, b) => (docsBy.get(b.id)?.length || 0) - (docsBy.get(a.id)?.length || 0) || b.id - a.id).slice((page - 1) * pageSize, page * pageSize)
      .map(p => ({ ...p, specs_count: hasSpecs(p) ? Object.keys(p.specs).length : 0, specs: undefined, image: imgUrl((p.images || [])[0]), images_count: (p.images || []).length, images: undefined, docs: docsBy.get(p.id) || [], supplier: sups.get(p.supplier_id) || null }));
    return NextResponse.json({ success: true, data: list, total, page, pageSize, stats });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
