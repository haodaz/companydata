/**
 * 岗位实体写入（服务端）：岗位提取成功后，把本次提取到的岗位逐条写入 jobs 表。
 *
 * 一个城市一条（数据部门 2026-10-10）：「北京、上海」拆成两条，各自去重、各自下线。
 * 去重：有岗位独立链接用链接（多城市再带上城市）；否则用「企业 + 岗位编号或名称 + 地点」。
 *   键对不上时再按「同企业 + 同岗位名 + 同城市」认一次旧记录（上次地点写「深圳总部」这次写「深圳」、
 *   上次没抓到详情链接这次抓到了），认上了就沿用旧那条（编号不变），不再新建一条、把旧的标成已下线。
 * 下线判定：同一来源页以最新一次提取为准——之前从这个页面提取到、这次没再出现的岗位标记为 closed（不删除，保留招聘历史）。
 * 人工审核保护：审核通过 / 不通过 / 失效隐藏的岗位不覆盖；人工改过的字段（human_locked_fields）不覆盖。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { applyJobDefaults, companySearchNames } from '@/lib/job-defaults';
import { isGrounded } from '@/lib/jd-grounding';
import { resolveRegion } from '@/lib/region-codes';
import { FROZEN_REVIEW_STATUSES } from '@/lib/review-status';
import { toSources } from '@/lib/source-tags';
import { tagAndSave } from '@/lib/job-tagging';
import { sanitizeJob, jobCompleteness, KIND_BY_JOB_TYPE, splitLocations, normCity, jobSourceOf } from '@/lib/job-fields';

const normUrl = (u: string) => u.trim().toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '');

export function jobDedupeKey(job: { link?: string | null; job_req_id?: string | null; name: string; location?: string | null }, companyId: number | null, company: string, sourceUrl: string, splitCity?: string | null) {
  const own = (job.link || '').trim();
  // 单页招聘站（moka 等）的岗位链接是 …/116100#/job/<id>：# 后面那段就是岗位本身，不能删
  const route = /#!?\//.test(own);
  // 列表页上的岗位如果链接就是列表页自己，不算独立链接
  if (own && (route || normUrl(own) !== normUrl(sourceUrl))) {
    // 保留 query：很多 ATS 用 ?gh_jid= / ?jobId= 区分岗位；保留 #/ 前端路由，只去掉页内锚点
    const k = own.trim().toLowerCase().replace(/#(?!!?\/).*$/, '').replace(/\/+$/, '');
    // 一个详情页写了好几个城市：拆开后每个城市一条，键带上城市
    return splitCity ? `${k}|${normCity(splitCity)}` : k;
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

/** 入库后由 job-tagging 专门打的字段：重新提取时不覆盖 */
const TAGGED_FIELDS = ['fos_ids', 'related_career_ids', 'exp_labels', 'skill_labels', 'exp_labels_jd', 'skill_labels_jd', 'qianli_job_labels', 'qianli_job_specialty_labels', 'qianli_specialty_labels_reason'];

