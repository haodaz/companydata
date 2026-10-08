/**
 * 飞轮检测（人工触发：看板上点「立即检测」，建议每天一次）：
 *   1. 归一：企业库的行业写法、还没归一的信号
 *   2. 站内前瞻：社招里在招「校园招聘经理 / 雇主品牌」的企业 → 要启动校招了
 *   3. 联网前瞻：宣讲会、融资、校企合作、扩张、新开校招站、热门职位（WEB_PROBES），扫到的企业盘进库
 *   4. 算热度、供给、缺口
 *   5. 排产：热门企业重抓岗位 / 补画像，热门行业里数据薄的企业补招聘入口 —— 建成「飞轮排产」草稿任务，
 *      出现在「校招岗位提取」「企业画像工具」里，数据部门照常开跑
 * 结果写 flywheel_days（一天一行，重跑覆盖）。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { searchJson } from '@/lib/agents/search-llm';
import { resolveCompanyLoose, resolveLooseOrCreateCompany } from '@/lib/company-match';
import { WEB_PROBES } from '@/lib/flywheel/sources';
import { INDUSTRIES, JOB_FUNCTIONS, cleanProfession, isEmployer } from '@/lib/flywheel/taxonomy';
import { logDemand } from '@/lib/flywheel/signals';
import { normalizeCompanyIndustries, normalizePending } from '@/lib/flywheel/normalize';
import { computeBoard, type BoardRow } from '@/lib/flywheel/board';

const DAY = 86_400_000;
const BILLING = /402|Payment Required|credits are depleted|insufficient_quota|exceeded your current quota/i;
export const shanghaiDay = (t = Date.now()) => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);

export interface DailyOptions {
  model: string;
  /** 额度用完时换用的模型 */
  fallbackModel?: string;
  scanWeb?: boolean;
  /** 忽略探针的扫描间隔，全部扫一遍 */
  forceAll?: boolean;
  plan?: boolean;
  log?: (s: string) => void;
}

/** 检测进度写在当天那行的 stats.run 里：{ status, startedAt, finishedAt, log[], error }，看板轮询它 */
async function setRun(day: string, patch: Record<string, any>) {
  const { data } = await supabaseAdmin.from('flywheel_days').select('stats').eq('day', day).maybeSingle();
  const stats = { ...(data?.stats || {}), run: { ...((data?.stats as any)?.run || {}), ...patch } };
  await supabaseAdmin.from('flywheel_days').upsert({ day, stats, updated_at: new Date().toISOString() }, { onConflict: 'day' });
}

/** 有没有正在跑的检测（15 分钟内开始、还没结束的算在跑；超过就当上次中断了） */
export async function runningDetection(): Promise<{ day: string; startedAt: string } | null> {
  const day = shanghaiDay();
  const { data } = await supabaseAdmin.from('flywheel_days').select('stats').eq('day', day).maybeSingle();
  const run = (data?.stats as any)?.run;
  if (run?.status === 'running' && Date.now() - Date.parse(run.startedAt) < 15 * 60_000) return { day, startedAt: run.startedAt };
  return null;
}

export async function runDaily(opts: DailyOptions) {
  const day = shanghaiDay();
  const startedAt = new Date().toISOString();
  const lines: string[] = [];
  let chain: Promise<unknown> = setRun(day, { status: 'running', startedAt, finishedAt: null, error: null, log: [] });
  const log = (s: string) => {
    const line = `${new Date(Date.now() + 8 * 3600_000).toISOString().slice(11, 19)} ${s}`;
    lines.push(line); console.log(`[flywheel] ${s}`); opts.log?.(s);
    chain = chain.then(() => setRun(day, { log: lines.slice() })).catch(() => {});
  };
  try {
    const r = await runDailyInner(opts, day, log);
    await chain;
    await setRun(day, { status: 'done', finishedAt: new Date().toISOString(), log: lines.slice() });
    return r;
  } catch (e: any) {
    log(`出错：${e?.message || e}`);
    await chain;
    await setRun(day, { status: 'failed', finishedAt: new Date().toISOString(), error: String(e?.message || e).slice(0, 500), log: lines.slice() });
    throw e;
  }
}

