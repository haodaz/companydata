/**
 * 2026 慕尼黑上海分析生化展（analytica China，11-16~18）在线会刊：展商 + 参展商品（姜贺 11-02：「能直接把公司和参展商品抓到库里吗」）。
 * 会刊是公开页面（onlinecatalogue.analyticachina.com.cn）。用本机 Chrome 像人一样翻：列表每页 60 家点「下一页」，再逐家打开详情页；
 * 只记下页面自己加载的数据（列表 / 公司详情 / 参展商品），不另外调接口。每页之间停 1.5 秒，一路一个标签页。
 * 结果存 reports/analytica-china-2026.json，入库用 analytica-china-2026-load.mts。
 *   npx tsx scripts/research/analytica-china-2026-crawl.mts [--limit N]
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = Number(opt('limit', '0'));
const OUT = 'reports/analytica-china-2026.json';
const BASE = 'https://onlinecatalogue.analyticachina.com.cn';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { members: {}, details: {} };
const save = () => fs.writeFileSync(OUT, JSON.stringify(prev));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
let lastList: any = null, lastDetail: any = null, lastExhibits: any[] = [];
page.on('response', async res => {
  const u = res.url();
  try {
    if (u.endsWith('/api/front/memberlists')) lastList = (await res.json())?.data;
    else if (u.endsWith('/api/exhibitor/detail')) lastDetail = (await res.json())?.data;
    else if (u.endsWith('/api/front/memberlists/exhibits')) { const d = (await res.json())?.data; if (d) lastExhibits.push(d); }
  } catch { /* 不是 JSON */ }
});

// 1) 列表：每页 60 家，一页一页往后翻
if (!Object.keys(prev.members).length) {
  await page.goto(`${BASE}/exhibitors`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let w = 0; w < 40 && !lastList; w++) await sleep(500);
  // 每页条数选 60
  await page.evaluate(() => { const el = [...document.querySelectorAll('.page-corms *')].find(e => e.textContent?.trim() === '60') as HTMLElement | undefined; el?.click(); });
  await sleep(2500);
  for (let p = 1; p <= 200; p++) {
    const d = lastList; if (!d) { await sleep(2000); continue; }
    for (const m of d.data || []) prev.members[m.id] = m;
    console.log(`列表第 ${d.current_page}/${d.last_page} 页，累计 ${Object.keys(prev.members).length} 家`);
    save();
    if (d.current_page >= d.last_page) break;
    lastList = null;
    await page.evaluate(() => (document.querySelector('a.page-next-button') as HTMLElement)?.click());
    for (let w = 0; w < 20 && !lastList; w++) await sleep(500);
    await sleep(1500);
  }
}

// 2) 详情：逐家打开，记公司详情 + 参展商品
const ids = Object.keys(prev.members).filter(id => !prev.details[id]);
console.log(`详情待抓 ${ids.length} 家`);
let n = 0;
for (const id of LIMIT ? ids.slice(0, LIMIT) : ids) {
  lastDetail = null; lastExhibits = [];
  try {
    await page.goto(`${BASE}/exhibitors/company/${id}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch { /* 超时也看看拿到没有 */ }
  for (let w = 0; w < 10 && !lastDetail; w++) await sleep(500);
  const exhibits = lastExhibits.flatMap(x => x.data || []);
  const more = lastExhibits[0] && lastExhibits[0].last_page > 1 ? lastExhibits[0].last_page : 1;
  prev.details[id] = { detail: lastDetail, exhibits, exhibit_pages: more, at: new Date().toISOString() };
  if (++n % 20 === 0) { save(); console.log(`详情 ${n}/${ids.length}`); }
  await sleep(1500);
}
save();
const ex = Object.values(prev.details).reduce((s: number, d: any) => s + (d.exhibits?.length || 0), 0);
console.log(`完成：展商 ${Object.keys(prev.members).length}，详情 ${Object.keys(prev.details).length}，参展商品 ${ex}`);
await browser.close();