export async function upsertJobsFromLog(logId: number, structuredJson: any): Promise<number> {
  const { data: log, error: logErr } = await supabaseAdmin
    .from('job_crawl_logs')
    .select('id, company_id, company, target_url, model_id, raw_markdown')
    .eq('id', logId)
    .single();
  if (logErr) throw logErr;
  // 来源 = 所属企业的名单批次（数据部门 10-14，和企业一致）；招聘渠道按链接推，单独一列
  const { data: co } = log.company_id ? await supabaseAdmin.from('companies').select('source, name, brief_name, registered_name, name_en, aliases').eq('id', log.company_id).maybeSingle() : { data: null as any };
  // 多选（迁移 031 起企业、岗位的来源都是数组）；迁移前库里还是字符串，按企业那边的类型写，两边一起迁移
  const srcList = toSources(co?.source).length ? toSources(co?.source) : ['其他'];
  const companySource: string[] | string = Array.isArray(co?.source) ? srcList : srcList.join('，');

  const now = new Date().toISOString();
  const rows = new Map<string, any>();
  const ungrounded = new Set<string>();   // 职责 / 要求和原文对不上的岗位名
  // 同一批里好几个岗位共用的链接不是岗位自己的详情页（多半是列表页，模型给每个岗位都填了它）：
  // 这种链接不拿来去重，不然一页几十个岗位会被合成一个（MiniMax 16 → 1）
  const linkCount = new Map<string, number>();
  for (const raw of jobsOf(structuredJson)) { const l = String(raw?.link || '').trim().toLowerCase(); if (l) linkCount.set(l, (linkCount.get(l) || 0) + 1); }
  // 同理，一个招聘帖拆出的子岗位共用母帖的岗位编号（立讯 LUXSHARE101735 下 12 个子岗位）：编号对应多个不同岗位名时，去重改看岗位名
  const reqNames = new Map<string, Set<string>>();
  for (const raw of jobsOf(structuredJson)) { const r = String(raw?.job_req_id || '').trim(); if (r) reqNames.set(r, (reqNames.get(r) || new Set()).add(String(raw?.name || ''))); }
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
    applyJobDefaults(job, log.company);   // 主办方 / 年级要求 / 工作地址 / 技能标签分隔（数据部门 10-14）
    // 职责 / 要求要能在这次抓到的原文里找到（数据部门 10-21：模型会编泛泛的职责）。对不上的这次不写：
    // 已有岗位保留原值（可能是之前从详情页补的真内容），新岗位留空，打「详情待补」
    const src = String(log.raw_markdown || '');
    for (const k of ['responsibilities', 'overview'] as const) {
      if (job[k] && !isGrounded(job[k], src)) { delete job[k]; ungrounded.add(String(job.name)); }
    }
    if (!job.form_of_play && job.remote_type) job.form_of_play = { remote: 'online', onsite: 'offline', hybrid: 'online_and_offline' }[job.remote_type as string] || null;
    const sharedReq = job.job_req_id && (reqNames.get(String(job.job_req_id).trim())?.size || 0) > 1;
    const cities = splitLocations(job.location);
    for (const loc of cities.length ? cities : [job.location]) {
      const multi = cities.length > 1;
      // 拆城市时，工作地址是默认抄的工作地点的，跟着改成这一条的城市
      // 城市存选项集编码（10-19），拆出来的这一条按自己的地点重新认
      const one = multi ? { ...job, location: loc, ...(({ country, province, city }) => ({ country: country || job.country, province, city }))(resolveRegion({ country: job.country, location: loc })), address: job.address === job.location ? loc : job.address } : job;
      const key = jobDedupeKey(sharedReq ? { ...one, job_req_id: null } as any : one as any, log.company_id, log.company, log.target_url, multi ? loc : null);
      rows.set(key, {
        ...one,
        dedupe_key: key,
        company_id: log.company_id,
        institute_or_company_name: log.company || '',
        status: 'open',
        source_url: log.target_url,
        source_log_id: log.id,
        source: companySource,
        name_to_search: companySearchNames(co),   // 查找名称：企业的各种叫法（数据部门 10-16）
        recruit_channel: jobSourceOf(one.link, log.target_url),
        completeness_score: jobCompleteness(job),
        last_seen_at: now,
        updated_at: now,
      });
    }
  }

  const list = Array.from(rows.values());
  const keys = list.map(r => r.dedupe_key);

  type Existing = { id: number; dedupe_key: string; human_review_status: string | null; human_locked_fields: string[] | null };
  const existing = new Map<string, Existing>();
  for (let i = 0; i < keys.length; i += 10) { // 键里有中文，编码后网址很长：一批 10 个，免得超过请求头上限
    const { data, error } = await supabaseAdmin.from('jobs').select('id, dedupe_key, human_review_status, human_locked_fields').in('dedupe_key', keys.slice(i, i + 10));
    if (error) throw error;
    for (const r of data || []) existing.set(r.dedupe_key, r);
  }

  // 键对不上的，按「同企业 + 同岗位名 + 同城市」再认一次旧记录：认上了先把旧记录的键改成新键，后面照常覆盖
  const unmatched = list.filter(r => !existing.has(r.dedupe_key));
  if (unmatched.length && log.company_id) {
    const names = Array.from(new Set(unmatched.map(r => r.name)));
    type Twin = Existing & { location: string | null; job_req_id: string | null };
    const twins = new Map<string, Twin[]>();
    for (let i = 0; i < names.length; i += 10) {
      const { data, error } = await supabaseAdmin.from('jobs').select('id, dedupe_key, human_review_status, human_locked_fields, name, location, job_req_id')
        .eq('company_id', log.company_id).in('name', names.slice(i, i + 10)).not('if_delete', 'is', true);
      if (error) throw error;
      for (const r of data || []) { const k = `${String(r.name).trim().toLowerCase()}|${normCity(r.location)}`; twins.set(k, [...(twins.get(k) || []), r as any]); }
    }
    const taken = new Set(Array.from(existing.values()).map(e => e.id));
    for (const row of unmatched) {
      const cand = (twins.get(`${String(row.name).trim().toLowerCase()}|${normCity(row.location)}`) || [])
        // 两边都有岗位编号且不同：是两个岗位，不认
        .filter(e => !taken.has(e.id) && !(e.job_req_id && row.job_req_id && e.job_req_id !== row.job_req_id));
      if (cand.length !== 1) continue;   // 认不准（没有 / 好几条）就当新岗位
      const e = cand[0];
      const { error } = await supabaseAdmin.from('jobs').update({ dedupe_key: row.dedupe_key }).eq('id', e.id);
      if (error) throw error;
      taken.add(e.id);
      existing.set(row.dedupe_key, { ...e, dedupe_key: row.dedupe_key });
    }
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
    // 入库后专门打的字段（专业 / 职业、四个标签、潜历标签）不写进行里：已有岗位保留原值，新岗位入库后再打
    for (const k of TAGGED_FIELDS) delete (row as any)[k];
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
  // 只是列表的一页（数据外采篮 / 人翻页逐页读，partial_page）也不判：别的页上的岗位不在这一页很正常——
  // 百度翻页网址不变，10-16 入第 18–28 页时把前 17 页的岗位全关了。
  if (list.length > 0 && !structuredJson?.partial_page) {
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


  // 同一个岗位编号、同一城市在这家企业下有两条（列表行按编号去重、详情页按链接去重，键不一样）：并成一条
  if (list.length && log.company_id) await mergeSameReqId(log.company_id).catch(e => console.error('[job-store] 同编号合并失败', e?.message || e));

  // 这个网址实测出了岗位：信息源库里标成「校招职位列表」+ 核实通过（数据部门 10-16：表层招聘官网和真正的岗位列表页常常不是一个网址）
  if (list.length && log.company_id) await markRealEntry(log.company_id, log.company || '', log.target_url, list.length).catch(e => console.error('[job-store] 标记信息源失败', e?.message || e));

  // 职责 / 要求和原文对不上、这次没写进去的：打「详情待补」，岗位库能筛出来去详情页补
  if (ungrounded.size) {
    const { data: hit } = await supabaseAdmin.from('jobs').select('id, name, collect_flags').eq('source_log_id', logId).in('name', [...ungrounded]);
    for (const j of hit || []) {
      const f = new Set<string>(j.collect_flags || []); if (f.has('详情待补')) continue; f.add('详情待补');
      await supabaseAdmin.from('jobs').update({ collect_flags: [...f] }).eq('id', j.id);
    }
    console.log(`[job-store] 日志 #${logId}：${ungrounded.size} 个岗位的职责 / 要求和原文对不上，没写入、标了详情待补`);
  }

  // 关联专业 / 职业（数据部门 10-17）：这一页新进来、还没标过的岗位，用这次提炼选的模型打上
  if (list.length) {
    const { data: untagged } = await supabaseAdmin.from('jobs').select('id').eq('source_log_id', logId).not('if_delete', 'is', true).or('fos_ids.is.null,fos_ids.eq.');   // 10-19 起是「|」隔开的文本
    const ids = (untagged || []).map(r => r.id);
    // 专业、四个标签走便宜模型；职业和潜历标签用这次提取在选单里选的模型（要挑准 / 守原文证据）
    if (ids.length && (process.env.CHEAP_MODEL || log.model_id || process.env.DEFAULT_MODEL)) await tagAndSave(ids, process.env.CHEAP_MODEL || log.model_id || process.env.DEFAULT_MODEL || '', { strongModel: log.model_id || process.env.DEFAULT_MODEL || process.env.CHEAP_MODEL }).catch(e => console.error('[job-store] 打标签失败', e?.message || e));
  }
  return list.length;
}

/** 实测出岗位的网址记进信息源库：有就改成职位列表 + 核实通过，没有就新建一条。数据部门给的「招聘官网」不动 */
export async function markRealEntry(companyId: number, company: string, url: string, jobs: number) {
  const health = { reason: `实测出岗位 ${jobs} 个（${new Date().toISOString().slice(0, 10)}）`, by: 'job-store' };
  const now = new Date().toISOString();
  const { data: rows } = await supabaseAdmin.from('url_sources').select('id, subtype, reasoning').eq('company_id', companyId).eq('url', url).limit(1);
  const row = rows?.[0];
  if (row) {
    const keepPortal = /数据部门/.test(row.reasoning || '');   // 数据部门给的入口保留「校招官网」类型，只标核实通过
    await supabaseAdmin.from('url_sources').update({ ...(keepPortal ? {} : { type: 'campus', subtype: 'list' }), verification_status: 'passed', health_status: 'alive', last_checked_at: now, url_health: health }).eq('id', row.id);
  } else {
    const name = company || (await supabaseAdmin.from('companies').select('name').eq('id', companyId).maybeSingle()).data?.name;
    if (!name) return;
    const fields = { verification_status: 'passed', health_status: 'alive', last_checked_at: now, url_health: health };
    const { error } = await supabaseAdmin.from('url_sources').insert({ company: name, company_id: companyId, url, title: '实测出岗位的职位列表', type: 'campus', subtype: 'list', reasoning: '抓取时实测出岗位，自动记入', ...fields });
    // 同名同网址已有一条（挂在别的 company_id 上）：改那条
    if (error && /duplicate|unique/i.test(error.message)) await supabaseAdmin.from('url_sources').update({ company_id: companyId, ...fields }).eq('company', name).eq('url', url);
  }
}

/**
 * 同一家企业里「岗位编号 + 城市」相同的在招岗位只留一条：留内容最全的（职责最长），另一条有而它没有的字段补过来，另一条软删。
 * 起因：百度列表页的岗位行没有独立链接，按「企业|编号|城市」去重；点开详情页读到的同一个岗位有链接，按链接去重——成了两条（10-16）。
 */
/** 两个岗位名是不是同一个岗位：去掉城市前缀、括号里的编号 / 届别后，相同或一个包含另一个 */
export const sameJobName = (a: unknown, b: unknown) => {
  const n = (x: unknown) => String(x || '').replace(/\s+/g, '').replace(/^[\u4e00-\u9fa5]{2,3}[-－—]/, '').replace(/[（(][^）)]*[）)]/g, '').toLowerCase();
  const x = n(a), y = n(b);
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))));
};

