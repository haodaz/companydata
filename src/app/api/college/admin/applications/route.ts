import { NextRequest } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { guard, fail, ok } from '../_guard';
import { admitApplication, APP_STATUS } from '@/lib/college-admin';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

/** 申请管理：GET ?kind=enroll|hire&status=  /  PATCH { id, status?, note? }  /  POST { id, action: 'admit' } 录取为学员 */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  const sp = req.nextUrl.searchParams;
  let q = db.from('college_applications').select('*').order('created_at', { ascending: false }).limit(300);
  if (sp.get('kind')) q = q.eq('kind', sp.get('kind')!);
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  const { data, error } = await q; if (error) return fail(error);
  // 带上：这份申请已经录取成了哪位学员 / 被哪些学籍当成培养目标
  const ids = (data || []).map(a => a.id);
  const [{ data: st }, { data: en }] = ids.length ? await Promise.all([db.from('college_students').select('id, name, application_id').in('application_id', ids), db.from('college_enrollments').select('id, status, demand_id').in('demand_id', ids)]) : [{ data: [] as any[] }, { data: [] as any[] }];
  return ok({ data: (data || []).map(a => ({ ...a, status_label: APP_STATUS[a.status] || a.status, student: (st || []).find((s: any) => s.application_id === a.id) || null, enrollments: (en || []).filter((e: any) => e.demand_id === a.id) })) });
}
export async function PATCH(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  const { id, status, note } = await req.json();
  if (!id) return fail('缺 id', 400);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status && APP_STATUS[status]) patch.status = status;
  if (typeof note === 'string') patch.note = note.slice(0, 2000);
  const { error } = await db.from('college_applications').update(patch).eq('id', id);
  return error ? fail(error) : ok({});
}
export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try {
    const b = await req.json();
    if (b.action === 'admit') return ok({ student: await admitApplication(String(b.id), g.user.email) });
    return fail('不认识的操作', 400);
  } catch (e) { return fail(e); }
}
