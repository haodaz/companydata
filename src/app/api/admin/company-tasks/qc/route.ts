import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { COMPANY_EDIT_FIELDS, SUB_ENTITIES, type SubEntityKey } from '@/lib/company-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELD_LABEL: Record<string, string> = Object.fromEntries(COMPANY_EDIT_FIELDS.map(f => [f.key, f.label]));
const ENTITY_KEYS: SubEntityKey[] = ['executives', 'products', 'news', 'financings'];

/**
 * 画像批次验收（10-26）：一个画像任务里跑成功的企业，人工审到哪了。口径和项目库一样，不另设标记：
 * 整家看审核状态；字段不对就是人工改了（锁定字段）；高管 / 产品等子实体看逐条的通过 / 不通过 / 删除。
 * 对照这批的完整度提升和花费，用来定这种跑法值不值得继续花钱。GET ?task=<taskId>
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
      const { data, error: e } = await supabaseAdmin.from('companies').select('id, human_review_status, human_review_by, human_review_at, human_locked_fields').in('id', ids.slice(i, i + 200));
      if (e) throw e;
      companies.push(...(data || []));
    }
    // 跑完之后才标的才算这一批的验收（「待审核」是 AI 默认状态，不算）
    const doneAt = new Map((logs as any[]).map(l => [l.company_id, l.finished_at]));
    const judged = companies.filter(c => c.human_review_status && c.human_review_status !== 'review' && c.human_review_at && (!doneAt.get(c.id) || c.human_review_at >= doneAt.get(c.id)));
    const byStatus: Record<string, number> = {};
    for (const c of judged) byStatus[c.human_review_status] = (byStatus[c.human_review_status] || 0) + 1;
    const reviewers: Record<string, number> = {};
    for (const c of judged) { const k = c.human_review_by || '（未记录）'; reviewers[k] = (reviewers[k] || 0) + 1; }
    // 人工改过的字段（审过的企业里）：哪些字段 AI 最常错
    const fieldCount: Record<string, number> = {};
    for (const c of judged) for (const f of c.human_locked_fields || []) fieldCount[f] = (fieldCount[f] || 0) + 1;
    const fields_corrected = Object.entries(fieldCount).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, label: FIELD_LABEL[key] || key, n }));
    // 子实体逐条审：审过的企业名下，通过 / 不通过 / 删掉的各几条
    const judgedIds = judged.map(c => c.id);
    const entities: Record<string, { label: string; total: number; complete: number; rejected: number; deleted: number }> = {};
    for (const k of ENTITY_KEYS) {
      const e = { label: SUB_ENTITIES[k].label, total: 0, complete: 0, rejected: 0, deleted: 0 };
      for (let i = 0; i < judgedIds.length; i += 200) {
        const { data } = await supabaseAdmin.from(SUB_ENTITIES[k].table).select('human_review_status, if_delete').in('company_id', judgedIds.slice(i, i + 200));
        for (const r of data || []) { e.total++; if (r.if_delete) e.deleted++; else if (r.human_review_status === 'complete') e.complete++; else if (r.human_review_status === 'rejected') e.rejected++; }
      }
      entities[k] = e;
    }
    const n = (logs as any[]).length, avg = (k: string) => n ? (logs as any[]).reduce((s, l) => s + (+l[k] || 0), 0) / n : 0;
    return NextResponse.json({
      ok: true,
      name: t?.name || '',
      total: ids.length,
      reviewed: judged.length,
      passed: byStatus.complete || 0,
      rejected: byStatus.rejected || 0,
      by_status: byStatus,
      corrected_companies: judged.filter(c => (c.human_locked_fields || []).length).length,
      fields_corrected, entities, reviewers,
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
