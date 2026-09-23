import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { COMPANY_HEALTH_FIELDS, SEGMENT_LABELS, hasValue } from '@/lib/company-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 企业画像健康看板：字段填充率 / 子实体覆盖 / 完整度分布 / 新鲜度 / 审核 / 成本
 * 数据量在几千家以内，直接全量拉到内存里算。
 */
export async function GET(request: Request) {
  try {
    const segment = new URL(request.url).searchParams.get('segment') || '';
    const cols = ['id', 'name', 'segment', 'industry', 'human_review_status', 'completeness_score', 'profile_crawled_at', 'profile_updated_at', ...COMPANY_HEALTH_FIELDS.map(f => f.key)];
    let q = supabaseAdmin.from('companies').select(Array.from(new Set(cols)).join(', ')).limit(50000);
    if (segment === 'none') q = q.is('segment', null); else if (segment) q = q.eq('segment', segment);
    const { data: companies, error } = await q;
    if (error) throw error;
    const rows = (companies || []) as any[];
    const ids = new Set(rows.map(r => r.id));
    const total = rows.length;

    // 字段填充率
    const fields = COMPANY_HEALTH_FIELDS.map(f => {
      const filled = rows.filter(r => hasValue(r[f.key])).length;
      return { key: f.key, label: f.label, group: f.group, weight: f.weight, filled, rate: total ? Math.round((filled / total) * 100) : 0 };
    });

    // 子实体覆盖 + 动态新鲜度
    const [fin, news, exe] = await Promise.all([
      supabaseAdmin.from('company_financings').select('company_id').eq('if_delete', false).limit(100000),
      supabaseAdmin.from('company_news').select('company_id, publish_date').eq('if_delete', false).limit(100000),
      supabaseAdmin.from('company_executives').select('company_id').eq('if_delete', false).limit(100000),
    ]);
    const coverage = (list: any[] | null) => { const s = new Set<number>(); for (const r of list || []) if (ids.has(r.company_id)) s.add(r.company_id); return s.size; };
    const latestNews = new Map<number, string>();
    for (const n of news.data || []) {
      if (!ids.has(n.company_id) || !n.publish_date) continue;
      const cur = latestNews.get(n.company_id);
      if (!cur || n.publish_date > cur) latestNews.set(n.company_id, n.publish_date);
    }
    const now = Date.now();
    const freshness = { within_3m: 0, within_12m: 0, older: 0, none: 0 };
    for (const id of ids) {
      const d = latestNews.get(id);
      if (!d) { freshness.none++; continue; }
      const days = (now - new Date(d).getTime()) / 86400000;
      if (days <= 92) freshness.within_3m++; else if (days <= 366) freshness.within_12m++; else freshness.older++;
    }
    const entities = {
      financings: { companies: coverage(fin.data), rows: (fin.data || []).filter(r => ids.has(r.company_id)).length },
      news: { companies: coverage(news.data), rows: (news.data || []).filter(r => ids.has(r.company_id)).length },
      executives: { companies: coverage(exe.data), rows: (exe.data || []).filter(r => ids.has(r.company_id)).length },
    };

    // 完整度分布 / 审核 / 分类 / 画像状态
    const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0, none: 0 };
    const review: Record<string, number> = {};
    const segments: Record<string, number> = {};
    let crawled = 0, sumScore = 0, scored = 0;
    for (const r of rows) {
      const s = r.completeness_score;
      if (s === null || s === undefined) buckets.none++;
      else { scored++; sumScore += s; if (s <= 20) buckets['0-20']++; else if (s <= 40) buckets['21-40']++; else if (s <= 60) buckets['41-60']++; else if (s <= 80) buckets['61-80']++; else buckets['81-100']++; }
      review[r.human_review_status || 'none'] = (review[r.human_review_status || 'none'] || 0) + 1;
      const seg = r.segment || 'none';
      segments[seg] = (segments[seg] || 0) + 1;
      if (r.profile_crawled_at) crawled++;
    }

    // 最弱的企业（完整度最低的 15 家）
    const weakest = rows.filter(r => r.completeness_score !== null && r.completeness_score !== undefined).sort((a, b) => a.completeness_score - b.completeness_score).slice(0, 15)
      .map(r => ({ id: r.id, name: r.name, segment: r.segment, completeness_score: r.completeness_score, profile_crawled_at: r.profile_crawled_at }));

    // 成本：画像流水线的 token 日志按企业聚合
    const { data: usage } = await supabaseAdmin.from('token_usage_logs').select('institution, total_tokens, total_cost_usd, model_id, created_at').eq('tool_name', 'company-pipeline').limit(100000);
    const byCompany = new Map<string, { calls: number; tokens: number; cost: number }>();
    const cost = { calls: 0, tokens: 0, usd: 0 };
    for (const u of usage || []) {
      const c = parseFloat(u.total_cost_usd) || 0;
      cost.calls++; cost.tokens += u.total_tokens || 0; cost.usd += c;
      const k = u.institution || '(未知)';
      const cur = byCompany.get(k) || { calls: 0, tokens: 0, cost: 0 };
      cur.calls++; cur.tokens += u.total_tokens || 0; cur.cost += c;
      byCompany.set(k, cur);
    }
    const costliest = Array.from(byCompany.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.cost - a.cost).slice(0, 10);
    const { data: logsAgg } = await supabaseAdmin.from('company_crawl_logs').select('status, cost_usd, llm_calls').limit(100000);
    const runs = { total: 0, success: 0, failed: 0 };
    for (const l of logsAgg || []) { runs.total++; if (l.status === 'success') runs.success++; else if (l.status === 'failed') runs.failed++; }

    return NextResponse.json({
      ok: true,
      total, crawled, avg_completeness: scored ? Math.round(sumScore / scored) : null,
      fields, entities, freshness, buckets, review, segments: Object.entries(segments).map(([k, v]) => ({ key: k, label: SEGMENT_LABELS[k]?.label || '未分类', count: v })),
      weakest, runs,
      cost: { ...cost, usd: Math.round(cost.usd * 1e4) / 1e4, per_company: byCompany.size ? Math.round((cost.usd / byCompany.size) * 1e4) / 1e4 : 0, companies: byCompany.size, costliest },
    });
  } catch (error: any) {
    console.error('[CompanyHealth] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
