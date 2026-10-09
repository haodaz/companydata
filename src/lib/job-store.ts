/**
 * 岗位实体写入（服务端）：岗位提取成功后，把本次提取到的岗位逐条写入 jobs 表。
 *
 * 去重：有岗位独立链接用链接；否则用「企业 + 岗位编号或名称 + 地点」。
 * 下线判定：同一来源页以最新一次提取为准——之前从这个页面提取到、这次没再出现的岗位标记为 closed（不删除，保留招聘历史）。
 * 人工审核保护：审核通过 / 不通过 / 失效隐藏的岗位不覆盖；人工改过的字段（human_locked_fields）不覆盖。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { FROZEN_REVIEW_STATUSES } from '@/lib/review-status';
import { sanitizeJob, jobCompleteness, KIND_BY_JOB_TYPE } from '@/lib/job-fields';

const normUrl = (u: string) => u.trim().toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '');

export function jobDedupeKey(job: { link?: string | null; job_req_id?: string | null; name: string; location?: string | null }, companyId: number | null, company: string, sourceUrl: string) {
  const own = (job.link || '').trim();
  // 单页招聘站（moka 等）的岗位链接是 …/116100#/job/<id>：# 后面那段就是岗位本身，不能删
  const route = /#!?\//.test(own);
  // 列表页上的岗位如果链接就是列表页自己，不算独立链接
  if (own && (route || normUrl(own) !== normUrl(sourceUrl))) {
    // 保留 query：很多 ATS 用 ?gh_jid= / ?jobId= 区分岗位；保留 #/ 前端路由，只去掉页内锚点
    return own.trim().toLowerCase().replace(/#(?!!?\/).*$/, '').replace(/\/+$/, '');
  }
  const who = companyId ?? (company || '').trim().toLowerCase();
  const what = (job.job_req_id || job.name).trim().toLowerCase();
  return `${who}|${what}|${(job.location || '').trim().toLowerCase()}`;
}

/**
 * 招应届生 / 「XX 届」的岗位，毕业时间窗口没写就默认那一年整年（数据部门 2026-10-09 口径）：
 * 年份取「2027 届」里的年；只说「应届」没写届别的，取岗位发布日期的年份（再没有就取当年）。
 */
export function applyGradWindowDefault(job: Record<string, any>) {
  if (job.grad_window_start || job.grad_window_end) return;
  const text = [job.graduation_year, job.program_name, job.name, job.target_students, job.recruit_season].filter(Boolean).join(' ');
  const cls = text.match(/(20\d{2})\s*届/)?.[1];
  if (!cls && job.job_type !== 'graduate' && !/应届/.test(text)) return;
  const y = cls || String(job.official_publish_date || '').slice(0, 4) || String(new Date().getFullYear());
  if (!/^20\d{2}$/.test(y)) return;
  job.grad_window_start = `${y}-01-01`;
  job.grad_window_end = `${y}-12-31`;
}

export function jobsOf(json: any): any[] {
  return Array.isArray(json?.jobs) ? json.jobs : [];
}

