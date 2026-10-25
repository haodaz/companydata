import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { bankTask } from '@/lib/work/question-bank';

/** 题目资产库（迁移 049）：GET 列表 / 统计；PATCH 人工星级、是否参照、备注；POST 回填（把 work_tasks 全部沉淀一遍） */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== 'admin') return NextResponse.json({ ok: false, error: '需要管理员' }, { status: 403 });
  const sp = req.nextUrl.searchParams; const q = sp.get('q') || ''; const industry = sp.get('industry') || ''; const fn = sp.get('fn') || ''; const company = sp.get('company_id');
  let qb = db.from('work_question_bank').select('*').order('updated_at', { ascending: false }).limit(500);
  if (q) qb = qb.or(`title.ilike.%${q}%,company_name.ilike.%${q}%,role.ilike.%${q}%`);
  if (industry) qb = qb.eq('industry', industry); if (fn) qb = qb.eq('job_function', fn); if (company) qb = qb.eq('company_id', Number(company));
  const { data, error } = await qb;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const { data: all } = await db.from('work_question_bank').select('industry, job_function, rating, use_as_ref, signals');
  const cnt = (k: 'industry' | 'job_function') => { const m: Record<string, number> = {}; for (const r of all || []) { const v = r[k] || '（未归类）'; m[v] = (m[v] || 0) + 1; } return m; };
  const stats = { total: (all || []).length, rated: (all || []).filter(r => r.rating).length, good: (all || []).filter(r => (r.rating || 0) >= 4).length, off: (all || []).filter(r => !r.use_as_ref).length, done: (all || []).filter(r => (r.signals?.sessions || 0) > 0).length };
  return NextResponse.json({ ok: true, data, stats, industries: cnt('industry'), functions: cnt('job_function') });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== 'admin') return NextResponse.json({ ok: false, error: '需要管理员' }, { status: 403 });
  const body = await req.json();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.rating === null || (Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5)) patch.rating = body.rating;
  if (typeof body.use_as_ref === 'boolean') patch.use_as_ref = body.use_as_ref;
  if (typeof body.note === 'string') patch.note = body.note.slice(0, 2000);
  if (typeof body.job_function === 'string') patch.job_function = body.job_function.slice(0, 40) || null;
  const { error } = await db.from('work_question_bank').update(patch).eq('id', String(body.id));
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== 'admin') return NextResponse.json({ ok: false, error: '需要管理员' }, { status: 403 });
  const { data: ts } = await db.from('work_tasks').select('id').eq('if_delete', false).limit(2000).then(r => r.error ? db.from('work_tasks').select('id').limit(2000) : r);
  let n = 0; for (const t of ts || []) { if (await bankTask(t.id)) n++; }
  return NextResponse.json({ ok: true, banked: n });
}
