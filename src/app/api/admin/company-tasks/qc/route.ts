import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { COMPANY_REVIEW_ISSUES } from '@/lib/review-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 画像批次验收（10-26）：一个画像任务里跑成功的企业，人工审了多少、通过率、各类问题各几家，对照这批的完整度提升和花费。
 * 用来定「这种跑法值不值得继续花钱」。GET ?task=<taskId>
 */
export async function GET(request: Request) {
  try {
    const task = new URL(request.url).searchParams.get('task') || '';
    if (!task) return NextResponse.json({ ok: false, error: 'need task' }, { status: 400 });
    const { data: t } = await supabaseAdmin.from('company_tasks').select('name').eq('id', task).single();
    const { data: logs, error } = await selectAll(() => supabaseAdmin.from('company_crawl_logs').select('company_id, completeness_before, completeness_after, cost_usd, model_id, finished_at').eq('task_id', task).eq('status', 'success').order('id'));
    if (error) throw error;
    const ids = [...new Set((logs as any[]).map(l => l.company_id))];
    const companies: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error: e } = await supabaseAdmin.from('companies').select('id, human_review_status, human_review_issues, human_review_by, human_review_at').in('id', ids.slice(i, i + 200));
      if (e) throw e;
      companies.push(...(data || []));
    }
    // 跑完之后才审的才算这一批的验收（之前审过的旧结论不算）
    const doneAt = new Map((logs as any[]).map(l => [l.company_id, l.finished_at]));
    const judged = companies.filter(c => ['complete', 'rejected'].includes(c.human_review_status) && c.human_review_at && (!doneAt.get(c.id) || c.human_review_at >= doneAt.get(c.id)));
    const issues = Object.fromEntries(COMPANY_REVIEW_ISSUES.map(i => [i.value, 0]));
    for (const c of judged) for (const k of c.human_review_issues || []) if (k in issues) issues[k]++;
    const reviewers: Record<string, number> = {};
    for (const c of judged) { const k = c.human_review_by || '（未记录）'; reviewers[k] = (reviewers[k] || 0) + 1; }
    const n = (logs as any[]).length, avg = (k: string) => n ? (logs as any[]).reduce((s, l) => s + (+l[k] || 0), 0) / n : 0;
    const passed = judged.filter(c => c.human_review_status === 'complete');
    return NextResponse.json({
      ok: true,
      name: t?.name || '',
      total: ids.length,
      reviewed: judged.length,
      passed: passed.length,
      passed_clean: passed.filter(c => !(c.human_review_issues || []).length).length,
      rejected: judged.length - passed.length,
      issues, reviewers,
      completeness_before: +avg('completeness_before').toFixed(1),
      completeness_after: +avg('completeness_after').toFixed(1),
      cost_usd: +(avg('cost_usd') * n).toFixed(2),
      cost_per_company: +avg('cost_usd').toFixed(3),
      models: [...new Set((logs as any[]).map(l => l.model_id).filter(Boolean))],
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
