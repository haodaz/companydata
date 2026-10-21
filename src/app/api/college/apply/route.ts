/**
 * AI 大学申请：申请模型入学（kind=enroll）/ 人才培养需求（kind=hire）。不用登录——能收集到客户就行。
 * 提交了就存成一条线索（college_applications，迁移 045），平方的同事按留下的联系方式跟进（/admin/college-leads）；这里不直接训练。
 * 已登录的同事顺手提交时，记上账号。防刷：隐藏陷阱字段 website 有值就假装成功；同一 IP 10 分钟最多 5 份。
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';

const clip = (v: unknown, n = 4000) => String(v ?? '').trim().slice(0, n);
// 表单里可能有人顺手贴了密钥：存之前抹掉长得像 key 的串（我们不收密钥）
const scrub = (s: string) => s.replace(/\b(sk|ak|key|token)[-_][A-Za-z0-9_\-]{12,}\b/gi, '[已抹去]').replace(/\b[A-Za-z0-9]{40,}\b/g, '[已抹去]');

// 按 IP 限频（单实例内存；够挡住随手刷，不求严格）
const hits = new Map<string, number[]>();
const WINDOW = 10 * 60 * 1000, MAX = 5;
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  if (arr.length >= MAX) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, ts] of hits) if (!ts.some(t => now - t < WINDOW)) hits.delete(k);
  return false;
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (clip(b.website)) return NextResponse.json({ ok: true });   // 陷阱字段被填了：多半是机器人，不入库
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
    if (limited(ip)) return NextResponse.json({ ok: false, error: '提交太频繁了，过几分钟再试' }, { status: 429 });

    const kind = b.kind === 'hire' ? 'hire' : b.kind === 'enroll' ? 'enroll' : null;
    if (!kind) return NextResponse.json({ ok: false, error: '申请类型不对' }, { status: 400 });
    const f = (b.fields || {}) as Record<string, unknown>;
    const org = clip(f.org, 200), contact = clip(f.contact, 100), phone = clip(f.phone, 100);
    // 人才培养需求：岗位名可以不填（客户多半说不出职业名），用自然语言描述的头一句当标题
    const title = clip(f.title, 200) || clip(String(f.jd || f.target || '').replace(/\s+/g, ' '), 40);
    const email = clip(f.email, 200).toLowerCase();
    if (!org || !contact || !phone || !title) return NextResponse.json({ ok: false, error: '带 * 的几项要填' }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, error: '邮箱格式不对' }, { status: 400 });
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (!['org', 'contact', 'phone', 'title', 'email'].includes(k)) payload[k] = scrub(clip(v));

    const user = await getSessionUser(req).catch(() => null);
    const { data, error } = await supabaseAdmin.from('college_applications').insert({
      kind, user_id: user?.userId || null, email: email || user?.email || null, org, contact, phone, title, payload, source: clip(b.source, 200) || null,
    }).select('id').single();
    if (error) {
      if (/college_applications/.test(error.message)) return NextResponse.json({ ok: false, error: '申请表还没建好（迁移 045 待执行），请稍后再试' }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
