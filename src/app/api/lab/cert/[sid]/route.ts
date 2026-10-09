import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { certData } from '@/lib/lab-cert-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ sid: string }> };
const ids = (req: NextRequest) => (req.nextUrl.searchParams.get('v') || '').split(',').filter(Boolean);

/** 证书 + 成绩单（公开：链接就是验证方式）。?v= 带上访客编号，会告诉你这是不是你的（能改名字） */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { sid } = await params;
    const { mine, visitor_id: _v, ...d } = await certData(sid);
    return NextResponse.json({ ok: true, cert: { ...d, mine: mine(ids(req)) } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 404 });
  }
}

/** 改证书上的名字：只有作答的本人（访客编号对得上）能改 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { sid } = await params;
    const b = await req.json().catch(() => ({}));
    const name = String(b.name || '').trim().slice(0, 30);
    if (!name) return NextResponse.json({ ok: false, error: '名字不能空' }, { status: 400 });
    const { data: sub } = await supabaseAdmin.from('skill_submissions').select('visitor_id, candidate_type').eq('id', sid).single();
    const v = String(b.v || '').split(',').filter(Boolean);
    if (!sub?.visitor_id || !v.includes(sub.visitor_id)) return NextResponse.json({ ok: false, error: '只有本人能改' }, { status: 403 });
    await supabaseAdmin.from('skill_submissions').update({ candidate_name: name }).eq('id', sid);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
