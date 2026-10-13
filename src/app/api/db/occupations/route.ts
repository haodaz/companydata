import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { orIlike, pageParams } from '@/lib/pg-filter';
import { requireDownload } from '@/lib/download-permission';
import { upsertOccupation, upsertSalaries } from '@/lib/occupation-store';
import { SALARY_YEARS } from '@/lib/occupation-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 职业实体库列表：search / category / mid / review / sort（hot | salary | updated）/ withStats / exportAll。
 * 导出时带上各档薪资（salary_year_0_2 …），和数据部门的子实体表对得上。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const get = (k: string) => searchParams.get(k) || '';
    const exportAll = get('exportAll') === 'true';
    if (exportAll) { const denied = await requireDownload(request); if (denied) return denied; }
    const { page, pageSize, from, to } = pageParams(searchParams, 50);

    const build = () => {
      let q = supabaseAdmin.from('occupations').select('*', { count: 'exact' }).eq('if_delete', false);
      const s = get('search').trim();
      if (s) q = q.or(`${orIlike(['name', 'name_lang_en', 'key', 'intro', 'relevant_certificates'], s)},aliases.cs.${JSON.stringify([s]).replace(/^\[/, '{').replace(/\]$/, '}')}`);
      if (get('category')) q = q.eq('career_category', get('category'));
      if (get('mid')) q = q.eq('career_mid_category', get('mid'));
      if (get('review') === 'none') q = q.is('human_review_status', null);
      else if (get('review')) q = q.eq('human_review_status', get('review'));
      const sort = get('sort') || 'hot';
      if (sort === 'salary') q = q.order('recent_year_monthly_salary', { ascending: false, nullsFirst: false });
      else if (sort === 'updated') q = q.order('updated_at', { ascending: false });
      else q = q.order('hot_career', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
      return q.order('id', { ascending: true });
    };

    const { data, count, error } = exportAll
      ? await selectAll(build).then(r => ({ ...r, count: r.data.length }))
      : await build().range(from, to);
    if (error) throw error;
    const rows: any[] = data || [];

    // 列表 / 导出都带上分年限薪资
    const ids = rows.map(r => r.id);
    if (ids.length) {
      const sal: any[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const { data: part } = await supabaseAdmin.from('occupation_salaries').select('occupation_id, year, salary').in('occupation_id', ids.slice(i, i + 500)).eq('if_delete', false);
        sal.push(...(part || []));
      }
      const by = new Map<number, Record<string, number>>();
      for (const s of sal) by.set(s.occupation_id, { ...(by.get(s.occupation_id) || {}), [s.year]: s.salary });
      for (const r of rows) { r.salaries = by.get(r.id) || {}; for (const y of SALARY_YEARS) r[`salary_${y}`] = r.salaries[y] ?? null; }
    }

    let stats: Record<string, number> | undefined;
    let categories: Record<string, number> | undefined;
    if (get('withStats') === '1') {
      const { data: all } = await selectAll(() => supabaseAdmin.from('occupations').select('id, career_category, recent_year_monthly_salary, human_review_status, source, completeness_score').eq('if_delete', false).order('id'));
      const { data: salAll } = await selectAll(() => supabaseAdmin.from('occupation_salaries').select('occupation_id').eq('if_delete', false).order('id'));
      const withSal = new Set((salAll || []).map((s: any) => s.occupation_id));
      stats = { total: 0, reviewed: 0, with_salary: 0, imported: 0, ai: 0, avg_completeness: 0 };
      categories = {};
      let comp = 0;
      for (const r of all || []) {
        stats.total++;
        if (r.human_review_status === 'complete') stats.reviewed++;
        if (withSal.has(r.id)) stats.with_salary++;
        if (r.source === 'import') stats.imported++;
        if (r.source === 'ai') stats.ai++;
        comp += r.completeness_score || 0;
        const c = r.career_category || 'none';
        categories[c] = (categories[c] || 0) + 1;
      }
      stats.avg_completeness = stats.total ? Math.round(comp / stats.total) : 0;
    }
    return NextResponse.json({ success: true, data: rows, total: count || 0, page, pageSize, stats, categories });
  } catch (e: any) {
    console.error('[Occupations] GET', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * 新建 / 导入：
 *   { rows: [...], mode: 'import' }  数据部门的表（表头「中文名(key)」已在前端解析成 key），以对方为准覆盖；行里 salaries 可带分年限薪资
 *   { name }                         手工新建一条空职业
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (Array.isArray(body.rows)) {
      let created = 0, updated = 0;
      const errors: string[] = [];
      for (const row of body.rows.slice(0, 2000)) {
        try {
          const r = await upsertOccupation(row, { mode: 'overwrite', source: 'import' });
          if (r.created) created++; else if (r.changed.length) updated++;
          if (Array.isArray(row.salaries)) await upsertSalaries(r.id, row.salaries, 'overwrite');
        } catch (e: any) { errors.push(`${row.name || '?'}：${e.message}`); }
      }
      return NextResponse.json({ success: true, created, updated, errors });
    }
    if (!String(body.name || '').trim()) return NextResponse.json({ success: false, error: '缺职业名称' }, { status: 400 });
    const r = await upsertOccupation({ name: String(body.name).trim(), ...(body.fields || {}) }, { mode: 'fill', source: 'manual' });
    return NextResponse.json({ success: true, ...r });
  } catch (e: any) {
    console.error('[Occupations] POST', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/** 批量审核：{ ids, human_review_status } */
export async function PATCH(request: Request) {
  try {
    const { ids, human_review_status } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });
    const { error } = await supabaseAdmin.from('occupations').update({ human_review_status, human_review_at: new Date().toISOString() }).in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
