/**
 * 批量补岗位：给一批「库里有档、0 个岗位」的企业跑一遍工厂的岗位线（寻源 → 挑入口 → 抓取提炼 → 入库），
 * 和在虚拟工厂里下单走的是同一套代码（factory-pipeline），只是从命令行批量跑。需要本地 dev server（3003）在跑。
 *
 *   npx tsx scripts/jobs-backfill.mts --names 名单.txt            # 一行一个企业名（「全称；简称」也行）
 *   npx tsx scripts/jobs-backfill.mts --ids 1361,1571 --detail 15 --par 2 --limit 3
 *
 * 每家：库里已有校招信息源就复用，没有就用千问寻源并入库；按「列表页 > 应届 / 实习 > 专项 > 校招首页」挑入口，
 * 一个入口抓不到或 0 个岗位就换下一个（最多 3 个）；都不行就从企业官网顺着「加入我们 / 招聘」找入口（recruit-discover）；
 * 再不行就不看库里已有链接、换角度自己搜（findRecruitChannels）。找到的入口记进信息源库，证实 404 的库内信息源标「失效」。结果逐家写进 --out（tsv），岗位入库为「待审核」。
 * 来源：数据部门 2026-10-15 反馈「岗位数据量大但覆盖面小」，附 153 家历史上抓到过、我们库里 0 岗位的企业。
 */
import fs from 'node:fs';
process.loadEnvFile('.env.local');

const argv = process.argv.slice(2);
const opt = (k: string, d = '') => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt('base', 'http://localhost:3003');
// 模型不写死：--model 指定（必须是模型选单里的），不给就用环境变量 DEFAULT_MODEL
const { MODEL_OPTIONS, isKnownModel } = await import('../src/lib/model-options');
const MODEL = opt('model', process.env.DEFAULT_MODEL || '');
if (!isKnownModel(MODEL)) { console.error(`--model 要从模型选单里选：${MODEL_OPTIONS.map(m => m.id).join(' / ')}${MODEL ? `（给的是 ${MODEL}）` : ''}`); process.exit(1); }
const DETAIL = parseInt(opt('detail', '15'));
const PAR = parseInt(opt('par', '2'));
const LIMIT = parseInt(opt('limit', '0'));
const OUT = opt('out', `jobs-backfill-${new Date().toISOString().slice(0, 10)}.tsv`);
const TOKEN = fs.readFileSync('.preview-token', 'utf8').trim();

// factory-pipeline 里的请求都是相对地址（在浏览器里跑），这里统一补上 dev server 地址和登录 cookie
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init: any = {}) => {
  const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input;
  const headers = new Headers(init.headers || {});
  if (typeof url === 'string' && url.startsWith(BASE)) headers.set('cookie', `auth_token=${TOKEN}`);
  return realFetch(url, { ...init, headers });
}) as typeof fetch;

const P = await import('../src/lib/factory-pipeline');
const { discoverRecruitEntries } = await import('../src/lib/agents/recruit-discover');
const { findRecruitChannels } = await import('../src/lib/agents/finder-pipeline');
const CAMPUS_RE = /校园|校招|应届|实习|campus|graduate|intern|students?/i;

const flat = (s: any) => String(s || '').replace(/\s/g, '').toLowerCase();
const getJson = async (u: string) => (await fetch(u)).json();

