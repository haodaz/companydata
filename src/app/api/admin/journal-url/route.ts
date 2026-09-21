import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { orIlike, pageParams } from '@/lib/pg-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, from, to } = pageParams(searchParams, 20);
    const search = searchParams.get('search') || '';
    const searchType = searchParams.get('searchType') || '';

    let query = supabaseAdmin.from('url_journal').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (search) query = query.or(orIlike(['company', 'unit'], search));
    if (searchType) query = query.eq('search_type', searchType);

    const { data: logs, count, error } = await query.range(from, to);
    if (error) throw error;
    return NextResponse.json({ ok: true, logs: logs || [], total: count || 0, page, pageSize });
  } catch (error: any) {
    console.error('[JournalUrl] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('url_journal').delete().eq('id', parseInt(id));
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