async function runDailyInner(opts: DailyOptions, day: string, log: (s: string) => void) {
  let model = opts.model;
  const tryModel = async <T,>(fn: (m: string) => Promise<T>): Promise<T> => {
    try { return await fn(model); }
    catch (e: any) {
      if (opts.fallbackModel && model !== opts.fallbackModel && BILLING.test(e?.message || '')) {
        log(`${model} 额度用完，改用 ${opts.fallbackModel}`);
        model = opts.fallbackModel;
        return fn(model);
      }
      throw e;
    }
  };

  // 1. 归一
  const aliasAdded = await tryModel(m => normalizeCompanyIndustries(m));
  log(`企业行业写法新归一 ${aliasAdded} 种`);

  // 2. 站内前瞻：在招校招经理 / 雇主品牌 / 校园大使、社招应届可投、主办 / 冠名学生比赛
  const leadCampus = await campusRecruiterLeads();
  const leadEntry = await entryLevelLeads();
  const leadComp = await competitionLeads();
  const leads = leadCampus + leadEntry + leadComp;
  log(`站内前瞻：校招经理 / 雇主品牌 / 校园大使 ${leadCampus} 家 · 社招应届可投 ${leadEntry} 家 · 主办学生比赛 ${leadComp} 家`);

  // 3. 联网前瞻
  const web: Record<string, any[]> = {};
  const onboarded: { id: number; name: string; probe: string }[] = [];
  const skipped: string[] = [];
  if (opts.scanWeb !== false) {
    // 每个探针有自己的间隔（宣讲会 / 融资天天扫，就业报告一个月一次）：上次扫过且没到间隔就跳过
    const { data: past } = await supabaseAdmin.from('flywheel_days').select('day, web').gte('day', shanghaiDay(Date.now() - 60 * DAY)).lt('day', day).order('day', { ascending: false });
    const lastRun = new Map<string, string>();
    for (const d of past || []) for (const k of Object.keys(d.web || {})) if (!lastRun.has(k)) lastRun.set(k, d.day);
    const due = WEB_PROBES.filter(p => {
      const last = lastRun.get(p.key);
      const ok = opts.forceAll || !last || (Date.parse(day) - Date.parse(last)) / DAY >= p.every;
      if (!ok) skipped.push(`${p.label}（${last} 扫过，每 ${p.every} 天一次）`);
      return ok;
    });
    if (skipped.length) log(`没到间隔、这次跳过：${skipped.join('；')}`);
    // 三个一组并行扫，一轮控制在几分钟
    for (let i = 0; i < due.length; i += 3) {
      await Promise.all(due.slice(i, i + 3).map(async p => {
        try {
          const items = await tryModel(m => scanProbe(p.key, p.ask.replace(/\{today\}/g, day), m));
          web[p.key] = items;
          for (const it of items) {
            let company_id: number | null = null;
            if (it.company) {
              if (p.onboard) {
                const r = await resolveLooseOrCreateCompany(it.company).catch(() => ({ id: null, created: false }));
                company_id = r.id;
                if (r.id && r.created) onboarded.push({ id: r.id, name: it.company, probe: p.key });
              } else {
                company_id = await resolveCompanyLoose(it.company).catch(() => null);
              }
            }
            await logDemand({
              source: `web_${p.key}`, actor: 'flywheel',
              query: [it.company, it.detail].filter(Boolean).join('｜'),
              company_id, company_name: it.company || null,
              industry: (INDUSTRIES as readonly string[]).includes(it.industry) ? it.industry : null,
              job_function: (JOB_FUNCTIONS as readonly string[]).includes(it.job_function) ? it.job_function : null,
              profession: it.profession || null,
              meta: { url: it.url || null, date: it.date || null, city: it.city || null, school: it.school || null, probe: p.key, day },
            });
          }
          log(`联网「${p.label}」${items.length} 条`);
        } catch (e: any) {
          if (BILLING.test(e?.message || '')) throw e;
          log(`联网「${p.label}」失败：${e?.message}`);
          web[p.key] = [];
        }
      }));
    }
  }

  // 新信号归一（含刚扫到的）
  const norm = await tryModel(m => normalizePending(m, 600));
  log(`信号归一 ${norm.done} 条`);

  // 4. 热度 / 供给 / 缺口
  const board = await computeBoard();
  const gaps = [
    ...top(board.dims.company, 30).map(r => gapOf('company', r)),
    ...top(board.dims.industry, 8).map(r => gapOf('industry', r)),
    ...top(board.dims.job_function, 8).map(r => gapOf('job_function', r)),
    ...top(board.dims.career_family, 6).map(r => gapOf('career_family', r)),
  ];

  // 5. 排产
  const actions = opts.plan === false ? [] : await planTasks(day, board, onboarded, model, log);

  const stats = {
    totals: board.totals,
    onboarded: onboarded.length,
    leads,
    leadsDetail: { campus: leadCampus, entry: leadEntry, competition: leadComp },
    skippedProbes: skipped,
    normalized: norm.done,
    aliasAdded,
    top: {
      industry: board.dims.industry.slice(0, 5).map(r => ({ key: r.key, heat30: r.heat30 })),
      job_function: board.dims.job_function.slice(0, 5).map(r => ({ key: r.key, heat30: r.heat30 })),
      company: board.dims.company.slice(0, 5).map(r => ({ key: r.label, heat30: r.heat30 })),
    },
  };
  const { data: prev } = await supabaseAdmin.from('flywheel_days').select('stats').eq('day', day).maybeSingle();
  await supabaseAdmin.from('flywheel_days').upsert({
    day, stats: { ...stats, run: (prev?.stats as any)?.run }, gaps, actions, model_id: model, updated_at: new Date().toISOString(),
    web: Object.fromEntries(Object.entries(web).map(([k, v]) => [k, v.slice(0, 40)])),
  }, { onConflict: 'day' });
  log(`完成：缺口 ${gaps.length} 个，排产 ${actions.length} 个任务，新盘进企业 ${onboarded.length} 家`);
  return { day, stats, gaps, actions, onboarded };
}

