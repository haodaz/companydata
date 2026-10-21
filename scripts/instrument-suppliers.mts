/**
 * 科研仪器 / 试剂耗材供应商候选名单（数据部门 10-21 #21，只出清单不写库）：
 *   骨架 = 国务院国发〔2014〕70 号 / 科技部国家网络管理平台的 15 类科研仪器 + 常用 7 类试剂耗材；
 *   每类联网找「全球头部厂商 + 国内厂商」（每类都要有国内的），带官网、主营、参加的展会；展会名单当补充来源。
 *   npx tsx scripts/instrument-suppliers.mts --model qwen-plus [--per 12] [--par 3] [--out reports/instrument-suppliers.json]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { searchJson } = await import('@/lib/agents/search-llm');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const PER = Number(opt('per', '12')), PAR = Number(opt('par', '3'));
const OUT = opt('out', 'reports/instrument-suppliers.json');

const { INSTRUMENT_CATEGORIES: CATEGORIES } = await import('@/lib/instrument-categories');

async function one(c: typeof CATEGORIES[number]) {
  const prompt = `联网检索：「${c.name}」（细类：${c.sub}；主要服务学科：${c.fields}）领域里，给高校、科研院所、企业研发实验室供货的厂商。
要求：
1. 全球头部厂商约 ${Math.ceil(PER / 2)} 家，国内厂商约 ${Math.ceil(PER / 2)} 家（国内的一定要有，优先国产替代里的代表企业、上市公司、专精特新）。
2. 只列真实存在的公司，名称用公司官方叫法（中文名 + 英文名），官网用公司自己的域名；查不到官网的填 null，不要编。
3. 写清主营的仪器 / 试剂（2–4 个代表产品线），以及常参加的展会（如 analytica、ACHEMA、Pittcon、MEDICA、CES、BCEIA、CISILE、慕尼黑上海分析生化展、CACLP、CMEF 等，没查到就空）。
只返回 JSON：{"suppliers":[{"name_cn":"","name_en":"","country":"中国 / 美国 / 德国…","is_domestic":true,"website":"https://...","products":["",""],"exhibitions":[""],"source_url":"你看到它的网址"}]}`;
  const r = await searchJson(prompt, MODEL, { tool_name: 'company-pipeline', task_name: `Instrument Suppliers · ${c.key}`, institution: c.name }, { lenient: true });
  const list = (Array.isArray(r.parsed?.suppliers) ? r.parsed.suppliers : []).filter((s: any) => s?.name_cn || s?.name_en);
  return list.map((s: any) => ({ ...s, category: c.key, category_name: c.name, type: c.type, website: typeof s.website === 'string' && /^https?:\/\//.test(s.website) ? s.website : null }));
}

const out: any[] = [];
let i = 0;
await Promise.all(Array.from({ length: PAR }, async () => {
  while (i < CATEGORIES.length) {
    const c = CATEGORIES[i++];
    try { const l = await one(c); out.push(...l); console.log(`✓ ${c.name}：${l.length} 家（国内 ${l.filter((s: any) => s.is_domestic).length}）`); }
    catch (e: any) { console.log(`✗ ${c.name}：${String(e?.message || e).slice(0, 100)}`); }
  }
}));
// 按名称合并（一家公司可能出现在好几类里）
const norm = (s: string) => String(s || '').toLowerCase().replace(/[\s,.()（）]|inc|ltd|co|gmbh|corporation|corp|company|有限公司|股份|集团/g, '');
const byName = new Map<string, any>();
for (const s of out) {
  const k = norm(s.name_cn) || norm(s.name_en);
  const cur = byName.get(k);
  if (!cur) byName.set(k, { ...s, categories: [s.category_name], products: s.products || [], exhibitions: s.exhibitions || [] });
  else { cur.categories = [...new Set([...cur.categories, s.category_name])]; cur.products = [...new Set([...cur.products, ...(s.products || [])])]; cur.exhibitions = [...new Set([...cur.exhibitions, ...(s.exhibitions || [])])]; cur.website = cur.website || s.website; }
}
const merged = [...byName.values()];
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), categories: CATEGORIES, total: merged.length, domestic: merged.filter(s => s.is_domestic).length, suppliers: merged }, null, 1));
console.log(`\n合并后 ${merged.length} 家（国内 ${merged.filter(s => s.is_domestic).length}、有官网 ${merged.filter(s => s.website).length}）→ ${OUT}`);
