/**
 * 跑一个已有的岗位任务（「校招岗位提取」里的草稿任务，如飞轮排产）：处理任务里还没成功的页面。
 *   npx tsx scripts/run-job-task.mts --task <taskId> --model qwen-plus [--par 4]
 * 抓主页 + 挑子页面 → 提炼 → 入库，和工具页同一套；每页跑完立即落库，可随时中断重跑。
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { fetchBaseAndLinks, fetchAndEvaluateBatch } = await import('@/lib/agents/fetcher');
const { structureJobData } = await import('@/lib/agents/structurer-job');
const { upsertJobsFromLog } = await import('@/lib/job-store');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TASK = opt('task');
const PAR = Number(opt('par', '4'));
const { data: task } = await db.from('job_tasks').select('id, name, scope, model_id').eq('id', TASK).single();
if (!task) { console.error('找不到任务'); process.exit(1); }
const MODEL = opt('model', task.model_id || '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const SCOPE = (task.scope || 'campus') as 'campus' | 'all';
const { data: logs } = await db.from('job_crawl_logs').select('id, target_url, company, company_id').eq('task_id', TASK).neq('structurer_status', 'success').order('id');
console.log(`${task.name}：待跑 ${logs?.length || 0} 个页面，模型 ${MODEL}`);
await db.from('job_tasks').update({ status: 'running', model_id: MODEL }).eq('id', TASK);

let next = 0, total = 0, ok = 0;
await Promise.all(Array.from({ length: PAR }, async () => {
  while (next < (logs || []).length) {
    const lg = logs![next++];
    const patch = (u: Record<string, any>) => db.from('job_crawl_logs').update({ ...u, model_id: MODEL, updated_at: new Date().toISOString() }).eq('id', lg.id);
    const t0 = Date.now(), batchId = Date.now() * 100 + (lg.id % 100);
    await patch({ fetcher_status: 'running' });
    try {
      const init = await fetchBaseAndLinks(lg.target_url, MODEL, batchId, '', SCOPE);
      if (!init.success) throw new Error(init.error_message || '页面抓取失败');
      let md = init.base_markdown; const sub: string[] = [];
      for (let k = 0; k < init.candidate_urls.length; k += 3) { const b = await fetchAndEvaluateBatch(init.candidate_urls.slice(k, k + 3), MODEL, batchId).catch(() => null); if (b?.success) { md += b.useful_markdown; sub.push(...b.useful_urls); } }
      const r = await structureJobData(md, lg.company, '', MODEL, batchId, SCOPE);
      if (!r) throw new Error('结构化失败');
      const structured = { ...r, pipeline_log: [{ key: 'run-job-task', title: '脚本跑任务', status: 'success', color: 'green' }] };
      await patch({ fetcher_status: 'success', structurer_status: 'success', raw_markdown: md.slice(0, 500000), markdown_len: md.length, sub_pages_fetched: sub, structured_json: structured, batch_id: batchId, error_message: null });
      const saved = r.jobs.length ? await upsertJobsFromLog(lg.id, structured) : 0;
      await db.from('job_crawl_logs').update({ pushed_to_db: saved > 0, jobs_saved: saved }).eq('id', lg.id);
      total += saved; ok++;
      console.log(`${lg.company}：岗位 ${r.jobs.length}，入库 ${saved}，详情页 ${sub.length}，${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e: any) {
      await patch({ fetcher_status: 'failed', error_message: String(e?.message || e).slice(0, 500) });
      console.log(`${lg.company}：出错 ${String(e?.message || e).slice(0, 100)}`);
    }
  }
}));
await db.from('job_tasks').update({ status: 'completed' }).eq('id', TASK);
console.log(`完成：成功 ${ok}/${logs?.length || 0} 页，入库 ${total} 个岗位`);
