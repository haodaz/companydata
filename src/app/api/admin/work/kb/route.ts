import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { kbAssets, kbCompanies, kbDelete, kbRoles, kbSave } from '@/lib/work/kb';

export const runtime = 'nodejs';

/** 真活知识库（工作台 /work/ws/kb）：GET ?tab=company|role|asset；POST 存一条企业资料 / 岗位（work_kb）；DELETE ?id= 删自己存的 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const me = { email: user.email, role: user.role };
  const tab = new URL(req.url).searchParams.get('tab');
  try {
    if (tab === 'company') return NextResponse.json({ ok: true, items: await kbCompanies(me) });
    if (tab === 'role') return NextResponse.json({ ok: true, items: await kbRoles(me) });
    if (tab === 'asset') return NextResponse.json({ ok: true, items: await kbAssets(me) });
    return NextResponse.json({ ok: false, error: 'tab?' }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try { return NextResponse.json({ ok: true, row: await kbSave({ email: user.email, role: user.role }, await req.json()) }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }); }
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try { await kbDelete({ email: user.email, role: user.role }, new URL(req.url).searchParams.get('id') || ''); return NextResponse.json({ ok: true }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }); }
}
