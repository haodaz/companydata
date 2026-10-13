import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 标准检索记录：?id= 单条（含 raw 层：候选、官方页原文、AI 摘要、流水） */
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('standard_searches').select('*').eq('id', parseInt(id)).single();
    if (error) throw error;
    return NextResponse.json({ ok: true, search: data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
