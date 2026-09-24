/**
 * 企业画像批跑（服务端驱动，直接复用前端的流水线编排 runCompanyProfile）
 *
 *   npx tsx scripts/run-profiles.mts --task <taskId> [--minutes 14] [--concurrency 3] [--model gpt-5.6-luna]
 *
 * - 只处理该任务里 status != success 的条目；每条跑完立即落库，可随时中断重跑
 * - --minutes 到时后不再领新条目，等在跑的跑完就退出（配合外层每轮播报进度）
 * - 通过 BASE_URL（默认 http://localhost:3003）+ AUTH_TOKEN（auth_token cookie）调平台接口
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length));
const TASK = args.task;
const MINUTES = parseFloat(args.minutes || '14');
const CONC = parseInt(args.concurrency || '6');
const MODEL = args.model || 'gpt-5.6-luna';
const BASE = process.env.BASE_URL || 'http://localhost:3003';
const TOKEN = process.env.AUTH_TOKEN || fs.readFileSync(process.env.TOKEN_FILE || path.join(process.cwd(), '.preview-token'), 'utf8').trim();
if (!TASK) { console.error('need --task'); process.exit(1); }

// 让前端编排代码里的相对路径 fetch 打到平台，并带上登录态
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init: any = {}) => {
  const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input;
  const headers = { ...(init.headers || {}), cookie: `auth_token=${TOKEN}` };
  return realFetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(290_000) });
}) as any;

const { runCompanyProfile } = await import('../src/lib/company-pipeline-client');

const api = async (p: string) => (await realFetch(BASE + p, { headers: { cookie: `auth_token=${TOKEN}` } })).json();
const patchTask = (body: any) => realFetch(BASE + '/api/admin/company-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: `auth_token=${TOKEN}` }, body: JSON.stringify(body) });

const tasks = await api('/api/admin/company-tasks');
const task = (tasks.tasks || []).find((t: any) => t.id === TASK);
if (!task) { console.error('task not found'); process.exit(1); }
const queue: any[] = task.items.filter((i: any) => i.status !== 'success');
const startedAt = Date.now();
const deadline = startedAt + MINUTES * 60_000;
console.log(`[${new Date().toISOString()}] task=${task.name} pending=${queue.length}/${task.items.length} model=${MODEL} conc=${CONC} window=${MINUTES}min`);
await patchTask({ id: TASK, status: 'running' });

let ok = 0, bad = 0, aborted = 0;
const results: string[] = [];
async function worker(n: number) {
  while (queue.length && Date.now() < deadline) {
    const it = queue.shift()!;
    const t0 = Date.now();
    try {
      const r = await runCompanyProfile({ id: it.id, company_id: it.company_id, company: it.company }, { model: MODEL, skipFilled: true, topicConcurrency: 7 }, {
        onEvents: () => {}, onMarkdown: () => {}, onData: () => {}, waitIfPaused: async () => true,
      });
      const secs = Math.round((Date.now() - t0) / 1000);
      if (r.status === 'success') {
        ok++;
        const a = r.applied || {};
        results.push(`✅ ${it.company} ${secs}s 字段+${a.filled?.length || 0} 融资${a.financings_saved || 0}/动态${a.news_saved || 0}/高管${a.executives_saved || 0}/产品${a.products_saved || 0} 完整度${a.completeness_before ?? '-'}→${a.completeness_after ?? '-'} $${Number(a.cost_usd || 0).toFixed(3)}`);
      } else if (r.status === 'failed') { bad++; results.push(`❌ ${it.company} ${secs}s ${r.error}`); }
      else { aborted++; results.push(`⏹ ${it.company}`); }
    } catch (e: any) { bad++; results.push(`❌ ${it.company} 异常 ${e.message}`); }
    console.log(`[w${n}] ${results[results.length - 1]}`);
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, (_, i) => worker(i + 1)));

const after = await api('/api/admin/company-tasks');
const t2 = (after.tasks || []).find((t: any) => t.id === TASK);
const p = t2.progress;
const done = p.pending === 0 && p.running === 0;
await patchTask({ id: TASK, status: done ? (p.failed === p.total ? 'failed' : 'completed') : 'draft' });
console.log(`\n=== 本轮 ${Math.round((Date.now() - startedAt) / 60000)} 分钟：成功 ${ok} 失败 ${bad} 中断 ${aborted}`);
console.log(`=== 任务累计：${p.completed}/${p.total} 完成，失败 ${p.failed}，待处理 ${p.pending}，费用 $${t2.cost_usd.toFixed(3)}${done ? '，任务已完成' : ''}`);
