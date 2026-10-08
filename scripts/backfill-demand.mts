/**
 * 把已有的使用记录回填成需求信号（飞轮上线前的历史），可重复跑：先删掉上次回填的再写。
 *   npx tsx scripts/backfill-demand.mts            # 回填
 *   npx tsx scripts/backfill-demand.mts --normalize --model=gpt-5.6-luna   # 回填后顺手用模型归一
 *
 * 来源：lab 职业空间（lab_space）、lab「问问我」的问题（lab_problem）、画像 / 岗位任务点名的企业（company_task / job_task）、
 *      赛事雷达检索（competition_search）、导出下载（download）。
 * 批量任务（一次点名几十上百家）是数据部门铺量，不全是「在意」：超过 20 家的任务每家只算 0.2 分。
 * 补跑脚本（rerun-*）和飞轮自己排的任务不算。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { logDemand } = await import('../src/lib/flywheel/signals');
const { normalizeCompanyIndustries, normalizePending } = await import('../src/lib/flywheel/normalize');

const MODEL = process.argv.find(a => a.startsWith('--model='))?.slice(8) || 'gemini-3.8-flash';
const ts = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const SKIP_BY = /^(rerun|flywheel)/;

const { error: delErr, count } = await supabaseAdmin.from('demand_signals').delete({ count: 'exact' }).eq('meta->>backfill', 'true');
if (delErr) throw delErr;
console.log(`[${ts()}] 删掉上次回填的 ${count || 0} 条`);
let n = 0;
const put = async (x: Parameters<typeof logDemand>[0]) => { await logDemand({ ...x, meta: { ...(x.meta || {}), backfill: 'true' } }); n++; };

// lab 职业空间
const { data: spaces } = await selectAll(() => supabaseAdmin.from('skill_tasks').select('id, jd_snapshot, created_by, created_at').order('created_at'));
for (const t of spaces as any[]) {
  const jd = t.jd_snapshot || {};
  const prof = jd.career?.profession || jd.title || '';
  if (!prof) continue;
  await put({ source: 'lab_space', query: [jd.company, prof].filter(Boolean).join(' '), profession: prof, company_name: jd.company || null, actor: t.created_by || null, created_at: t.created_at, meta: { space: t.id } });
}
console.log(`[${ts()}] lab 职业空间 ${spaces.length}`);

// lab「问问我」的问题
const { data: invs } = await selectAll(() => supabaseAdmin.from('skill_invocations').select('input, actor, occurred_at, is_demo, kind').eq('kind', 'solve').order('occurred_at'));
let k = 0;
for (const v of invs as any[]) { if (v.is_demo || !v.input) continue; await put({ source: 'lab_problem', query: String(v.input).slice(0, 600), actor: v.actor || null, created_at: v.occurred_at }); k++; }
console.log(`[${ts()}] lab 问题 ${k}`);

// 画像 / 岗位任务点名的企业
for (const [taskTable, logTable, source] of [['company_tasks', 'company_crawl_logs', 'company_task'], ['job_tasks', 'job_crawl_logs', 'job_task']] as const) {
  const { data: tasks } = await selectAll(() => supabaseAdmin.from(taskTable).select('id, created_by, created_at').order('created_at'));
  let m = 0;
  for (const t of tasks as any[]) {
    if (SKIP_BY.test(t.created_by || '')) continue;
    const { data: logs } = await selectAll(() => supabaseAdmin.from(logTable).select('company_id').eq('task_id', t.id).order('id'));
    const ids = [...new Set((logs as any[]).map(l => l.company_id).filter(Boolean))];
    const w = ids.length > 20 ? 0.2 : 1;
    for (const id of ids) { await put({ source, company_id: id, query: '', weight: w, actor: t.created_by || null, created_at: t.created_at, meta: { task: t.id, bulk: ids.length > 20 } }); m++; }
  }
  console.log(`[${ts()}] ${source} ${m}`);
}

// 赛事雷达检索
const { data: comps } = await selectAll(() => supabaseAdmin.from('competition_searches').select('query, company, company_id, created_by, created_at').order('created_at'));
for (const c of comps as any[]) if (c.query || c.company) await put({ source: 'competition_search', query: c.query || c.company, company_id: c.company_id, company_name: c.company, actor: c.created_by || null, created_at: c.created_at });
console.log(`[${ts()}] 赛事检索 ${comps.length}`);

// 导出下载（带筛选条件的）
const { data: dls } = await selectAll(() => supabaseAdmin.from('download_logs').select('email, target, params, created_at').order('created_at'));
let d = 0;
for (const x of dls as any[]) {
  const p = x.params || {};
  const q = [p.search, p.industry, p.jobType && `岗位类型 ${p.jobType}`].filter(Boolean).join(' ');
  if (!q && !p.companyId) continue;
  await put({ source: 'download', query: q, company_id: Number(p.companyId) || null, actor: x.email, created_at: x.created_at, meta: { target: String(x.target).slice(0, 200) } });
  d++;
}
console.log(`[${ts()}] 下载 ${d}`);
console.log(`[${ts()}] 回填 ${n} 条`);

if (process.argv.includes('--normalize')) {
  console.log(`[${ts()}] 企业行业写法归一：新增 ${await normalizeCompanyIndustries(MODEL)} 种`);
  for (let i = 0; i < 20; i++) {
    const r = await normalizePending(MODEL, 400);
    console.log(`[${ts()}] 信号归一 ${r.done} 条`);
    if (r.done < 400) break;
  }
}
