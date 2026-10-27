import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';

/** 外部模拟参照（迁移 051）：Forage 等平台公开职业模拟的外层（谁家、什么岗位、干什么、练什么、评价、任务结构）。GET 列表 + 统计 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || user.role !== 'admin') return NextResponse.json({ ok: false, error: '需要管理员' }, { status: 403 });
  const sp = req.nextUrl.searchParams; const q = sp.get('q') || ''; const career = sp.get('career') || ''; const difficulty = sp.get('difficulty') || '';
  let qb = db.from('work_external_simulations').select('*').order('rating', { ascending: false, nullsFirst: false }).order('title').limit(1000);
  if (q) qb = qb.or(`title.ilike.%${q}%,company_name.ilike.%${q}%,tagline.ilike.%${q}%`);
  if (career) qb = qb.contains('career_areas', [career]);
  if (difficulty) qb = qb.eq('difficulty', difficulty);
  const { data, error } = await qb;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const { data: all } = await db.from('work_external_simulations').select('company_name, company_id, career_areas, difficulty, rating, task_structure');
  const careers: Record<string, number> = {};
  for (const r of all || []) for (const c of r.career_areas || []) careers[c] = (careers[c] || 0) + 1;
  const rated = (all || []).filter(r => r.rating != null);
  const stats = {
    total: (all || []).length,
    companies: new Set((all || []).map(r => r.company_name)).size,
    linked: new Set((all || []).filter(r => r.company_id).map(r => r.company_id)).size,
    careers: Object.keys(careers).length,
    rating: rated.length ? +(rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length).toFixed(2) : null,
    tasks: (all || []).reduce((s, r) => s + (r.task_structure || []).filter((t: any) => t.type === 'normal').length, 0),
  };
  return NextResponse.json({ ok: true, data, stats, careers });
}
