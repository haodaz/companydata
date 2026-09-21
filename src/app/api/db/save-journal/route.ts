import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveCompanyId } from '@/lib/company-match';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { company, unit, aiOverview, urls, searchQueries, searchType, model, companyId } = await req.json();
    if (!company) return NextResponse.json({ error: 'Missing company' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('url_journal')
      .insert([{
        company,
        company_id: companyId ?? await resolveCompanyId(company),
        unit: unit || null,
        search_type: searchType || null,
        status: 'success',
        ai_overview: aiOverview || '',
        raw_data: { urls: urls || [], searchQueries: searchQueries || [] },
        model_id: model || null,
      }])
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, journalId: data?.id });
  } catch (error: any) {
    console.error('Save Journal API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
