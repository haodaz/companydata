import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError, loadSpace } from '@/lib/skill-lab-server';
import { INVITE_DAYS, signInvite } from '@/lib/lab-invite';

export const runtime = 'nodejs';

/**
 * 体验百业里点「你教我」（2026-10-12「专家数采」第 3 步）：
 * 记一笔进修改留痕（lab_edits，source = practitioner；身份可选填），然后发一张这个空间的邀请票，
 * 直接进「你教我」走一遍——之后照样过示范评审（守红线、达目标……），身份不直接等于可信。
 * 不要登录；同一个 IP 每小时最多 5 次，防刷模型成本。
 */
const hits = new Map<string, number[]>();
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
    const now = Date.now(); const recent = (hits.get(ip) || []).filter(t => now - t < 3600_000);
    if (recent.length >= 5) return NextResponse.json({ ok: false, error: '提交太频繁了，过一会儿再来' }, { status: 429 });
    const b = await req.json().catch(() => ({}));
    // 身份可以不填（点「你教我」直接进来）；填了就记下，评审时一起看
    const name = String(b.name || '').trim().slice(0, 30) || '访客从业者', org = String(b.org || '').trim().slice(0, 60), cert = String(b.cert || '').trim().slice(0, 80);
    const years = Math.round(Number(b.years)) || null;
    await loadSpace(id);
    hits.set(ip, [...recent, now]);
    const app = { name, years, org, cert, note: String(b.note || '').slice(0, 300), at: new Date().toISOString() };
    await supabaseAdmin.from('lab_edits').insert({ task_id: id, source: 'practitioner', actor: `self:${name}`, fields: ['apply'], after: app, note: `从业者进来示范：${name}${years ? ` · ${years} 年` : ''}${org || cert ? ` · ${org || cert}` : ''}` }).then(() => {}, () => {});
    const { token, expiresAt } = await signInvite(id, `self:${name}`);
    return NextResponse.json({ ok: true, path: `/lab/${id}?invite=${encodeURIComponent(token)}`, expiresAt, days: INVITE_DAYS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
