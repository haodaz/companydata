import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { OCCUPATION_EDITABLE_KEYS, computeOccupationCompleteness, sanitizeOccupation, SALARY_YEARS } from '@/lib/occupation-fields';
import { refreshCompleteness, upsertSalaries } from '@/lib/occupation-store';
import { orIlike } from '@/lib/pg-filter';
import { linksOf } from '@/lib/entity-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * 职业详情 + 分年限薪资 + 数据底色关联（按职业名 / 别名匹配，只读）：
 *   岗位库里叫这个名字的在招岗位、百业空间、行业标准（professions 里写了这个职业）。
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const id = parseInt((await ctx.params).id);
    const { data: o, error } = await supabaseAdmin.from('occupations').select('*').eq('id', id).single();
    if (error || !o) return NextResponse.json({ success: false, error: '职业不存在' }, { status: 404 });
    const names = Array.from(new Set([o.name, o.name_lang_cn, ...(o.aliases || [])].filter((n: any) => n && String(n).length >= 2))).slice(0, 8) as string[];

    const nextNames: string[] = (o.career_map?.next_roles || []).map((r: any) => r.name).filter(Boolean);
    const [salaries, jobs, spaces, standards, regions, linked] = await Promise.all([
      supabaseAdmin.from('occupation_salaries').select('*').eq('occupation_id', id).eq('if_delete', false),
      names.length
        ? supabaseAdmin.from('jobs').select('id, name, institute_or_company_name, location, job_type, status, company_id', { count: 'exact' })
            .not('if_delete', 'is', true).or(orIlike(['name'], names[0]) + (names.length > 1 ? ',' + names.slice(1).map(n => orIlike(['name'], n)).join(',') : '')).order('updated_at', { ascending: false }).limit(12)
        : Promise.resolve({ data: [], count: 0 } as any),
      names.length
        ? supabaseAdmin.from('skill_tasks').select('id, title, created_at').or(names.map(n => orIlike(['title'], n)).join(',')).order('created_at', { ascending: false }).limit(12)
        : Promise.resolve({ data: [] } as any),
      names.length
        ? supabaseAdmin.from('industry_standards').select('id, code, title, kind, status').overlaps('professions', names).limit(12)
        : Promise.resolve({ data: [] } as any),
      supabaseAdmin.from('occupation_region_salaries').select('*').eq('occupation_id', id).eq('if_delete', false),
      // 图谱里「更资深 / 可转型」的岗位名 → 职业库里的职业（名称或别名命中），前端做成可点的链接
      nextNames.length
        ? supabaseAdmin.from('occupations').select('id, name, aliases').eq('if_delete', false).or(`name.in.(${nextNames.map(n => JSON.stringify(n)).join(',')}),aliases.ov.{${nextNames.map(n => JSON.stringify(n)).join(',')}}`)
        : Promise.resolve({ data: [] } as any),
    ]);
    const roleLinks: Record<string, number> = {};
    for (const n of nextNames) { const hit = (linked.data || []).find((x: any) => x.name === n || (x.aliases || []).includes(n)); if (hit) roleLinks[n] = hit.id; }
    const order = (y: string) => SALARY_YEARS.indexOf(y);
    return NextResponse.json({
      success: true, occupation: o,
      salaries: (salaries.data || []).sort((a: any, b: any) => order(a.year) - order(b.year)),
      regions: regions.data || [], roleLinks,
      links: await linksOf('occupation', id).catch(() => []),
      tasks: await (async () => {
        const { data: ts } = await supabaseAdmin.from('typical_tasks').select('*').eq('occupation_id', id).eq('if_delete', false).order('difficulty', { ascending: true, nullsFirst: false }).order('id');
        if (!ts?.length) return [];
        const { data: ls } = await supabaseAdmin.from('entity_links').select('from_id, to_id').eq('from_type', 'task').eq('to_type', 'station').eq('if_delete', false).in('from_id', ts.map(t => t.id));
        const sids = Array.from(new Set((ls || []).map(l => l.to_id)));
        const { data: st } = sids.length ? await supabaseAdmin.from('work_stations').select('id, name, lab_bench').in('id', sids) : { data: [] as any[] };
        const labIds = Array.from(new Set(ts.flatMap(t => t.lab_task_ids || [])));
        const { data: sp } = labIds.length ? await supabaseAdmin.from('skill_tasks').select('id, title').in('id', labIds) : { data: [] as any[] };
        return ts.map(t => ({ ...t, station: (st || []).find(s => s.id === (ls || []).find(l => l.from_id === t.id)?.to_id) || null, spaces: (sp || []).filter(s => (t.lab_task_ids || []).includes(s.id)) }));
      })().catch(() => []),
      related: { jobs: jobs.data || [], jobs_total: jobs.count || 0, spaces: spaces.data || [], standards: standards.data || [] },
    });
  } catch (e: any) {
    console.error('[Occupation] GET', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/** 人工编辑：改到的字段加入 human_locked_fields（AI 不再覆盖）；unlock 解锁；salaries 覆盖同档；也可改审核状态 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = parseInt((await ctx.params).id);
    const body = await req.json();
    const { data: o, error } = await supabaseAdmin.from('occupations').select('*').eq('id', id).single();
    if (error || !o) return NextResponse.json({ success: false, error: '职业不存在' }, { status: 404 });
    const patch: Record<string, any> = {};
    const fields = sanitizeOccupation(Object.fromEntries(Object.entries(body).filter(([k]) => OCCUPATION_EDITABLE_KEYS.includes(k))));
    const locked = new Set<string>(o.human_locked_fields || []);
    for (const [k, v] of Object.entries(fields)) {
      if (JSON.stringify(o[k] ?? null) === JSON.stringify(v ?? null)) continue;
      patch[k] = v; locked.add(k);
    }
    if (typeof body.external_id === 'string') patch.external_id = body.external_id.trim() || null;
    for (const k of Array.isArray(body.unlock) ? body.unlock : []) locked.delete(k);
    patch.human_locked_fields = Array.from(locked);
    if (body.human_review_status !== undefined) { patch.human_review_status = body.human_review_status; patch.human_review_at = new Date().toISOString(); }
    if (body.human_review_note !== undefined) patch.human_review_note = body.human_review_note;
    patch.completeness_score = computeOccupationCompleteness({ ...o, ...patch });
    patch.updated_at = new Date().toISOString();
    const { error: e2 } = await supabaseAdmin.from('occupations').update(patch).eq('id', id);
    if (e2) throw e2;
    if (Array.isArray(body.salaries)) {
      await upsertSalaries(id, body.salaries, 'overwrite');
      const cleared = body.salaries.filter((s: any) => SALARY_YEARS.includes(s.year) && !(Number(s.salary) > 0)).map((s: any) => s.year);
      if (cleared.length) await supabaseAdmin.from('occupation_salaries').update({ if_delete: true }).eq('occupation_id', id).in('year', cleared);
      await refreshCompleteness(id);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[Occupation] PATCH', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/** 软删（if_delete = true，导出 / 列表默认排除） */
export async function DELETE(_req: Request, ctx: Ctx) {
  const id = parseInt((await ctx.params).id);
  const { error } = await supabaseAdmin.from('occupations').update({ if_delete: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
