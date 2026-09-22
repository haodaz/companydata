import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { findCompanyProfile } from '@/lib/agents/company-profile';
import { PROFILE_FIELDS } from '@/lib/company-fields';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** AI 补全企业画像：联网检索，默认只填空字段；overwrite = true 时覆盖已有值 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseInt((await params).id);
    const { model, overwrite } = await req.json().catch(() => ({}));

    const { data: company, error } = await supabaseAdmin.from('companies').select('*').eq('id', id).single();
    if (error) throw error;

    const profile = await findCompanyProfile(company.name, company.name_en || '', company.country || '', model || undefined);

    const updates: Record<string, any> = {};
    const filled: string[] = [];
    for (const f of PROFILE_FIELDS) {
      const v = (profile as any)[f];
      if (v === null || v === undefined) continue;
      const current = company[f];
      if (overwrite || current === null || current === undefined || current === '') {
        if (current !== v) { updates[f] = v; filled.push(f); }
      }
    }

    if (filled.length) {
      updates.profile_source = { ...(company.profile_source || {}), ...profile.sources };
      updates.profile_updated_at = new Date().toISOString();
      updates.updated_at = updates.profile_updated_at;
      const { error: upErr } = await supabaseAdmin.from('companies').update(updates).eq('id', id);
      if (upErr) throw upErr;
    }

    return NextResponse.json({ success: true, filled, profile });
  } catch (error: any) {
    console.error('[CompanyProfile]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
