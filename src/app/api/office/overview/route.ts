import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 虚拟工厂入口页的「库里现在有多少」：都是正式库的实数（软删的不算） */
export async function GET() {
  const cnt = async (t: string, f?: (q: any) => any) => {
    let q: any = supabaseAdmin.from(t).select('id', { count: 'exact', head: true });
    if (f) q = f(q);
    const { count } = await q;
    return count || 0;
  };
  try {
    const [companies, jobs, occupations, tasks, items, standards, competitions] = await Promise.all([
      cnt('companies', q => q.not('if_delete', 'is', true)), cnt('jobs', q => q.not('if_delete', 'is', true)), cnt('occupations', q => q.eq('if_delete', false)),
      cnt('typical_tasks', q => q.eq('if_delete', false)), cnt('work_items', q => q.eq('if_delete', false)), cnt('industry_standards'), cnt('competitions'),
    ].map(p => p.catch(() => 0)));
    return NextResponse.json({ ok: true, counts: { companies, jobs, occupations, tasks, items, standards, competitions } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
