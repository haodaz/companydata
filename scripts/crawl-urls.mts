/**
 * 指定几个网址抓岗位（建一个岗位任务，日志和结果在「校招岗位提取」里能看到）：
 *   npx tsx scripts/crawl-urls.mts --name "补抓 · 1009 反馈" --scope all \
 *     "好未来|https://job.tal.com/campus/positions?tag_ids=15&tag_ids=16" "vivo|https://hr.vivo.com/jobs"
 * 每个参数是「企业名|网址」；企业名按库里匹配（对不上会自动建档）。--model 默认 gemini-3.8-flash（简单活本来就走便宜模型）。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { resolveOrCreateCompany } = await import('../src/lib/company-match');
const { fetchBaseAndLinks, fetchAndEvaluateBatch } = await import('../src/lib/agents/fetcher');
const { structureJobData } = await import('../src/lib/agents/structurer-job');
const { upsertJobsFromLog } = await import('../src/lib/job-store');

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const NAME = opt('name', `补抓 · ${new Date().toISOString().slice(0, 10)}`), SCOPE = opt('scope', 'campus') as 'campus' | 'all', MODEL = opt('model', 'gemini-3.8-flash');
const items = argv.filter((a, i) => a.includes('|') && !argv[i - 1]?.startsWith('--')).map(a => { const [company, url] = a.split('|'); return { company: company.trim(), url: url.trim() }; });
if (!items.length) { console.error('给我「企业名|网址」'); process.exit(1); }

const { data: task, error } = await supabaseAdmin.from('job_tasks').insert({ name: NAME, scope: SCOPE, model_id: MODEL, created_by: 'crawl-urls', status: 'running' }).select('id').single();
if (error) throw error;
let total = 0;
for (const it of items) {
  const company_id = await resolveOrCreateCompany(it.company);
  const { data: log } = await supabaseAdmin.from('job_crawl_logs').insert({ task_id: task.id, target_url: it.url, company: it.company, company_id, hint: '', fetcher_status: 'running', structurer_status: 'pending', raw_markdown: '', markdown_len: 0, model_id: MODEL }).select('id').single();
  const patch = (u: Record<string, any>) => supabaseAdmin.from('job_crawl_logs').update({ ...u, updated_at: new Date().toISOString() }).eq('id', log!.id);
  const t0 = Date.now(), batchId = Date.now();
  try {
    const init = await fetchBaseAndLinks(it.url, MODEL, batchId, '', SCOPE);
    if (!init.success) throw new Error(init.error_message || '页面抓取失败');
    let md = init.base_markdown; const sub: string[] = [];
    for (let k = 0; k < init.candidate_urls.length; k += 3) { const b = await fetchAndEvaluateBatch(init.candidate_urls.slice(k, k + 3), MODEL, batchId).catch(() => null); if (b?.success) { md += b.useful_markdown; sub.push(...b.useful_urls); } }
    const r = await structureJobData(md, it.company, '', MODEL, batchId, SCOPE);
    if (!r) throw new Error('结构化失败');
    const structured = { ...r, pipeline_log: [{ key: 'crawl-urls', title: '指定网址补抓', status: 'success', color: 'green' }] };
    await patch({ fetcher_status: 'success', structurer_status: 'success', raw_markdown: md.slice(0, 500000), markdown_len: md.length, sub_pages_fetched: sub, structured_json: structured, batch_id: batchId, error_message: null });
    const saved = await upsertJobsFromLog(log!.id, structured);
    await supabaseAdmin.from('job_crawl_logs').update({ pushed_to_db: saved > 0, jobs_saved: saved }).eq('id', log!.id);
    total += saved;
    console.log(`${it.company}　岗位 ${r.jobs.length}，入库 ${saved}，详情页 ${sub.length}，${Math.round((Date.now() - t0) / 1000)}s${/⚠/.test(r.ai_summary) ? '\n  ' + r.ai_summary.split('\n').filter(x => x.includes('⚠')).join(' ') : ''}`);
  } catch (e: any) {
    await patch({ fetcher_status: 'failed', error_message: e.message });
    console.log(`${it.company}　出错：${e.message}`);
  }
}
await supabaseAdmin.from('job_tasks').update({ status: 'completed' }).eq('id', task.id);
console.log(`完成：入库 ${total} 个岗位（任务 ${task.id}）`);
