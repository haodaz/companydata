import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { computeRelated } from '@/lib/company-related';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 关联企业：全库拉一遍轻量字段在内存里算交集，不调大模型（几千家以内毫秒级） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseInt((await params).id);
    const [companies, products, executives, financings] = await Promise.all([
      supabaseAdmin.from('companies').select('id, name, industry, sub_industry, city, type_label, tags, segment, completeness_score').limit(50000),
      supabaseAdmin.from('company_products').select('company_id, category, tech_keywords').eq('if_delete', false).limit(100000),
      supabaseAdmin.from('company_executives').select('company_id, name').eq('if_delete', false).limit(100000),
      supabaseAdmin.from('company_financings').select('company_id, finance_enterprise').eq('if_delete', false).limit(100000),
    ]);
    const related = computeRelated(id, {
      companies: companies.data || [], products: products.data || [], executives: executives.data || [], financings: financings.data || [],
    });
    return NextResponse.json({ success: true, related });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
