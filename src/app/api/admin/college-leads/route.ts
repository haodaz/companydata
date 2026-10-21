/**
 * AI 大学申请线索（迁移 045）：内部同事看、改跟进状态和备注（要登录）。
 *   GET  ?kind=enroll|hire&status=new  → 最近 300 条
 *   PATCH { id, status?, note? }
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';

async function staff(req: Request) {
  const u = await getSessionUser(req);
  return u;
}

export async function GET(req: Request) {
  if (!(await staff(req))) return NextResponse.json({ ok: false, error: '没有权限' }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  let q = supabaseAdmin.from('college_applications').select('*').order('created_at', { ascending: false }).limit(300);
  if (sp.get('kind')) q = q.eq('kind', sp.get('kind')!);
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: /college_applications/.test(error.message) ? '迁移 045 还没执行' : error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: Request) {
  if (!(await staff(req))) return NextResponse.json({ ok: false, error: '没有权限' }, { status: 403 });
  const { id, status, note } = await req.json();
  if (!id) return NextResponse.json({ ok: false, error: '缺 id' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status && ['new', 'contacted', 'won', 'closed'].includes(status)) patch.status = status;
  if (typeof note === 'string') patch.note = note.slice(0, 2000);
  const { error } = await supabaseAdmin.from('college_applications').update(patch).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
