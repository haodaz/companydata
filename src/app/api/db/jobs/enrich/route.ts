import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchJinaUrl } from '@/lib/agents/fetcher';
import { structureJobData, searchJobFields, JOB_SEARCH_TRIGGER_FIELDS } from '@/lib/agents/structurer-job';
import { JOB_FIELDS, jobCompleteness, sanitizeJob } from '@/lib/job-fields';
import { FROZEN_REVIEW_STATUSES } from '@/lib/review-status';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_PER_CALL = 8;
const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const norm = (s: string) => s.toLowerCase().replace(/[\s\-–—_/（）()【】\[\]·,，。.:：]/g, '');

/**
 * 岗位 AI 补全，两步：
 *   1) 有详情链接（jobs.link）→ 打开详情页重新提取，只填空字段
 *   2) 求职关键字段仍缺 → 联网检索这条岗位的官方信息再补，并把来源链接记进 ai_sources
 *
 * body: { ids: number[], model?, overwrite?: boolean }
 * 每次最多处理 8 条（大模型逐条调用），前端分批调用。
 * 保护：审核已定论的岗位跳过；人工改过的字段（human_locked_fields）不覆盖。
 */
export async function POST(req: Request) {
  try {
    const { ids, model, overwrite } = await req.json();
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ success: false, error: 'Missing ids' }, { status: 400 });

    const { data: jobs, error } = await supabaseAdmin.from('jobs').select('*').in('id', ids.slice(0, MAX_PER_CALL));
    if (error) throw error;

    const results: { id: number; name: string; status: 'filled' | 'skipped' | 'failed'; filled: string[]; reason?: string; steps?: string[] }[] = [];
    for (const job of jobs || []) {
      const base = { id: job.id, name: job.name, filled: [] as string[], steps: [] as string[] };
      try {
        if (FROZEN_REVIEW_STATUSES.has(job.human_review_status || '')) { results.push({ ...base, status: 'skipped', reason: '审核已定论' }); continue; }

        const locked = new Set<string>(job.human_locked_fields || []);
        const updates: Record<string, any> = {};
        const sources: Record<string, string> = { ...(job.ai_sources || {}) };
        const merged = () => ({ ...job, ...updates });
        const take = (clean: Record<string, any>, src: string, srcMap?: Record<string, string>) => {
          for (const f of JOB_FIELDS) {
            if (f.key === 'name' || locked.has(f.key)) continue;
            const v = clean[f.key];
            if (isEmpty(v)) continue;
            if (overwrite || isEmpty(merged()[f.key])) { updates[f.key] = v; base.filled.push(f.key); sources[f.key] = srcMap?.[f.key] || src; }
          }
        };

        // ── 1. 详情页提取 ──
        if (job.link) {
          const md = await fetchJinaUrl(job.link);
          if (md && md.length >= 200) {
            const structured = await structureJobData(`### Source: [Job](${job.link})\n\n${md}`, job.institute_or_company_name || '', `目标岗位：${job.name}`, model || undefined, undefined, 'all');
            const list = structured?.jobs || [];
            if (list.length) {
              // 详情页通常只有一个岗位；多个时按名称匹配
              const target = norm(job.name || '');
              const picked = list.length === 1 ? list[0]
                : list.find(j => norm(String(j.name || '')) === target) || list.find(j => { const n = norm(String(j.name || '')); return n && (n.includes(target) || target.includes(n)); }) || list[0];
              take(sanitizeJob(picked), job.link);
              base.steps.push('详情页');
            } else base.steps.push('详情页无岗位');
          } else base.steps.push('详情页抓不到');
        }

        // ── 2. 关键字段仍缺 → 联网检索 ──
        const still = JOB_SEARCH_TRIGGER_FIELDS.filter(k => isEmpty(merged()[k]) && !locked.has(k));
        if (still.length) {
          const missing = JOB_FIELDS.map(f => f.key).filter(k => k !== 'name' && !locked.has(k) && isEmpty(merged()[k]));
          const found = await searchJobFields({ name: job.name, company: job.institute_or_company_name || '', program_name: job.program_name, location: job.location, source_url: job.source_url }, missing, model || undefined);
          const clean = sanitizeJob({ ...Object.fromEntries(JOB_FIELDS.map(f => [f.key, null])), ...found.fields });
          const before = base.filled.length;
          take(clean, found.sources.link || found.fields.link || '联网检索', found.sources);
          base.steps.push(base.filled.length > before ? '联网检索' : '联网检索无新信息');
        }

        if (!base.filled.length) { results.push({ ...base, status: 'skipped', reason: base.steps.join(' / ') || '没有详情链接，检索也没找到' }); continue; }

        updates.ai_sources = sources;
        updates.completeness_score = jobCompleteness(merged());
        updates.updated_at = new Date().toISOString();
        const { error: upErr } = await supabaseAdmin.from('jobs').update(updates).eq('id', job.id);
        if (upErr) throw upErr;
        results.push({ ...base, status: 'filled' });
      } catch (e: any) {
        results.push({ ...base, status: 'failed', reason: e.message });
      }
    }
    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    console.error('[Jobs/enrich]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
