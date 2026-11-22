/**
 * 批量：有官网、还没有核心产品的企业，从官网抓核心产品（11-21，用户给了 Gemini key 今晚到期，本机跑）。
 * 每家最多读 12 页（+ 顺着详情页 8 页）、150 秒；同时 8 家（库是线上共用的，写入量很小）。跑过的记在 reports/，断了重跑会跳过。
 *   npx tsx scripts/companies/products-from-website-1121.mts [--model gemini-3.8-flash] [--limit N] [--par 5]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { crawlCompanyProducts } = await import('@/lib/agents/company-products-crawl');
const { saveCompanyProducts } = await import('@/lib/company-store');
const { withCost } = await import('@/lib/token-logger');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', 'gemini-4-neon'), PAR = Number(opt('par', '8')), LIMIT = Number(opt('limit', '0'));
const LOG = 'reports/1121-官网核心产品批量.json';
const done: Record<string, any> = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : {};

const { data: cs } = await selectAll(() => db.from('companies').select('id, name, official_website, supplier_categories, human_review_status').not('if_delete', 'is', true).not('official_website', 'is', null).order('id'));
const { data: ps } = await selectAll(() => db.from('company_products').select('company_id').eq('if_delete', false));
const has = new Set((ps as any[]).map(p => p.company_id));
let todo = (cs as any[]).filter(c => c.human_review_status !== 'hidden' && !has.has(c.id) && /^https?:/.test(c.official_website) && !done[c.id]);
todo.sort((a, b) => Number(!!(b.supplier_categories || []).length) - Number(!!(a.supplier_categories || []).length));   // 科研厂商先跑
if (LIMIT) todo = todo.slice(0, LIMIT);
console.log(`要抓 ${todo.length} 家（模型 ${MODEL}，同时 ${PAR} 家）`);

let n = 0, got = 0, saved = 0;
const queue = [...todo];
await Promise.all(Array.from({ length: PAR }, async () => {
  while (queue.length) {
    const c = queue.shift()!; const t = Date.now();
    try {
      // 单家硬上限 5 分钟：有的页面 / 调用会卡住（11-21 阿克松一家卡了 74 分钟），超时就跳过下一家
      const r = await Promise.race([
        withCost({ tool_name: 'company-pipeline', task_name: 'Company Products Crawl (batch)' }, () => crawlCompanyProducts(c, { model: MODEL, maxPages: Number(opt('pages', '12')), budgetMs: Number(opt('budget', '150')) * 1000 })),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('超过 5 分钟，跳过')), 300_000)),
      ]);
      const s = r.products.length ? await saveCompanyProducts(c.id, r.products) : 0;
      got += r.products.length ? 1 : 0; saved += s;
      done[c.id] = { name: c.name, pages: r.pages.length, ok_pages: r.pages.filter(p => p.ok).length, found: r.products.length, saved: s, sec: Math.round((Date.now() - t) / 1000) };
    } catch (e: any) { done[c.id] = { name: c.name, error: String(e.message).slice(0, 160) }; }
    if (++n % 10 === 0) { fs.writeFileSync(LOG, JSON.stringify(done, null, 1)); console.log(`${new Date().toTimeString().slice(0, 5)} 跑完 ${n}/${todo.length}，抓到产品的 ${got} 家，入库 ${saved} 条`); }
  }
}));
fs.writeFileSync(LOG, JSON.stringify(done, null, 1));
console.log(`完成：${n} 家，抓到产品的 ${got} 家，入库 ${saved} 条`);
process.exit(0);
