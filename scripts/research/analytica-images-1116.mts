/**
 * 数据部门 11-16（姜贺）：慕尼黑会刊入库的产品近一半没封面——会刊展商页的参展商品 6 个一页，当初只抓了第一页（图只在分页数据里）。
 * 这里把有多页的展商逐页翻完（点页面自己的「下一页」，读页面自己加载的数据），再给库里没图的产品补图（转存 research-images）。
 *   npx tsx scripts/research/analytica-images-1116.mts [--crawl] [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { isBlankImage } = await import('@/lib/image-blank');
const FILE = 'reports/analytica-china-2026.json', BASE = 'https://onlinecatalogue.analyticachina.com.cn', IMG = 'https://resources.analyticachina.com.cn/';
const J = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const save = () => fs.writeFileSync(FILE, JSON.stringify(J));

if (process.argv.includes('--crawl')) {
  const todo = Object.keys(J.details).filter(id => (J.details[id].exhibit_pages || 1) > 1 && !J.details[id].all_pages);
  console.log(`要翻页的展商 ${todo.length} 家`);
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 1000 });
  let got: any[] = [];
  p.on('response', async r => { if (r.url().endsWith('/api/front/memberlists/exhibits')) { try { const d = (await r.json())?.data; if (d) got.push(d); } catch { /* 忽略 */ } } });
  let n = 0;
  for (const id of todo) {
    got = [];
    try { await p.goto(`${BASE}/exhibitors/company/${id}`, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch { /* 超时也看看拿到没有 */ }
    for (let w = 0; w < 20 && !got.length; w++) await sleep(500);
    const last = got[0]?.last_page || 1;
    for (let pg = 2; pg <= last; pg++) {
      const before = got.length;
      await p.evaluate(() => { const a = [...document.querySelectorAll('a.page-next-button')] as HTMLElement[]; a[a.length - 1]?.click(); });
      for (let w = 0; w < 20 && got.length === before; w++) await sleep(400);
      if (got.length === before) break;
      await sleep(900);
    }
    const all = new Map<number, any>(); for (const d of got) for (const e of d.data || []) all.set(e.id, e);
    for (const e of J.details[id].exhibits || []) if (!all.has(e.id)) all.set(e.id, e);
    J.details[id].exhibits = [...all.values()]; J.details[id].all_pages = got.length >= last;
    if (++n % 10 === 0) { save(); console.log(`翻完 ${n}/${todo.length}`); }
    await sleep(1200);
  }
  save(); await b.close();
}

// 补图：库里没图的慕尼黑会刊产品，按「展商页 + 产品名」对上分页数据里的图片
const norm = (s: string) => (s || '').toLowerCase().replace(/[\s\-_/·（）()]+/g, '');
async function fetchImage(supplierId: number, extId: string, url: string) {
  const img: any = { url };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && /^image\//.test(ct)) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1500 && await isBlankImage(buf)) return null;
      if (buf.length > 1500 && buf.length < 8 * 1024 * 1024) {
        const key = `${supplierId}/${extId}/${crypto.createHash('md5').update(url).digest('hex').slice(0, 12)}.${(ct.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '')}`;
        const { error } = await db.storage.from('research-images').upload(key, buf, { contentType: ct, upsert: true });
        if (!error) img.storage_path = key;
      }
    }
  } catch { /* 拿不到就只留原链接 */ }
  return img;
}
const { data } = await selectAll(() => db.from('research_products').select('id, external_id, name, supplier_id, source_url, images').like('source_url', '%analyticachina%').eq('if_delete', false).order('id'));
const missing = (data as any[]).filter(p => !(p.images || []).length);
let found = 0, done = 0, imgs = 0;
const queue = [...missing];
const APPLY = process.argv.includes('--apply');
async function worker() {
  while (queue.length) {
    const p = queue.shift()!;
    const id = String(p.source_url).match(/company\/(\d+)/)?.[1]; if (!id || !J.details[id]) continue;
    const e = (J.details[id].exhibits || []).find((x: any) => norm(x.title || x.etitle) === norm(p.name) && ((x.images || []).length || x.logo));
    if (!e) continue;
    found++;
    if (!APPLY) continue;
    const paths = [...new Set([...(e.images || []).map((g: any) => g.path || g.orign_path), e.logo].filter(Boolean))].slice(0, 4);
    const got = (await Promise.all(paths.map(u => fetchImage(p.supplier_id, p.external_id, IMG + String(u).replace(/^\//, ''))))).filter(Boolean);
    if (got.length) { await db.from('research_products').update({ images: got }).eq('id', p.id); done++; imgs += got.length; }
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`会刊产品没图 ${missing.length} 件，分页数据里有图的 ${found} 件${APPLY ? `，补上 ${done} 件（${imgs} 张）` : ''}`);
