import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveOrCreateCompany } from '@/lib/company-match';

export const runtime = 'nodejs';

const FILLABLE = ['name_en', 'segment', 'industry', 'country', 'official_website', 'jv_partners'];

/** 取得企业库 id：没有就建档；Scout 名单带来的基础字段只填空 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

    const id = await resolveOrCreateCompany(name);
    if (!id) throw new Error('企业建档失败');

    const { data: company } = await supabaseAdmin.from('companies').select('*').eq('id', id).single();
    const updates: Record<string, any> = {};
    for (const k of FILLABLE) if (body[k] && company && (company[k] === null || company[k] === '')) updates[k] = body[k];
    if (Object.keys(updates).length) await supabaseAdmin.from('companies').update(updates).eq('id', id);

    return NextResponse.json({ id, name: company?.name || name, profiled: !!company?.profile_updated_at });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
