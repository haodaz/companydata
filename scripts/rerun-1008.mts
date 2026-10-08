/**
 * 2026-10-08 数据部门反馈后的补跑：npx tsx scripts/rerun-1008.mts [a|b|all] [--conc=6] [--limit=N]
 *
 * A 招聘入口：缺「校园招聘官网」或「招聘总入口」、且人工没定论的企业，先爬官网导航、找不到再联网搜；
 *   只填空字段，找到的入口存进信息源库，刷新完整度。断点续跑：进度记在 scripts/.rerun-1008-a.json。
 * B 岗位重抓：托管在 hotjob / moka / 飞书上的招聘页（信息源 + 企业入口字段 + 反馈点名的站点 + A 新找到的），
 *   建成「校招岗位提取」里一个正式任务，走修好的抓取 → 分批结构化 → 入库（同一来源页里这次没再出现的旧岗位标为已下线）。
 * 模型：gemini-3.8-flash。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { FROZEN_REVIEW_STATUSES } = await import('../src/lib/review-status');
const { refreshCompleteness } = await import('../src/lib/company-store');
const { discoverRecruitEntry } = await import('../src/lib/agents/recruit-entry');
const { fetchBaseAndLinks, fetchAndEvaluateBatch } = await import('../src/lib/agents/fetcher');
const { structureJobData } = await import('../src/lib/agents/structurer-job');
const { upsertJobsFromLog } = await import('../src/lib/job-store');

const MODEL = 'gemini-3.8-flash';
const phase = process.argv[2] || 'all';
const arg = (k: string, d: number) => Number((process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d);
const CONC = arg('conc', 6), LIMIT = arg('limit', 0);
const ts = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`超时 ${ms / 1000}s`)), ms))]);

// ─────────── A 招聘入口 ───────────
async function phaseA() {
  const PROG = 'scripts/.rerun-1008-a.json';
  const prog: Record<string, any> = fs.existsSync(PROG) ? JSON.parse(fs.readFileSync(PROG, 'utf8')) : {};
  const { data } = await selectAll(() => supabaseAdmin.from('companies').select('id, name, official_website, campus_url, careers_url, human_review_status').order('id'));
  let todo = data.filter((c: any) => !FROZEN_REVIEW_STATUSES.has(c.human_review_status || '') && (!c.campus_url || !c.careers_url) && !prog[c.id]);
  if (LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`[${ts()}] A 招聘入口：待处理 ${todo.length} 家（已完成 ${Object.keys(prog).length}），并发 ${CONC}`);
  const tally = { homepage: 0, search: 0, none: 0, error: 0, campus: 0, careers: 0 };
  let n = 0;
  const one = async (c: any) => {
    const t0 = Date.now();
    try {
      const r = await withTimeout(discoverRecruitEntry(c.name, c.official_website, MODEL), 300_000);
      const rows = [
        r.campus && { url: r.campus, type: 'campus', subtype: 'portal', title: '校园招聘' },
        r.intern && { url: r.intern, type: 'campus', subtype: 'intern', title: '实习生招聘' },
        r.social && { url: r.social, type: 'careers', subtype: 'portal', title: '社会招聘' },
        r.careers && r.careers !== r.social && { url: r.careers, type: 'careers', subtype: 'portal', title: '招聘总入口' },
      ].filter(Boolean) as any[];
      if (rows.length) {
        const via = r.via === 'homepage' ? '从官网导航找到' : '联网搜索找到';
        await supabaseAdmin.from('url_sources').upsert(rows.map(x => ({ company: c.name, company_id: c.id, unit: null, title: x.title, url: x.url, type: x.type, subtype: x.subtype, reasoning: `画像流水线「招聘入口」工序${via}的「${x.title}」链接。` })), { onConflict: 'company,url' });
      }
      const campus = r.campus || r.intern, careers = r.careers || r.social;
      let filled = 0;
      if (campus && !c.campus_url) { await supabaseAdmin.from('companies').update({ campus_url: campus }).eq('id', c.id).is('campus_url', null); filled++; tally.campus++; }
      if (careers && !c.careers_url) { await supabaseAdmin.from('companies').update({ careers_url: careers }).eq('id', c.id).is('careers_url', null); filled++; tally.careers++; }
      if (filled) await refreshCompleteness(c.id).catch(() => {});
      tally[r.via]++;
      prog[c.id] = { via: r.via, campus, careers, intern: r.intern, social: r.social };
      console.log(`[${ts()}] ${++n}/${todo.length} ${c.name}　${r.via}　${[r.campus && '校招', r.intern && '实习', r.social && '社招', r.careers && '总入口'].filter(Boolean).join('/') || '—'}　${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e: any) {
      tally.error++;
      console.log(`[${ts()}] ${++n}/${todo.length} ${c.name}　出错：${e.message}`);
    }
    if (n % 10 === 0) fs.writeFileSync(PROG, JSON.stringify(prog));
    if (n % 25 === 0) console.log(`[${ts()}] ── 小结 ${n}/${todo.length}：官网导航 ${tally.homepage} · 联网搜索 ${tally.search} · 没找到 ${tally.none} · 出错 ${tally.error}｜新填校招官网 ${tally.campus} · 招聘总入口 ${tally.careers}`);
  };
  for (let i = 0; i < todo.length; i += CONC) await Promise.all(todo.slice(i, i + CONC).map(one));
  fs.writeFileSync(PROG, JSON.stringify(prog));
  console.log(`[${ts()}] ══ A 完成：官网导航 ${tally.homepage} · 联网搜索 ${tally.search} · 没找到 ${tally.none} · 出错 ${tally.error}｜新填校招官网 ${tally.campus} · 招聘总入口 ${tally.careers}`);
}

// ─────────── B 招聘平台岗位重抓 ───────────
async function phaseB() {
  const PLAT = /hotjob\.cn|mokahr\.com|jobs\.feishu\.cn/i;
  const urls = new Map<string, { url: string; company: string; company_id: number | null }>();
  const add = (url: string, company: string, company_id: number | null) => { if (url && PLAT.test(url) && !urls.has(url)) urls.set(url, { url, company, company_id }); };
  const { data: us } = await selectAll(() => supabaseAdmin.from('url_sources').select('url, type, company, company_id').order('id'));
  for (const u of us) if (['campus', 'careers', 'job'].includes(u.type)) add(u.url, u.company, u.company_id);
  const { data: cos } = await selectAll(() => supabaseAdmin.from('companies').select('id, name, campus_url, careers_url').order('id'));
  for (const c of cos) { add(c.campus_url, c.name, c.id); add(c.careers_url, c.name, c.id); }
  const byName = (n: string) => cos.find((c: any) => c.name === n);
  for (const [url, name] of [
    ['https://app.mokahr.com/campus-recruitment/empyrean/116100#/jobs', '华大九天'],
    ['https://wecruit.hotjob.cn/SU601778b25d83dc072073230a/pb/school.html', '立讯精密'],
    ['https://uq1h428xyc.jobs.feishu.cn/index', '蓝箭航天'],
    ['https://uq1h428xyc.jobs.feishu.cn/522146', '蓝箭航天'],
    ['https://wecruit.hotjob.cn/SU6419745cbef57c635fe10142/pb/index.html', '华泰证券'],
    ['https://wecruit.hotjob.cn/SU6013d14e5d83dc11e4a8ae4d/pb/social.html', '华泰证券'],
  ] as [string, string][]) add(url, byName(name)?.name || name, byName(name)?.id ?? null);
  // 本次补跑里已经抓成功的页面不再抓（A 跑完后再跑一轮 B，只抓 A 新找到的平台页面）
  const { data: doneTasks } = await supabaseAdmin.from('job_tasks').select('id').eq('created_by', 'rerun-1008');
  const doneUrls = new Set<string>();
  if (doneTasks?.length) {
    const { data: dl } = await supabaseAdmin.from('job_crawl_logs').select('target_url').in('task_id', doneTasks.map((t: any) => t.id)).eq('structurer_status', 'success').gt('jobs_saved', 0);
    for (const r of dl || []) doneUrls.add(r.target_url);
  }
  const list = [...urls.values()].filter(u => !doneUrls.has(u.url));
  if (doneUrls.size) console.log(`[${ts()}] 跳过本次补跑里已抓到岗位的 ${doneUrls.size} 个页面`);
  console.log(`[${ts()}] B 岗位重抓：${list.length} 个招聘平台页面`);
  if (!list.length) return;

  const { data: task, error: te } = await supabaseAdmin.from('job_tasks').insert({ name: '补跑 · 招聘平台岗位（2026-10-08 反馈后）', notes: 'hotjob / moka / 飞书 招聘站用修好的抓取重跑：POST 渲染、前端路由、hotjob 接口、飞书一次列全、分批结构化。', model_id: MODEL, scope: 'all', created_by: 'rerun-1008', status: 'running' }).select().single();
  if (te) throw te;
  const { data: logs, error: le } = await supabaseAdmin.from('job_crawl_logs').insert(list.map(u => ({ task_id: task.id, target_url: u.url, company: u.company, company_id: u.company_id, hint: '', fetcher_status: 'pending', structurer_status: 'pending', raw_markdown: '', markdown_len: 0, model_id: MODEL }))).select('id, target_url, company');
  if (le) throw le;
  console.log(`[${ts()}] 已建任务「${task.name}」（${task.id}），${logs.length} 个页面`);

  let total = 0;
  const one = async (log: any, i: number) => {
    const t0 = Date.now(), batchId = Date.now() + i;
    const patch = (u: Record<string, any>) => supabaseAdmin.from('job_crawl_logs').update({ ...u, updated_at: new Date().toISOString() }).eq('id', log.id);
    try {
      await patch({ fetcher_status: 'running' });
      const init = await fetchBaseAndLinks(log.target_url, MODEL, batchId, '', 'all');
      if (!init.success) throw new Error(init.error_message || '页面抓取失败');
      let md = init.base_markdown; const sub: string[] = [];
      for (let k = 0; k < init.candidate_urls.length; k += 3) {
        const b = await fetchAndEvaluateBatch(init.candidate_urls.slice(k, k + 3), MODEL, batchId).catch(() => null);
        if (b?.success) { md += b.useful_markdown; sub.push(...b.useful_urls); }
      }
      const r = await structureJobData(md, log.company || '', '', MODEL, batchId, 'all');
      if (!r) { await patch({ fetcher_status: 'success', structurer_status: 'failed', raw_markdown: md.slice(0, 500000), markdown_len: md.length, sub_pages_fetched: sub, error_message: '大模型未能返回有效的结构化结果' }); throw new Error('结构化失败'); }
      const structured = { ...r, pipeline_log: [{ key: 'rerun', title: '补跑脚本 rerun-1008', status: 'success', color: 'green' }] };
      await patch({ fetcher_status: 'success', structurer_status: 'success', raw_markdown: md.slice(0, 500000), markdown_len: md.length, sub_pages_fetched: sub, model_id: MODEL, batch_id: batchId, structured_json: structured, error_message: null });
      const saved = await upsertJobsFromLog(log.id, structured);
      await supabaseAdmin.from('job_crawl_logs').update({ pushed_to_db: saved > 0, jobs_saved: saved }).eq('id', log.id);
      total += saved;
      console.log(`[${ts()}] ${log.company}　${log.target_url}\n           岗位 ${r.jobs.length}，入库 ${saved}，详情页 ${sub.length}，${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e: any) {
      await patch({ fetcher_status: 'failed', error_message: e.message });
      console.log(`[${ts()}] ${log.company}　${log.target_url}　出错：${e.message}`);
    }
  };
  for (let i = 0; i < logs.length; i += 2) await Promise.all(logs.slice(i, i + 2).map((l: any, k: number) => one(l, i + k)));
  await supabaseAdmin.from('job_tasks').update({ status: 'completed' }).eq('id', task.id);
  console.log(`[${ts()}] ══ B 完成：共入库 ${total} 个岗位`);
}

if (phase === 'a' || phase === 'all') await phaseA();
if (phase === 'b' || phase === 'all') await phaseB();
console.log(`[${ts()}] ══ 全部完成 ══`);