const top = (rows: BoardRow[], n: number) => rows.filter(r => r.gap > 0 && r.reasons.length).sort((a, b) => b.gap - a.gap).slice(0, n);
const gapOf = (dim: string, r: BoardRow) => ({ dim, key: r.key, label: r.label, heat30: r.heat30, heat7: r.heat7, gap: r.gap, supply: r.supply, reasons: r.reasons, tags: r.tags || [] });

/** 一个联网探针：返回 [{ company, detail, url, date, city, school, industry, job_function, profession }] */
async function scanProbe(key: string, ask: string, model: string): Promise<any[]> {
  const prompt = `${ask}

规则：
1. 只要能在搜索结果里看到出处的真实事件，每条给出处链接 url（新闻 / 高校就业网 / 企业官网 / 官方公众号文章），没出处的不要。
2. company 写企业或机构的全称（中文优先）；同一家只写一条，合并信息。
3. industry 只能取：${INDUSTRIES.join(' / ')}；job_function 只能取：${JOB_FUNCTIONS.join(' / ')}；对不上就 null。
4. detail 一句话中文（40 字内），说清发生了什么。
5. 尽量给 15–30 条。

返回 JSON：{ "items": [{ "company": "", "detail": "", "url": "", "date": "YYYY-MM-DD", "city": "", "school": "", "industry": null, "job_function": null, "profession": null }] }`;
  const { parsed } = await searchJson(prompt, model, { tool_name: 'flywheel', task_name: `Scan · ${key}`, institution: '' });
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return items
    .filter((x: any) => x && (x.company || x.detail))
    .map((x: any) => ({ ...x, company: typeof x.company === 'string' && isEmployer(x.company) ? x.company.trim().slice(0, 100) : null, profession: cleanProfession(x.profession), detail: String(x.detail || '').slice(0, 200) }))
    .filter((x: any) => x.company || x.profession || key === 'trend')
    .slice(0, 40);
}

/** 站内前瞻：社招在招校园招聘 / 雇主品牌岗位的企业，两周内同一家只记一次 */
async function campusRecruiterLeads(): Promise<number> {
  const { data } = await supabaseAdmin.from('jobs').select('company_id, name, source_url')
    .eq('status', 'open').not('company_id', 'is', null)
    .or('name.ilike.%校园招聘%,name.ilike.%校招%,name.ilike.%雇主品牌%,name.ilike.%校园大使%,name.ilike.%campus recruit%,name.ilike.%university relations%,name.ilike.%early career%')
    .limit(500);
  const byCo = new Map<number, any>();
  for (const j of data || []) if (!byCo.has(j.company_id)) byCo.set(j.company_id, j);
  if (!byCo.size) return 0;
  const { data: had } = await supabaseAdmin.from('demand_signals').select('company_id')
    .eq('source', 'lead_campus_recruiter').gte('created_at', new Date(Date.now() - 14 * DAY).toISOString()).in('company_id', [...byCo.keys()]);
  const skip = new Set((had || []).map(r => r.company_id));
  let n = 0;
  for (const [cid, j] of byCo) {
    if (skip.has(cid)) continue;
    await logDemand({ source: 'lead_campus_recruiter', actor: 'flywheel', company_id: cid, query: `在招「${j.name}」`, job_function: '人力资源', meta: { url: j.source_url } });
    n++;
  }
  return n;
}

