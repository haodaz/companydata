/**
 * 难爬的招聘页：用本机 Chrome 真正打开（等前端渲染完、往下滚），连同页面后台拉的岗位数据（JSON 接口）一起交给提炼。
 * 页面上有招聘系统链接（北森 zhiye / Moka / 飞书 / Hotjob / 51job 校招）的，顺着进招聘系统，走现成的适配接口。
 * 只在本地跑（Vercel 上没有浏览器）。需要本地 dev server（3003）在跑（招聘系统那一路走工厂的抓取接口）。
 *
 *   npx tsx scripts/render-crawl.mts --model qwen-plus --entries 入口.tsv [--out 结果.tsv]
 *   入口.tsv：每行「企业 id<TAB>网址」
 * 来源：数据部门 10-16 按招聘官网重爬后，48 家「页面能打开但没提炼出岗位」。
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
process.loadEnvFile('.env.local');
const puppeteer = createRequire(import.meta.url)('puppeteer-core');
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { structureJobData } = await import('../src/lib/agents/structurer-job');
const { upsertJobsFromLog } = await import('../src/lib/job-store');
const { isKnownModel, MODEL_OPTIONS } = await import('../src/lib/model-options');

const argv = process.argv.slice(2);
const opt = (k: string, d = '') => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const MODEL = opt('model', process.env.DEFAULT_MODEL || '');
if (!isKnownModel(MODEL)) { console.error(`--model 要从模型选单里选：${MODEL_OPTIONS.map(m => m.id).join(' / ')}`); process.exit(1); }
const OUT = opt('out', `render-crawl-${new Date().toISOString().slice(0, 10)}.tsv`);
const BASE = 'http://localhost:3003';
const TOKEN = fs.readFileSync('.preview-token', 'utf8').trim();
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const entries = fs.readFileSync(opt('entries'), 'utf8').trim().split('\n').map(l => l.split('\t')).filter(r => Number(r[0]) && /^https?:/.test(r[1] || '')).map(r => ({ id: Number(r[0]), url: r[1].trim() }));

const ATS = /(zhiye\.com|mokahr\.com|jobs\.feishu\.cn|hotjob\.cn|dayee\.com|campus\.51job\.com|italent\.cn|myworkdayjobs\.com|greenhouse\.io|lever\.co)/i;
const JOBISH = /岗位|职位|招聘|实习|校招|应届|管培|position|job|career|intern|graduate/i;

/** 浏览器里打开：返回渲染后的正文、页面链接、后台接口里像岗位列表的 JSON */
async function render(browser: any, url: string) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const jsons: string[] = [];
  page.on('response', async (r: any) => {
    try {
      const ct = r.headers()['content-type'] || '';
      if (!/json/i.test(ct) || r.request().resourceType() === 'image') return;
      const t = await r.text();
      if (t.length < 80 || t.length > 1_500_000) return;
      // 像岗位列表：有好几个对象带职位名一类的字段
      if ((t.match(/"(title|name|jobName|positionName|postName|job_title|zwmc|position)"\s*:/gi) || []).length >= 3 && JOBISH.test(t.slice(0, 20000)) || /岗位|职位/.test(t.slice(0, 5000))) jsons.push(`接口 ${r.url().slice(0, 160)}：\n${t.slice(0, 60000)}`);
    } catch { /* 有的响应读不了 */ }
  });
  let error = '';
  try { await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }); } catch (e: any) { error = String(e.message).slice(0, 80); }
  await new Promise(r => setTimeout(r, 2500));
  // 往下滚几屏，触发懒加载
  for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollBy(0, window.innerHeight)).catch(() => {}); await new Promise(r => setTimeout(r, 700)); }
  const { text, links, finalUrl } = await page.evaluate(() => ({
    text: document.body?.innerText || '',
    links: [...document.querySelectorAll('a[href]')].map(a => ({ t: (a.textContent || '').trim().slice(0, 60), h: (a as HTMLAnchorElement).href })).filter(l => /^https?:/.test(l.h)),
    finalUrl: location.href,
  })).catch(() => ({ text: '', links: [] as any[], finalUrl: url }));
  // iframe 里的招聘系统（很多官网把北森 / Moka 嵌在 iframe 里）
  const frames = page.frames().map((f: any) => f.url()).filter((u: string) => /^https?:/.test(u) && u !== finalUrl);
  await page.close();
  return { text, links, jsons, finalUrl, frames, error };
}

async function api(path: string, body?: any) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', cookie: `auth_token=${TOKEN}` }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

const { data: task } = await db.from('job_tasks').insert({ name: `🖥 浏览器渲染补岗位 · ${new Date().toLocaleDateString('zh-CN')}`, scope: 'campus', model_id: MODEL, created_by: 'render-crawl', status: 'running' }).select('id').single();
if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, '企业 id\t企业\t入库岗位\t用的办法\t说明\n');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=zh-CN'] });

