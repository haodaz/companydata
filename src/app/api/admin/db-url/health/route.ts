import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { checkUrl } from '@/lib/agents/url-checker';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** URL 健康检查（纯 HTTP，不耗 Token）：传 ids，逐批检查并写回 health_status */
export async function POST(request: Request) {
  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: false, error: 'Missing ids' }, { status: 400 });

    const { data: rows, error } = await supabaseAdmin.from('url_sources').select('id, url').in('id', ids.slice(0, 200));
    if (error) throw error;

    const summary = { alive: 0, redirect: 0, dead: 0 };
    const CONCURRENCY = 8;
    for (let i = 0; i < (rows || []).length; i += CONCURRENCY) {
      await Promise.all(rows!.slice(i, i + CONCURRENCY).map(async row => {
        const result = await checkUrl(row.url);
        summary[result.status]++;
        await supabaseAdmin.from('url_sources').update({
          health_status: result.status,
          url_health: result,
          last_checked_at: new Date().toISOString(),
        }).eq('id', row.id);
      }));
    }

    return NextResponse.json({ ok: true, checked: rows?.length || 0, summary });
  } catch (error: any) {
    console.error('[DbUrl/health]', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