/** 合并用的城市键：「江苏省·常州市」「常州市」「常州」都算常州（取分隔符后最后一段、去掉省 / 市）——数据部门 10-17 反馈中创新航 J14747 两条 */
export const cityKey = (loc: unknown) => {
  const parts = String(loc || '').replace(/\s+/g, '').split(/[·・\-－—\/|]/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : '';
  return last.replace(/^.{2,3}省/, '').replace(/(特别行政区|自治区|市)$/, '').toLowerCase();
};

/** 最近一次合并：被并掉的岗位 id → 留下的那条 id（数据外采篮用它把「去岗位库看」指到真正留下的记录） */
export const mergedInto = new Map<number, number>();
export async function mergeSameReqId(companyId: number) {
  const { data } = await supabaseAdmin.from('jobs').select('*').eq('company_id', companyId).not('if_delete', 'is', true).not('job_req_id', 'is', null).neq('job_req_id', '');
  const groups = new Map<string, any[]>();
  // 编号要像个编号（带数字、至少 3 位）：「暂无」「-」这类占位不能拿来合并
  for (const j of (data || []).filter(j => /\d/.test(String(j.job_req_id)) && String(j.job_req_id).trim().length >= 3)) { const k = `${String(j.job_req_id).trim().toLowerCase()}|${cityKey(j.location)}`; groups.set(k, [...(groups.get(k) || []), j]); }
  const SKIP = new Set(['id', 'company_id', 'dedupe_key', 'created_at', 'updated_at', 'if_delete', 'human_review_status', 'human_review_at', 'human_locked_fields', 'source_log_id']);
  let merged = 0;
  for (const g0 of groups.values()) {
    if (g0.length < 2) continue;
    // 名字也得对得上：有的站整页岗位共用一个编号（「光学硬件工程师」和「供应链负责人」编号一样），只按编号会把不同岗位并掉
    const g = g0.filter(j => sameJobName(j.name, g0[0].name));
    if (g.length < 2) continue;
    g.sort((x, y) => String(y.responsibilities || '').length - String(x.responsibilities || '').length);
    const [keep, ...rest] = g;
    const patch: Record<string, any> = {};
    for (const r of rest) for (const [k, v] of Object.entries(r)) {
      if (SKIP.has(k) || v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
      const cur = (patch[k] ?? keep[k]);
      if (cur == null || cur === '' || (Array.isArray(cur) && !cur.length)) patch[k] = v;
    }
    const flags = new Set<string>([...(keep.collect_flags || []), ...rest.flatMap(r => r.collect_flags || [])]);
    if (flags.has('详情已补')) flags.delete('仅列表信息');
    patch.collect_flags = [...flags];
    // 名称取更完整的那个（列表行常带城市前缀「北京-」）
    const longest = g.map(x => String(x.name || '')).sort((a, b) => b.length - a.length)[0];
    if (longest && longest !== keep.name) patch.name = longest;
    await supabaseAdmin.from('jobs').update(patch).eq('id', keep.id);
    await supabaseAdmin.from('jobs').update({ if_delete: true, updated_at: new Date().toISOString() }).in('id', rest.map(r => r.id));
    for (const r of rest) mergedInto.set(r.id, keep.id);
    merged += rest.length;
  }
  // 第二遍：没有岗位编号的站，列表行和详情页按名称 + 城市对上（名称去掉「北京-」这类城市前缀），其中一条是「仅列表信息」才并
  const { data: rest2 } = await supabaseAdmin.from('jobs').select('*').eq('company_id', companyId).not('if_delete', 'is', true).eq('status', 'open');
  const nameKey = (j: any) => `${String(j.name || '').replace(/\s+/g, '').replace(/^[\u4e00-\u9fa5]{2,3}[-－—]/, '').toLowerCase()}|${cityKey(j.location)}`;
  const g2 = new Map<string, any[]>();
  for (const j of rest2 || []) g2.set(nameKey(j), [...(g2.get(nameKey(j)) || []), j]);
  for (const g of g2.values()) {
    if (g.length !== 2 || !g.some(j => (j.collect_flags || []).includes('仅列表信息'))) continue;
    const ids = g.map(j => String(j.job_req_id || '')).filter(Boolean);
    if (new Set(ids).size > 1) continue;   // 两条编号不一样：是两个岗位
    g.sort((x, y) => String(y.responsibilities || '').length - String(x.responsibilities || '').length);
    const [keep, drop] = g;
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(drop)) { if (SKIP.has(k) || v == null || v === '' || (Array.isArray(v) && !v.length)) continue; const cur = keep[k]; if (cur == null || cur === '' || (Array.isArray(cur) && !cur.length)) patch[k] = v; }
    const flags = new Set<string>([...(keep.collect_flags || []), ...(drop.collect_flags || [])]); if (flags.has('详情已补')) flags.delete('仅列表信息');
    patch.collect_flags = [...flags];
    await supabaseAdmin.from('jobs').update(patch).eq('id', keep.id);
    await supabaseAdmin.from('jobs').update({ if_delete: true, updated_at: new Date().toISOString() }).eq('id', drop.id);
    mergedInto.set(drop.id, keep.id); merged++;
  }
  return merged;
}
