import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser, requireAdminUser } from '@/lib/session';
import { invalidatePriceCache } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 价目表（记账用）：登录就能看，管理员能改 */
export async function GET(req: Request) {
  if (!(await getSessionUser(req))) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const { data, error } = await supabaseAdmin.from('model_pricing').select('*').order('provider').order('model_id');
  if (error) return NextResponse.json({ ok: false, error: error.message, needMigration: /model_pricing/.test(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true, pricing: data || [] });
}

/** 改一行：{ model_id, provider?, currency, input_per_m, output_per_m, search_per_k, note? } */
export async function PUT(req: Request) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (!b.model_id) return NextResponse.json({ ok: false, error: '缺少 model_id' }, { status: 400 });
  const num = (v: any) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const row = {
    model_id: String(b.model_id).trim(), provider: b.provider || null, currency: b.currency === 'CNY' ? 'CNY' : 'USD',
    input_per_m: num(b.input_per_m), output_per_m: num(b.output_per_m), search_per_k: num(b.search_per_k),
    note: b.note ?? null, updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from('model_pricing').upsert(row, { onConflict: 'model_id' });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  invalidatePriceCache();
  return NextResponse.json({ ok: true });
}
