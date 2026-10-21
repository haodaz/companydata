/**
 * analytica 展商名单 → 科研仪器 / 试剂耗材供应商候选（展会名单只当线索：拿名字去找公司自己的官网，名单本身不入库、不转载）。
 *   1. 按名字分批判：是不是做实验室仪器 / 设备 / 试剂耗材的厂商或品牌（展团组织方、协会、媒体、研究所、纯服务商剔掉），粗分类目
 *   2. 留下的：企业库里已有且有官网的直接用；没有的联网查官网、中文名、主营
 *   3. 输出和 instrument-suppliers.json 同格式 → verify-instrument-suppliers.mts --in … 核实 → apply-instrument-suppliers.mts 写库
 *   npx tsx scripts/analytica-exhibitors.mts --model qwen-plus [--xlsx reports/analytica_export_2026_en.xlsx] [--out reports/analytica-suppliers.json] [--lookup-model gemini-3.8-flash] [--par 3] [--limit N]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import { createRequire } from 'node:module';
const XLSX = createRequire(import.meta.url)('xlsx');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose, searchJson } = await import('@/lib/agents/search-llm');
const { resolveCompanyId } = await import('@/lib/company-match');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');
const { INSTRUMENT_CATEGORIES } = await import('@/lib/instrument-categories');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const XLSX_PATH = opt('xlsx', 'reports/analytica_export_2026_en.xlsx'), OUT = opt('out', 'reports/analytica-suppliers.json');
const LOOKUP = opt('lookup-model', MODEL);   // 找海外小厂的官网：千问的搜索偏国内站，海外用 Gemini（谷歌搜索）更准
if (!isKnownModel(LOOKUP)) { console.error(`--lookup-model 要用模型选单里的（现在：${LOOKUP}）`); process.exit(1); }
const PAR = Number(opt('par', '3')), LIMIT = Number(opt('limit', '0')), EXHIBITION = 'analytica';
const CAT_NAMES = INSTRUMENT_CATEGORIES.map(c => c.name);

// 表头在第 5 行：No. / Company / Postcode / City / Country/Region / Hall/Booth
const wb = XLSX.readFile(XLSX_PATH);
const rows = (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][])
  .filter(r => r[1] && /^\d+$/.test(String(r[0]).trim()))
  .map(r => ({ name: String(r[1]).replace(/\s+/g, ' ').trim(), city: r[3] || '', country: r[4] && r[4] !== 'undefined' ? String(r[4]) : '' }));
const exhibitors = [...new Map(rows.map(r => [r.name.toLowerCase(), r])).values()].slice(0, LIMIT || undefined);
console.log(`analytica 展商 ${exhibitors.length} 家`);

async function pool<T>(items: T[], fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// 1. 按名字分批粗筛（按抄回的公司名对齐——按序号对，模型会错位）
const norm = (x: any) => String(x || '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
const BATCH = 20, batches: typeof exhibitors[] = [];
for (let i = 0; i < exhibitors.length; i += BATCH) batches.push(exhibitors.slice(i, i + BATCH));
const kept: any[] = [], skipped: any[] = [];
await pool(batches, async b => {
  const prompt = `下面是 analytica（慕尼黑分析生化展）的参展商。逐家判断：是不是「科研仪器 / 实验室设备 / 试剂耗材」的厂商或品牌商（卖给实验室、科研、检测、研发；大的经销商也算）。
剔掉：展团组织方 / 联合展台（如 Bayern International、各国展团）、协会、媒体出版社、大学研究所、纯检测服务 / 咨询 / 招聘 / 物流、和实验室无关的公司。
只凭公司名和你已有的了解判断，不要写「官网显示」之类没看过的话；拿不准的 keep=true（下一步会打开官网核实）。每条把公司名原样抄回 name。categories 从这些里选（原样照抄，可多选，不知道就空）：${CAT_NAMES.join('、')}
${b.map((e, i) => `${i}. ${e.name}（${e.country}）`).join('\n')}
只返回 JSON：{"items":[{"i":0,"name":"原样公司名","keep":true,"categories":[""],"why":"几个字"}]}`;
  try {
    const r = await generateContent(prompt, MODEL, { jsonMode: true, temperature: 0 });
    await logTokenUsage({ tool_name: 'company-pipeline', task_name: 'Analytica Exhibitor Screen', institution: EXHIBITION, model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
    const items = (parseJsonLoose(r.text)?.items || []) as any[];
    b.forEach((e, i) => {
      const v = items.find(x => norm(x.name) === norm(e.name) || norm(x.name).startsWith(norm(e.name))) || items.find(x => Number(x.i) === i && !x.name);
      (v?.keep === false ? skipped : kept).push({ ...e, categories: ((v?.categories || []) as string[]).filter(c => CAT_NAMES.includes(c)), why: v?.why || (v ? '' : '模型漏判，留着核实') });
    });
  } catch (e: any) { console.log(`粗筛失败一批：${String(e?.message || e).slice(0, 80)}`); b.forEach(e => kept.push({ ...e, categories: [], why: '粗筛失败，留着核实' })); }
  process.stdout.write(`\r粗筛 ${kept.length + skipped.length}/${exhibitors.length}，留 ${kept.length}`);
});
console.log();

// 2. 找官网：库里已有且有官网的直接用，其余联网查
const out: any[] = [];
let searched = 0, fromDb = 0;
await pool(kept, async e => {
  const id = await resolveCompanyId(e.name).catch(() => null);
  if (id) {
    const { data: co } = await db.from('companies').select('name, name_en, official_website').eq('id', id).single();
    if (co?.official_website) {
      fromDb++;
      out.push({ name_cn: /[一-鿿]/.test(co.name) ? co.name : '', name_en: co.name_en || e.name, country: e.country, is_domestic: e.country === 'China', website: co.official_website, products: [], exhibitions: [EXHIBITION], categories: e.categories, source: 'analytica 2026 展商名单 + 企业库' });
      return;
    }
  }
  const prompt = `联网检索这家 analytica 2026 参展商的公司信息：${e.name}（${[e.city, e.country].filter(Boolean).join('，')}）。
要求：官网用公司自己的域名，查不到填 null，不要编；中文名只填公司自己用的中文名（没有就空）；主营写 2–4 个代表的仪器 / 试剂产品线。
categories 从这些里选（原样照抄，可多选）：${CAT_NAMES.join('、')}
只返回 JSON：{"name_cn":"","name_en":"","website":"https://...","products":[""],"categories":[""],"source_url":"你看到它的网址"}`;
  try {
    const r = await searchJson(prompt, e.country === 'China' ? MODEL : LOOKUP, { tool_name: 'company-pipeline', task_name: 'Analytica Exhibitor Lookup', institution: e.name }, { lenient: true });
    const v = r.parsed || {};
    searched++;
    // 模型没填官网：从搜索来源里挑域名里带公司名关键词的（如 2mag AG → 2mag.de），社媒 / 黄页 / 展会站不算
    const words = e.name.toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length >= 4 && !/^(gmbh|corp|corporation|company|group|technolog|technology|technologies|scientific|limited|instruments?|china|international)$/.test(w));
    const fromSources = (r.sources || []).map((x: any) => x.url).find((u: string) => { try { const h = new URL(u).hostname.toLowerCase(); return !/linkedin|facebook|wikipedia|analytica|messe|zoominfo|dnb\.|crunchbase|bloomberg|alibaba|made-in-china|europages|kompass|google|baidu|zhihu|youtube/.test(h) && words.some((w: string) => h.includes(w)); } catch { return false; } });
    const site = typeof v.website === 'string' && /^https?:\/\//.test(v.website) ? v.website : fromSources ? new URL(fromSources).origin : null;
    const cats = [...new Set([...e.categories, ...((v.categories || []) as string[]).filter(c => CAT_NAMES.includes(c))])];
    out.push({
      name_cn: v.name_cn || '', name_en: v.name_en || e.name, country: e.country, is_domestic: e.country === 'China',
      website: site, website_from: site && site !== v.website ? 'sources' : 'model', search_sources: (r.sources || []).slice(0, 5).map((x: any) => x.url),
      products: Array.isArray(v.products) ? v.products : [], exhibitions: [EXHIBITION], categories: cats, source_url: v.source_url || r.sources?.[0]?.url || null, source: 'analytica 2026 展商名单',
    });
  } catch (err: any) { console.log(`\n  查不到 ${e.name}：${String(err?.message || err).slice(0, 60)}`); }
  process.stdout.write(`\r找官网 ${out.length}/${kept.length}（库里已有 ${fromDb}、联网查 ${searched}）`);
});
console.log();
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), exhibition: EXHIBITION, exhibitors: exhibitors.length, kept: kept.length, kept_list: kept.map(k => ({ name: k.name, why: k.why })), skipped, suppliers: out }, null, 1));
console.log(`展商 ${exhibitors.length} → 粗筛留 ${kept.length}（剔 ${skipped.length}）→ 有官网 ${out.filter(s => s.website).length} / ${out.length}（中国 ${out.filter(s => s.is_domestic).length}）→ ${OUT}`);
