import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { LAB_GUEST } from '@/lib/lab-guest';

export const runtime = 'nodejs';

/**
 * 给自家数字职人起的名字（迁移 028），只给本人看。
 * 访客身份：登录用户以服务端会话为准（u:<id>）；游客用浏览器里的随机编号（v:…）。客户端传来的 u: 一律不认，防止读别人的。
 */
async function visitorsOf(req: Request, clientIds: string[]) {
  const ids = clientIds.filter(v => /^v:[\w-]{8,}$/.test(v));
  const user = req.headers.get(LAB_GUEST) ? null : await getSessionUser(req).catch(() => null);
  if (user?.userId) ids.unshift(`u:${user.userId}`);
  return ids;
}

/** GET ?v=v:xxx → { map: { spaceId: nickname } }（登录用户的优先于游客编号下的） */
export async function GET(req: Request) {
  const ids = await visitorsOf(req, (new URL(req.url).searchParams.get('v') || '').split(',').filter(Boolean));
  if (!ids.length) return NextResponse.json({ success: true, map: {} });
  const { data } = await supabaseAdmin.from('lab_nicknames').select('space_id, visitor, nickname').in('visitor', ids);
  const map: Record<string, string> = {};
  for (const id of [...ids].reverse()) for (const r of (data || []).filter(r => r.visitor === id)) map[r.space_id] = r.nickname;
  return NextResponse.json({ success: true, map });
}

/** PUT { spaceId, nickname, visitors } ：登录了记在账号下，没登录记在游客编号下；nickname 为空 = 删掉 */
export async function PUT(req: Request) {
  try {
    const { spaceId, nickname, visitors = [] } = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(spaceId || ''))) return NextResponse.json({ success: false, error: '空间不对' }, { status: 400 });
    const ids = await visitorsOf(req, Array.isArray(visitors) ? visitors : []);
    const me = ids[0];
    if (!me) return NextResponse.json({ success: false, error: '浏览器不让存（无痕模式？），登录后就能起名字' }, { status: 400 });
    const name = String(nickname || '').trim().slice(0, 16);
    if (!name) { await supabaseAdmin.from('lab_nicknames').delete().eq('space_id', spaceId).in('visitor', ids); return NextResponse.json({ success: true, nickname: null }); }
    const { error } = await supabaseAdmin.from('lab_nicknames').upsert({ space_id: spaceId, visitor: me, nickname: name, updated_at: new Date().toISOString() }, { onConflict: 'space_id,visitor' });
    if (error) throw error;
    return NextResponse.json({ success: true, nickname: name });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
