import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createOrg, getOrg, orgFor, editionOf } from '@/lib/ws/org';

export const runtime = 'nodejs';

/** 我的企业：GET → { org | null }；POST { name, company_id?, company_name? } → 建企业并把自己设为 owner（一个账号先只认一家） */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try { return NextResponse.json({ ok: true, org: await orgFor(req, user), user: { email: user.email, role: user.role } }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try {
    const b = await req.json().catch(() => ({}));
    const kind = b.kind === 'research' ? 'research' : 'company';
    if (await getOrg(user, null, kind)) return NextResponse.json({ ok: false, error: kind === 'research' ? '这个账号在科研版已经有一个机构了' : '这个账号在企业版已经绑定了一家企业' }, { status: 400 });
    return NextResponse.json({ ok: true, org: await createOrg(user, { name: b.name, company_id: b.company_id ? Number(b.company_id) : null, company_name: b.company_name, website: b.website || null, kind }) });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