// 名单 → 库里的企业
const cos: any[] = [];
for (let page = 1; ; page++) {
  const j = await getJson(`/api/db/companies?page=${page}&pageSize=500&withStats=1`);
  const rows = j.data || [];
  cos.push(...rows);
  if (rows.length < 500) break;
}
const targets = new Map<number, any>();
const missing: string[] = [];
if (opt('ids')) for (const id of opt('ids').split(',').map(Number)) { const c = cos.find(x => x.id === id); if (c) targets.set(id, c); }
if (opt('names')) {
  for (const line of fs.readFileSync(opt('names'), 'utf8').split('\n').map(s => s.trim()).filter(Boolean)) {
    const keys = line.split(/[；;]/).map(flat).filter(Boolean);
    const names = (c: any) => [c.name, c.registered_name, c.brief_name, c.name_en].map(flat).filter(Boolean);
    let m = cos.filter(c => names(c).some(n => keys.includes(n)));
    if (!m.length) m = cos.filter(c => names(c).some(n => keys.some(k => k.length >= 2 && n.length >= 2 && (n.includes(k) || k.includes(n)))));
    if (m.length) { for (const c of m.slice(0, 1)) targets.set(c.id, c); continue; }
    // 库里没有：按工厂的规矩建档
    const e = await fetch('/api/office/ensure-company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: line.split(/[；;]/)[0] }) }).then(r => r.json()).catch(() => null);
    const c = e?.id ? { id: e.id, name: e.name || line } : null;
    if (c?.id) targets.set(c.id, c); else missing.push(line);
  }
}
// 断点续跑：--out 里已经跑过的企业（包括 0 个的）跳过
const doneIds = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').slice(1).map(l => Number(l.split('\t')[0])).filter(Boolean) : []);
let list = [...targets.values()].filter(c => !(c.counts?.jobs_total > 0) && !doneIds.has(c.id));
if (LIMIT) list = list.slice(0, LIMIT);
console.log(`目标 ${targets.size} 家，其中 0 岗位 ${list.length} 家；建档失败 ${missing.length}：${missing.join('、')}`);
if (!list.length) process.exit(0);

const taskId = await P.createJobTask(`🏭 批量补岗位 · ${new Date().toLocaleDateString('zh-CN')}`, `数据部门 10-15 反馈：历史上抓到过、库里 0 岗位的企业（${list.length} 家）`, 'campus', MODEL, 'jobs-backfill');
await P.setJobTaskStatus(taskId, 'running');
if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, '企业 id\t企业\t信息源\t试了几个入口\t入库岗位\t用的入口\t说明\n');