export async function upsertJobsFromLog(logId: number, structuredJson: any): Promise<number> {
  const { data: log, error: logErr } = await supabaseAdmin
    .from('job_crawl_logs')
    .select('id, company_id, company, target_url')
    .eq('id', logId)
    .single();
  if (logErr) throw logErr;

  const now = new Date().toISOString();
  const rows = new Map<string, any>();
  // 同一批里好几个岗位共用的链接不是岗位自己的详情页（多半是列表页，模型给每个岗位都填了它）：
  // 这种链接不拿来去重，不然一页几十个岗位会被合成一个（MiniMax 16 → 1）
  const linkCount = new Map<string, number>();
  for (const raw of jobsOf(structuredJson)) { const l = String(raw?.link || '').trim().toLowerCase(); if (l) linkCount.set(l, (linkCount.get(l) || 0) + 1); }
  for (const raw of jobsOf(structuredJson)) {
    const job = sanitizeJob(raw);
    if (!job.name) continue;
    if (job.link && (linkCount.get(String(job.link).trim().toLowerCase()) || 0) > 1) job.link = null;
    // 非空布尔列：模型给 null 时批量 upsert 会写进 null 撞约束（GPT 系模型常这样）。是否删除由人工决定，不让 AI 写
    if (typeof job.is_in_campus !== 'boolean') job.is_in_campus = false;
    delete job.if_delete;
    // 对方的枚举字段：AI 没直接给出时，从我们自己的字段推导
    if (!job.kind && job.job_type) job.kind = KIND_BY_JOB_TYPE[job.job_type] || null;
    if (!job.accept_foreign && job.visa_sponsorship !== null) job.accept_foreign = job.visa_sponsorship ? 'accepted' : 'not_accepted';
    applyGradWindowDefault(job);
    if (!job.form_of_play && job.remote_type) job.form_of_play = { remote: 'online', onsite: 'offline', hybrid: 'online_and_offline' }[job.remote_type as string] || null;
    const key = jobDedupeKey(job as any, log.company_id, log.company, log.target_url);
    rows.set(key, {
      ...job,
      dedupe_key: key,
      company_id: log.company_id,
      institute_or_company_name: log.company || '',
      status: 'open',
      source_url: log.target_url,
      source_log_id: log.id,
      completeness_score: jobCompleteness(job),
      last_seen_at: now,
      updated_at: now,
    });
  }

  const list = Array.from(rows.values());
  const keys = list.map(r => r.dedupe_key);

  type Existing = { id: number; dedupe_key: string; human_review_status: string | null; human_locked_fields: string[] | null };
  const existing = new Map<string, Existing>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await supabaseAdmin.from('jobs').select('id, dedupe_key, human_review_status, human_locked_fields').in('dedupe_key', keys.slice(i, i + 100));
    if (error) throw error;
    for (const r of data || []) existing.set(r.dedupe_key, r);
  }

  const isFrozen = (e?: Existing) => !!e && FROZEN_REVIEW_STATUSES.has(e.human_review_status || '');

  const bulk: any[] = [];
  for (const row of list) {
    const e = existing.get(row.dedupe_key);
    if (isFrozen(e)) {
      // 已定论的岗位只刷新「还在招」的事实，不动内容
      await supabaseAdmin.from('jobs').update({ last_seen_at: now }).eq('id', e!.id);
      continue;
    }
    const lockedFields = (e?.human_locked_fields || []) as string[];
    if (e && lockedFields.length) {
      const patch = { ...row };
      for (const f of lockedFields) delete patch[f];
      const { error } = await supabaseAdmin.from('jobs').update(patch).eq('id', e.id);
      if (error) throw error;
    } else {
      bulk.push(row);
    }
  }
  // 新写入的岗位默认「待审核」；已有记录（无锁定字段）整行覆盖，但不动它的审核状态
  for (const row of bulk) if (!existing.has(row.dedupe_key)) row.human_review_status = 'review';
  for (let i = 0; i < bulk.length; i += 200) {
    const { error } = await supabaseAdmin.from('jobs').upsert(bulk.slice(i, i + 200), { onConflict: 'dedupe_key' });
    if (error) throw error;
  }

  // 同一来源页之前提取到、这次不在名单里的在招岗位 → 已下线。
  // 本次一个岗位都没提取到时不做判定（更可能是抓取失败而不是全部下线）。
  if (list.length > 0) {
    const keep = new Set(keys);
    const stale: number[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin.from('jobs').select('id, dedupe_key').eq('source_url', log.target_url).eq('status', 'open').range(from, from + 999);
      if (error) throw error;
      for (const r of data || []) if (!keep.has(r.dedupe_key)) stale.push(r.id);
      if (!data || data.length < 1000) break;
    }
    for (let i = 0; i < stale.length; i += 200) {
      const { error } = await supabaseAdmin.from('jobs').update({ status: 'closed', updated_at: now }).in('id', stale.slice(i, i + 200));
      if (error) throw error;
    }
  }

  return list.length;
}
