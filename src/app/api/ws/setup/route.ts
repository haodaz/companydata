import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { getOrg } from '@/lib/ws/org';
import { enrichCompany, loadSetup, saveContext, PUBLIC_FIELDS, PRIVATE_FIELDS, ROLE_NOTES } from '@/lib/ws/setup';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function ctx(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return { err: NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 }) };
  const org = await getOrg(user, req.nextUrl.searchParams.get('org')).catch(() => null);
  if (!org) return { err: NextResponse.json({ ok: false, error: '没有企业' }, { status: 404 }) };
  return { user, org };
}
/** 设置向导的数据：平方公开画像 / 内部信息 / 岗位库 / 已管理岗位 / 回流记录，外加字段定义 */
export async function GET(req: NextRequest) {
  const c = await ctx(req); if (c.err) return c.err;
  try { return NextResponse.json({ ok: true, ...(await loadSetup(c.org as any)), fields: { public: PUBLIC_FIELDS, private: PRIVATE_FIELDS, role: ROLE_NOTES } }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
/** 保存企业情况：{ public, private }；公开的回流平方（空的直接填、不同的进待审核），内部的只存工作台 */
export async function PATCH(req: NextRequest) {
  const c = await ctx(req); if (c.err) return c.err;
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json({ ok: true, ...(await saveContext(c.org!, c.user!.email, b.public || {}, b.private || {})) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
/** { action: 'enrich' } AI 联网补画像（只填空）；{ action: 'step', step } 记向导走到哪 */
export async function POST(req: NextRequest) {
  const c = await ctx(req); if (c.err) return c.err;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === 'enrich') { if (!c.org!.company_id) throw new Error('没有对应的平方企业'); return NextResponse.json({ ok: true, filled: await enrichCompany(c.org!.company_id) }); }
    if (b.action === 'step' && ['company', 'context', 'roles', 'done'].includes(b.step)) { await db.from('ws_orgs').update({ setup_step: b.step }).eq('id', c.org!.id); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ ok: false, error: '不认识的操作' }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
