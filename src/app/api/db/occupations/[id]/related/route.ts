import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { orIlike, pageParams } from '@/lib/pg-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** 这个职业的名字 / 别名（≥2 字），岗位名里出现任何一个就算对应岗位 */
async function namesOf(id: number): Promise<string[] | null> {
  const { data: o } = await supabaseAdmin.from('occupations').select('name, name_lang_cn, aliases').eq('id', id).single();
  if (!o) return null;
  return Array.from(new Set([o.name, o.name_lang_cn, ...(o.aliases || [])].filter((n: any) => n && String(n).trim().length >= 2).map((n: string) => n.trim()))).slice(0, 12);
}

/**
 * 职业 ↔ 岗位 / 企业：
 *   kind=jobs       分页列出对应岗位（status / jobType 可筛）
 *   kind=companies  按企业汇总：在招岗位数、岗位总数、城市，按在招数排「热门公司」
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const id = parseInt((await ctx.params).id);
    const names = await namesOf(id);
    if (!names) return NextResponse.json({ success: false, error: '职业不存在' }, { status: 404 });
    if (!names.length) return NextResponse.json({ success: true, data: [], total: 0, names });
    const { searchParams } = new URL(req.url);
    const match = names.map(n => orIlike(['name'], n)).join(',');
    const kind = searchParams.get('kind') || 'jobs';

    if (kind === 'companies') {
      const { data: rows, error } = await selectAll(() => supabaseAdmin.from('jobs').select('id, company_id, institute_or_company_name, status, city, location').not('if_delete', 'is', true).or(match).order('id'));
      if (error) throw error;
      const by = new Map<string, { company_id: number | null; name: string; open: number; total: number; cities: Map<string, number> }>();
      for (const j of rows) {
        const k = j.company_id ? `c${j.company_id}` : `n${j.institute_or_company_name}`;
        const g = by.get(k) || { company_id: j.company_id, name: j.institute_or_company_name || '', open: 0, total: 0, cities: new Map() };
        g.total++; if (j.status === 'open') g.open++;
        const c = (j.city || j.location || '').trim(); if (c) g.cities.set(c, (g.cities.get(c) || 0) + 1);
        by.set(k, g);
      }
      const list = Array.from(by.values()).sort((a, b) => b.open - a.open || b.total - a.total).slice(0, 60);
      const ids = list.map(g => g.company_id).filter(Boolean) as number[];
      const { data: cs } = ids.length ? await supabaseAdmin.from('companies').select('id, name, name_en, registered_name, logo_url, segment, industry, city, company_scale').in('id', ids) : { data: [] as any[] };
      const cmap = new Map((cs || []).map((c: any) => [c.id, c]));
      return NextResponse.json({
        success: true, names, total_jobs: rows.length, total: by.size,
        data: list.map(g => ({ ...g, cities: Array.from(g.cities).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c), company: g.company_id ? cmap.get(g.company_id) || null : null })),
      });
    }

    const { page, pageSize, from, to } = pageParams(searchParams, 20);
    let q = supabaseAdmin.from('jobs').select('id, name, institute_or_company_name, company_id, location, job_type, status, source, official_publish_date, application_end_date_str, link, internship_salary_min, internship_salary_max, salary_unit, salary_currency, company_ref:companies(id, name, logo_url, segment)', { count: 'exact' })
      .not('if_delete', 'is', true).or(match);
    if (searchParams.get('status')) q = q.eq('status', searchParams.get('status'));
    if (searchParams.get('jobType')) q = q.in('job_type', searchParams.get('jobType')!.split(','));
    const { data, count, error } = await q.order('updated_at', { ascending: false }).range(from, to);
    if (error) throw error;
    return NextResponse.json({ success: true, names, data: data || [], total: count || 0, page, pageSize });
  } catch (e: any) {
    console.error('[OccupationRelated]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
