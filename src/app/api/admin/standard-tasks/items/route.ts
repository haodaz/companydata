import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { STANDARD_DOC_TYPE_LABELS, STANDARD_KIND_LABELS } from '@/lib/standard-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 往任务里加检索条目：{ taskId, items: [{ query, profession, industry, spaceId, kinds, docTypes, count, enrich }] }
 * 同一任务里「职业 + 主题」相同的只加一次。
 */
export async function POST(request: Request) {
  try {
    const { taskId, items } = await request.json();
    if (!taskId || !Array.isArray(items) || !items.length) return NextResponse.json({ ok: false, error: 'Missing taskId or items' }, { status: 400 });
    const { data: existing } = await supabaseAdmin.from('standard_searches').select('query, profession').eq('task_id', taskId);
    const have = new Set((existing || []).map(r => `${(r.profession || '').toLowerCase()}|${(r.query || '').toLowerCase()}`));
    const rows: any[] = []; let skipped = 0;
    for (const it of items) {
      const query = String(it.query || '').trim(), profession = String(it.profession || '').trim() || null;
      if (!query && !profession) { skipped++; continue; }
      const key = `${(profession || '').toLowerCase()}|${query.toLowerCase()}`;
      if (have.has(key)) { skipped++; continue; }
      have.add(key);
      rows.push({
        task_id: taskId, query, profession, industry: String(it.industry || '').trim() || null, space_id: /^[0-9a-f-]{36}$/i.test(String(it.spaceId || '')) ? it.spaceId : null,
        kinds: (Array.isArray(it.kinds) ? it.kinds : []).filter((k: string) => k in STANDARD_KIND_LABELS),
        doc_types: (Array.isArray(it.docTypes) ? it.docTypes : []).filter((k: string) => k in STANDARD_DOC_TYPE_LABELS),
        count: Math.min(20, Math.max(3, parseInt(it.count) || 10)), enrich: it.enrich !== false, status: 'pending',
      });
    }
    if (rows.length) { const { error } = await supabaseAdmin.from('standard_searches').insert(rows); if (error) throw error; }
    return NextResponse.json({ ok: true, added: rows.length, skipped });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });
    const { error } = await supabaseAdmin.from('standard_searches').delete().eq('id', parseInt(id));
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
