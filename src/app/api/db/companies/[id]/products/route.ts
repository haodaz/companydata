import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { crawlCompanyProducts } from '@/lib/agents/company-products-crawl';
import { saveCompanyProducts } from '@/lib/company-store';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 核心产品从官网抓（数据部门 11-20）：{ urls?: string[], model }
 * 不给 urls：读官网首页挑产品页；给了：只读这些页（人工补的链接）。官网提到的产品都入库，每条带抓取页面链接，已有的只填空。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseInt((await params).id);
    const { urls, model } = await req.json().catch(() => ({}));
    const { data: company, error } = await supabaseAdmin.from('companies').select('id, name, official_website').eq('id', id).single();
    if (error) throw error;
    const { data: have } = await supabaseAdmin.from('company_products').select('name').eq('company_id', id).eq('if_delete', false);
    const r = await withCost({ tool_name: 'company-pipeline', task_name: 'Company Products Crawl' }, () => crawlCompanyProducts(company, { urls: Array.isArray(urls) ? urls : [], model: model || 'qwen-plus', existing: (have || []).map(p => p.name) }));
    const saved = r.products.length ? await saveCompanyProducts(id, r.products) : 0;
    return NextResponse.json({ success: true, pages: r.pages, found: r.products.length, saved });
  } catch (error: any) {
    console.error('[CompanyProducts]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