async function saveFrom(c: any, url: string, md: string, how: string) {
  const { data: log } = await db.from('job_crawl_logs').insert({ task_id: task!.id, target_url: url, company: c.name, company_id: c.id, hint: '', fetcher_status: 'success', structurer_status: 'running', raw_markdown: md.slice(0, 500000), markdown_len: md.length, model_id: MODEL }).select('id').single();
  const r = await structureJobData(md, c.name, '', MODEL, Date.now(), 'campus');
  if (!r) { await db.from('job_crawl_logs').update({ structurer_status: 'failed', error_message: '提炼失败' }).eq('id', log!.id); return 0; }
  const structured = { ...r, pipeline_log: [{ key: 'render', title: how, status: 'success', color: 'green' }] };
  await db.from('job_crawl_logs').update({ structurer_status: 'success', structured_json: structured }).eq('id', log!.id);
  const saved = await upsertJobsFromLog(log!.id, structured);
  await db.from('job_crawl_logs').update({ pushed_to_db: saved > 0, jobs_saved: saved }).eq('id', log!.id);
  return saved;
}

let i = 0, total = 0;
for (const e of entries) {
  i++;
  const { data: c } = await db.from('companies').select('id, name').eq('id', e.id).single();
  if (!c) continue;
  const notes: string[] = []; let saved = 0, how = '';
  try {
    const r = await render(browser, e.url);
    if (r.error) notes.push(`打开：${r.error}`);
    // ① 招聘系统链接 / iframe：走工厂的抓取接口（北森 / 飞书 / Hotjob 有现成适配）
    const atsUrls = [...new Set([...r.frames, ...r.links.map((l: any) => l.h)].filter(u => ATS.test(u)))]
      .sort((a, b) => Number(/campus|school|graduate|intern|校/i.test(b)) - Number(/campus|school|graduate|intern|校/i.test(a))).slice(0, 3);
    for (const u of atsUrls) {
      const init = await api('/api/agents/fetcher/init', { url: u, model: MODEL, scope: 'campus' }).catch(() => null);
      if (!init?.success) { notes.push(`招聘系统 ${u.slice(0, 60)} 抓不下来`); continue; }
      let md = init.base_markdown;
      const cand: string[] = (init.candidate_urls || []).slice(0, 15);
      for (let k = 0; k < cand.length; k += 3) { const b = await api('/api/agents/fetcher/batch', { urls: cand.slice(k, k + 3), model: MODEL }).catch(() => null); if (b?.success) md += b.useful_markdown; }
      saved = await saveFrom(c, u, md, '顺着页面上的招聘系统链接');
      if (saved) { how = `招聘系统 ${new URL(u).hostname}`; await api('/api/db/save-url', { company: c.name, companyId: c.id, unit: '', title: '招聘系统（从招聘官网页面上找到）', targetUrl: u, type: 'campus', subtype: 'list', reasoning: '浏览器渲染招聘官网后，页面上的招聘系统链接（10-16）' }).catch(() => {}); break; }
      notes.push(`招聘系统 ${new URL(u).hostname} 提炼 0 个`);
    }
    // ② 浏览器渲染后的正文 + 后台接口数据
    if (!saved && (r.text.length > 200 || r.jsons.length)) {
      const linkLines = r.links.filter((l: any) => JOBISH.test(l.t + l.h)).slice(0, 200).map((l: any) => `[${l.t}](${l.h})`).join('\n');
      const md = `### Source: [Main Page](${r.finalUrl})\n\n${r.text.slice(0, 60000)}\n\n## 页面上的招聘相关链接\n${linkLines}\n\n${r.jsons.length ? `## 页面后台接口返回的数据\n${r.jsons.join('\n\n').slice(0, 150000)}` : ''}`;
      saved = await saveFrom(c, r.finalUrl, md, '浏览器渲染');
      if (saved) how = `浏览器渲染${r.jsons.length ? '（含接口数据）' : ''}`;
      else notes.push(`渲染后正文 ${r.text.length} 字、接口 ${r.jsons.length} 个，提炼 0 个`);
    } else if (!saved) notes.push(`渲染后几乎没内容（${r.text.length} 字）`);
  } catch (err: any) { notes.push(String(err.message).slice(0, 100)); }
  total += saved;
  fs.appendFileSync(OUT, [c.id, c.name, saved, how, notes.join('；')].join('\t') + '\n');
  console.log(`[${i}/${entries.length}] ${c.name}：${saved ? `入库 ${saved}（${how}）` : `0 — ${notes.slice(-1)[0] || ''}`}`);
}
await browser.close();
await db.from('job_tasks').update({ status: 'completed' }).eq('id', task!.id);
console.log(`\n完成：${entries.length} 家，入库 ${total} 个 → ${OUT}`);