let done = 0, totalSaved = 0;
const t0 = Date.now();
async function one(c: any) {
  const notes: string[] = [];
  let urls: any[] = [], tried = 0, saved = 0, used = '';
  try {
    const ex = await getJson(`/api/admin/db-url?companyId=${c.id}&type=campus,job&pageSize=100`);
    urls = ex.ok ? ex.data : [];
    if (!urls.length) urls = await P.findAndSaveCampusUrls({ id: c.id, name: c.name } as any, MODEL, { report: false });   // 批量不写寻源报告，省 token
    const ranked = P.pickUrlsToExtract(urls, 3);
    const tried_ = new Set<string>();
    const tryUrl = async (url: string) => {
      if (tried_.has(url)) return 0;
      tried_.add(url); tried++;
      const logs = await P.addUrlsToTask(taskId, [{ url, company: c.name, company_id: c.id, hint: '' }]);
      const log = logs.filter((l: any) => l.target_url === url && l.company_id === c.id).sort((a: any, b: any) => b.id - a.id)[0];
      if (!log) { notes.push(`入口登记失败 ${url}`); return 0; }
      try {
        const r = await P.extractUrl(log, { model: MODEL, scope: 'campus', maxSubPages: DETAIL, emit: () => {} });
        if (r.saved > 0) { saved = r.saved; used = url; return r.saved; }
        notes.push(`${url}：提炼 ${r.jobs} 个、入库 0`);
      } catch (e: any) {
        notes.push(`${url}：${String(e.message).slice(0, 80)}`);
        // 证实打不开的（404 / 410）：信息源库里这条标「失效」，以后工厂和批量都不再用
        const src = urls.find((u: any) => u.url === url && u.id);
        if (src && /页面不存在（(404|410)）/.test(e.message)) await fetch('/api/admin/db-url', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: src.id, health_status: 'dead', last_checked_at: new Date().toISOString(), url_health: { reason: String(e.message).slice(0, 120), by: 'jobs-backfill' } }) }).catch(() => {});
      }
      return 0;
    };
    // ① 库里 / 检索到的入口
    for (const u of ranked) if (await tryUrl(u.url)) break;
    // ② 都不行：从企业官网顺着「加入我们 / 招聘」找（模型常编子域名 / 子路径，官网首页是真的），找到的入口记进信息源库
    if (!saved) {
      const home = c.official_website || (ranked[0] ? (() => { try { return new URL(ranked[0].url).origin; } catch { return ''; } })() : '');
      const found = home ? await discoverRecruitEntries(home, 3).catch(() => []) : [];
      if (home && !found.length) notes.push(`官网 ${home} 上没找到招聘入口`);
      for (const f of found) {
        if (await tryUrl(f.url)) {
          await fetch('/api/db/save-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: c.name, companyId: c.id, unit: '', title: f.text || '招聘入口', targetUrl: f.url, type: 'campus', subtype: CAMPUS_RE.test(f.text + f.url) ? 'list' : 'portal', reasoning: `从${f.via}找到（批量补岗位）` }) }).catch(() => {});
          break;
        }
      }
    }
    // ③ 还不行：不看库里已有的链接，换角度自己搜（官网 + 招聘平台 / 公众号 + 高校就业网），验过能打开的全记进信息源库
    if (!saved) {
      const r3 = await findRecruitChannels(c.name, MODEL).catch((e: any) => { notes.push(`多角度检索：${String(e.message).slice(0, 80)}`); return null; });
      const fresh = (r3?.urls || []).filter(u => !tried_.has(u.url));
      if (r3 && !fresh.length) notes.push('多角度检索也没找到新入口');
      for (const u of fresh) {
        await fetch('/api/db/save-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: c.name, companyId: c.id, unit: '', title: u.title, targetUrl: u.url, type: 'campus', subtype: u.subtype, reasoning: `多角度检索（批量补岗位第三轮）：${u.reasoning || ''}`.slice(0, 500) }) }).catch(() => {});
      }
      for (const u of fresh.slice(0, 3)) if (await tryUrl(u.url)) break;
    }
  } catch (e: any) { notes.push(String(e.message).slice(0, 120)); }
  // 免费额度全用完（DASHSCOPE_FREE_ONLY）：整批停下，这家不记，下次续跑会重来
  if (!saved && notes.some(n => /免费额度.*(用完|不可用)/.test(n))) {
    if (!quotaOut) console.log(`\n⛔ 免费额度用完，停在「${c.name}」：${notes.find(n => /免费额度/.test(n))}`);
    quotaOut = true; queue.length = 0; return;
  }
  done++; totalSaved += saved;
  fs.appendFileSync(OUT, [c.id, c.name, urls.length, tried, saved, used, notes.join('；')].join('\t') + '\n');
  console.log(`[${done}/${list.length}] ${c.name}：${saved ? `入库 ${saved}` : '0'}（信息源 ${urls.length}，试 ${tried} 个入口）${notes.length && !saved ? ' — ' + notes[notes.length - 1] : ''}  · 已用 ${((Date.now() - t0) / 60000).toFixed(0)} 分`);
}
let quotaOut = false;
const queue = [...list];
await Promise.all(Array.from({ length: PAR }, async () => { while (queue.length) await one(queue.shift()); }));
await P.setJobTaskStatus(taskId, 'completed');
console.log(`\n${quotaOut ? "⛔ 因免费额度用完提前停止" : "完成"}：跑完 ${done}/${list.length} 家，入库 ${totalSaved} 个岗位，有岗位的 ${fs.readFileSync(OUT, 'utf8').split('\n').slice(1).filter(l => Number(l.split('\t')[4]) > 0).length} 家 → ${OUT}`);
if (quotaOut) process.exitCode = 2;   // 让后面排队的批次别再启动
