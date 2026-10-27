import { NextResponse } from 'next/server';
import { selectAll } from '@/lib/supabase-all';
import { supabaseAdmin } from '@/lib/supabase';
import { completenessOrder, filterCompleteness } from '@/lib/completeness-filter';
import { filterLink } from '@/lib/link-filter';
import { orIlike, pageParams } from '@/lib/pg-filter';
import { requireDownload } from '@/lib/download-permission';
import { trackDemand } from '@/lib/flywheel/signals';
import { SOURCE_ORDER } from '@/lib/source-tags';
import { cachedStats, countMany } from '@/lib/db-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const exportAll = searchParams.get('exportAll') === 'true';
    // 全量导出 = 下载数据：admin 或已获批准的用户才放行，放行时记下载日志
    if (exportAll) { const denied = await requireDownload(request); if (denied) return denied; }
    const { page, pageSize, from, to } = pageParams(searchParams, 50);
    const search = searchParams.get('search') || '';
    const get = (k: string) => searchParams.get(k) || '';

    if (page === 1 && !exportAll) trackDemand(request, [
      search && { source: 'admin_job_search', query: search },
      get('companyId') && { source: 'admin_job_company', company_id: parseInt(get('companyId')) || null, query: '' },
    ].filter(Boolean) as any);

    // 导出要翻页读全量，所以查询写成「每次新建」的函数
    const build = () => {
    let query = supabaseAdmin
      .from('jobs')
      .select('*, company_ref:companies(id, name, name_en, segment, industry)', { count: 'exact' });
    // 完整度排序 / 筛选（数据部门 10-26）：选了按完整度排就排在最前，其余照旧
    const co = completenessOrder(get('sort'));
    if (co) query = query.order(co.column, { ascending: co.ascending, nullsFirst: co.nullsFirst });
    query = query.order('updated_at', { ascending: false }).order('id', { ascending: false });
    if (get('comp')) query = filterCompleteness(query, get('comp'));
    if (get('link')) query = filterLink(query, get('link'));

    // 合并掉的重复岗位（if_delete）默认不出现：同一岗位前后两次抓取留下的旧那条
    if (get('deleted') !== '1') query = query.not('if_delete', 'is', true);
    if (search) query = query.or(orIlike(['name', 'title_cn', 'institute_or_company_name', 'program_name', 'location', 'department'], search));
    if (get('jobType')) query = query.in('job_type', get('jobType').split(','));
    if (get('season')) query = query.eq('recruit_season', get('season'));
    if (get('remote')) query = query.eq('remote_type', get('remote'));
    if (get('status')) query = query.eq('status', get('status'));
    if (get('overseas') === '1') query = query.eq('accepts_overseas_students', true);
    if (get('companyId')) query = query.eq('company_id', parseInt(get('companyId')));
    // 来源 / 发布日期（数据部门 10-13）：source=none 看未标来源；发布日期按 official_publish_date（YYYY-MM-DD 文本，字典序即时间序）
    // 来源多选（迁移 031 起是数组）：none = 没有来源；选了某个来源 = 来源里包含它
    // 采集标记（迁移 032）：仅列表信息 / 详情已补 / 重点岗位 / 支持内推码 / 数据外采篮
    if (get('flag')) query = query.contains('collect_flags', [get('flag')]);
    // 数据外采篮「去岗位库看」：只看这一篮采到的那几个岗位
    if (get('ids')) { const ids = get('ids').split(',').map(Number).filter(Boolean).slice(0, 200); if (ids.length) query = query.in('id', ids); }
    if (get('source') === 'none') query = query.or('source.is.null,source.eq.');
    else if (get('source')) query = query.ilike('source', `%${get('source')}%`);
    if (get('publishFrom')) query = query.gte('official_publish_date', get('publishFrom'));
    if (get('publishTo')) query = query.lte('official_publish_date', get('publishTo'));
    if (get('publish') === 'none') query = query.is('official_publish_date', null);
    if (get('missingJd') === '1') query = query.or('responsibilities.is.null,responsibilities.eq.');
    if (get('review') === 'none') query = query.is('human_review_status', null);
    else if (get('review')) query = query.eq('human_review_status', get('review'));
    return query;
    };

    const { data, count, error } = exportAll
      ? await selectAll(build).then(r => ({ ...r, count: r.data.length }))
      : await build().range(from, to);
    if (error) throw error;

    let stats: Record<string, number> | undefined;
    let sources: Record<string, number> | undefined;
    if (searchParams.get('withStats') === '1') {
      // 让数据库直接数（只回数字），缓存 60 秒；以前是把全库岗位连职责全文拉回来自己数
      const r = await cachedStats('jobs', async () => {
        const live = (q: any) => q.not('if_delete', 'is', true);
        const st = await countMany('jobs', {
          total: q => q, open: q => q.eq('status', 'open'),
          graduate: q => q.eq('job_type', 'graduate'), intern: q => q.eq('job_type', 'intern'), program: q => q.eq('job_type', 'program'),
          remote: q => q.eq('remote_type', 'remote'), overseas: q => q.eq('accepts_overseas_students', true),
          reviewed: q => q.eq('human_review_status', 'complete'), missing_jd: q => q.is('responsibilities', null),
          with_publish_date: q => q.not('official_publish_date', 'is', null),
        }, live);
        const src = await countMany('jobs', {
          ...Object.fromEntries(SOURCE_ORDER.map(k => [k, (q: any) => q.ilike('source', `%${k}%`)])),
          none: q => q.or('source.is.null,source.eq.'),
        }, live);
        return { stats: st, sources: Object.fromEntries(Object.entries(src).filter(([, n]) => n > 0)) };
      });
      stats = r.stats; sources = r.sources;
    }

    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, pageSize, stats, sources });
  } catch (error: any) {
    console.error('[Jobs] GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 批量审核 / 批量改状态：{ ids: [], human_review_status?, status? } */
export async function PATCH(request: Request) {
  try {
    const { ids, human_review_status, status } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: now };
    if (human_review_status !== undefined) { updates.human_review_status = human_review_status; updates.human_review_at = now; }
    if (status !== undefined) updates.status = status;
    const { error } = await supabaseAdmin.from('jobs').update(updates).in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true, updated: ids.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').map(s => parseInt(s)).filter(Number.isFinite);
    if (ids.length === 0) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });
    const { error } = await supabaseAdmin.from('jobs').delete().in('id', ids);
    if (error) throw error;
    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