/** 站内前瞻：社招里「应届可投 / 经验不限」的岗位多的企业（≥ 2 个），两周内同一家只记一次 */
async function entryLevelLeads(): Promise<number> {
  const { data } = await selectAll(() => supabaseAdmin.from('jobs').select('company_id, name, seniority, exp_years, job_type')
    .eq('status', 'open').eq('job_type', 'full_time').not('company_id', 'is', null).or('seniority.eq.entry,exp_years.eq.0').order('id'));
  const byCo = new Map<number, string[]>();
  for (const j of data as any[]) byCo.set(j.company_id, [...(byCo.get(j.company_id) || []), j.name]);
  const hits = [...byCo].filter(([, names]) => names.length >= 2);
  if (!hits.length) return 0;
  const { data: had } = await supabaseAdmin.from('demand_signals').select('company_id')
    .eq('source', 'lead_entry_level').gte('created_at', new Date(Date.now() - 14 * DAY).toISOString()).in('company_id', hits.map(h => h[0]));
  const skip = new Set((had || []).map(r => r.company_id));
  let n = 0;
  for (const [cid, names] of hits) {
    if (skip.has(cid)) continue;
    await logDemand({ source: 'lead_entry_level', actor: 'flywheel', company_id: cid, query: `社招 ${names.length} 个岗位应届可投（${names.slice(0, 3).join('、')}）` });
    n++;
  }
  return n;
}

/** 站内前瞻：赛事库里报名中 / 即将开放、由企业主办或冠名的学生比赛，30 天内同一家只记一次 */
async function competitionLeads(): Promise<number> {
  const { data } = await supabaseAdmin.from('competitions').select('organizer_company_id, organizer, name, status, sponsor_tier, source_url')
    .not('organizer_company_id', 'is', null).in('status', ['open', 'upcoming']).limit(1000);
  const byCo = new Map<number, any>();
  for (const c of data || []) if (c.sponsor_tier !== 'university' && !byCo.has(c.organizer_company_id)) byCo.set(c.organizer_company_id, c);
  if (!byCo.size) return 0;
  const { data: had } = await supabaseAdmin.from('demand_signals').select('company_id')
    .eq('source', 'lead_competition').gte('created_at', new Date(Date.now() - 30 * DAY).toISOString()).in('company_id', [...byCo.keys()]);
  const skip = new Set((had || []).map(r => r.company_id));
  let n = 0;
  for (const [cid, c] of byCo) {
    if (skip.has(cid)) continue;
    await logDemand({ source: 'lead_competition', actor: 'flywheel', company_id: cid, query: `主办「${c.name}」`, meta: { url: c.source_url } });
    n++;
  }
  return n;
}

/** 排产：建草稿任务。最近 7 天飞轮排过的企业不重复排 */
async function planTasks(day: string, board: Awaited<ReturnType<typeof computeBoard>>, onboarded: { id: number; name: string; probe: string }[], model: string, log: (s: string) => void) {
  const since7 = new Date(Date.now() - 7 * DAY).toISOString();
  const recentIds = new Set<number>();
  const { data: jt } = await supabaseAdmin.from('job_tasks').select('id').eq('created_by', 'flywheel').gte('created_at', since7);
  if (jt?.length) { const { data } = await selectAll(() => supabaseAdmin.from('job_crawl_logs').select('company_id').in('task_id', jt.map(t => t.id)).order('id')); for (const r of data as any[]) if (r.company_id) recentIds.add(r.company_id); }
  const recentProfile = new Set<number>();
  const { data: ct } = await supabaseAdmin.from('company_tasks').select('id').eq('created_by', 'flywheel').gte('created_at', since7);
  if (ct?.length) { const { data } = await selectAll(() => supabaseAdmin.from('company_crawl_logs').select('company_id').in('task_id', ct.map(t => t.id)).order('id')); for (const r of data as any[]) if (r.company_id) recentProfile.add(r.company_id); }

  const comp = board.compById;
  const recrawl = new Map<number, string>();   // company_id → 原因
  const profile = new Map<number, string>();

  // a. 热门企业
  for (const r of board.dims.company.filter(r => r.gap > 0).sort((a, b) => b.gap - a.gap)) {
    const id = Number(r.supply.id) || null;
    if (!id) continue;
    const c = comp.get(id);
    const why = `近 30 天热度 ${r.heat30}：${r.reasons.join('、')}`;
    if ((c.campus_url || c.careers_url) && (!c._openJobs || (r.supply.staleDays as number) > 7)) { if (recrawl.size < 20 && !recentIds.has(id)) recrawl.set(id, why); }
    else if ((!c.campus_url && !c.careers_url) || (c.completeness_score ?? 0) < 60) { if (profile.size < 30 && !recentProfile.has(id)) profile.set(id, why); }
  }
  // b. 联网新盘进来的企业：先补画像（含招聘入口）
  for (const o of onboarded) if (profile.size < 40 && !recentProfile.has(o.id) && !profile.has(o.id)) profile.set(o.id, `联网前瞻「${o.probe}」新盘进库`);
  // c. 热门行业：行业里数据薄的企业（大企业优先）
  const hotInd = board.dims.industry.filter(r => r.heat7 > 0 && r.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3);
  for (const ind of hotInd) {
    const pool = [...comp.values()].filter((c: any) => c._industry === ind.key)
      .sort((a: any, b: any) => (b.fortune_global_rank ? 1 : 0) - (a.fortune_global_rank ? 1 : 0) || (b.company_employees || 0) - (a.company_employees || 0));
    let a = 0, b = 0;
    for (const c of pool as any[]) {
      if ((c.campus_url || c.careers_url) && !c._openJobs && a < 5 && !recentIds.has(c.id) && !recrawl.has(c.id) && recrawl.size < 35) { recrawl.set(c.id, `热门行业「${ind.key}」（热度 ${ind.heat30}）里还没有在招岗位`); a++; }
      else if (!c.campus_url && !c.careers_url && b < 5 && !recentProfile.has(c.id) && !profile.has(c.id) && profile.size < 50) { profile.set(c.id, `热门行业「${ind.key}」（热度 ${ind.heat30}）里还没有招聘入口`); b++; }
    }
  }

  const actions: any[] = [];
  if (recrawl.size) {
    const urls: any[] = [];
    for (const [id, why] of recrawl) {
      const c = comp.get(id);
      for (const u of [c.campus_url, c.careers_url]) if (u && !urls.some(x => x.target_url === u)) urls.push({ id, name: c.name, target_url: u, why });
    }
    const { data: task, error } = await supabaseAdmin.from('job_tasks').insert({
      name: `飞轮排产 · ${day} · 热门企业岗位重抓`, status: 'draft', scope: 'campus', model_id: model, created_by: 'flywheel',
      notes: `需求飞轮按近 30 天热度排的：${recrawl.size} 家热门企业岗位为空或超过 7 天没刷新。每家原因见日志的「提示」。`,
    }).select('id, name').single();
    if (!error && task) {
      await supabaseAdmin.from('job_crawl_logs').insert(urls.map(u => ({ task_id: task.id, target_url: u.target_url, company: u.name, company_id: u.id, hint: u.why.slice(0, 300), fetcher_status: 'pending', structurer_status: 'pending', raw_markdown: '', markdown_len: 0, model_id: model })));
      actions.push({ kind: 'job_task', task_id: task.id, name: task.name, count: urls.length, companies: recrawl.size, reason: '热门企业岗位为空或过期' });
      log(`排产：${task.name}（${urls.length} 个页面）`);
    }
  }
  if (profile.size) {
    const { data: task, error } = await supabaseAdmin.from('company_tasks').insert({
      name: `飞轮排产 · ${day} · 热门企业补画像`, status: 'draft', topics: ['basic', 'campus'], skip_filled: true, model_id: model, created_by: 'flywheel',
      notes: `需求飞轮排的：热门但缺招聘入口 / 画像不全的企业，以及联网前瞻（宣讲会、融资、校企合作、扩张、新开校招站）新盘进库的企业。只跑缺的。`,
    }).select('id, name').single();
    if (!error && task) {
      const ids = [...profile.keys()];
      const { data: cs } = await supabaseAdmin.from('companies').select('id, name').in('id', ids);
      await supabaseAdmin.from('company_crawl_logs').insert((cs || []).map(c => ({ task_id: task.id, company_id: c.id, company: c.name, status: 'pending' })));
      actions.push({ kind: 'company_task', task_id: task.id, name: task.name, count: cs?.length || 0, reason: '热门 / 新盘进的企业缺招聘入口或画像' });
      log(`排产：${task.name}（${cs?.length || 0} 家）`);
    }
  }
  // 职业领域的缺口不自动生成空间（要出图、花钱），留在看板上给人决定
  return actions;
}
