/**
 * 科研仪器供应商候选名单 → 核实（只出结果；写企业库在 apply-instrument-suppliers.mts——企业实体库是全集，厂商页只是筛选视图）：
 *   1. 去掉模型写进名字里的批注；带「已剔除 / 已排除 / 重复」的直接丢
 *   2. 打开官网（Jina，被限流时本机 Chrome），看能不能打开
 *   3. 便宜模型按官网内容判：是不是这家公司、是不是做这一类仪器 / 试剂的厂商（研究机构、标准机构、不相干的公司剔掉）
 *   npx tsx scripts/verify-instrument-suppliers.mts --model qwen-flash [--in reports/instrument-suppliers.json] [--par 3]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { fetchJinaUrl } = await import('@/lib/agents/fetcher');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');
const { INSTRUMENT_CATEGORIES } = await import('@/lib/instrument-categories');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const IN = opt('in', 'reports/instrument-suppliers.json'), PAR = Number(opt('par', '3'));
const keyOf = new Map(INSTRUMENT_CATEGORIES.map(c => [c.name, c.key]));

const src = JSON.parse(fs.readFileSync(IN, 'utf8'));
const cleanName = (s: any) => String(s || '').replace(/[（(][^）)]*(注|已剔除|已排除|重复|已列|非核心|非主业|不覆盖)[^）)]*[）)]/g, '').replace(/——.*$/, '').trim();
const dropped: any[] = [];
const cands = (src.suppliers as any[]).filter(s => {
  const raw = `${s.name_cn || ''}${s.name_en || ''}`;
  if (/已剔除|已排除|重复剔除|已列，/.test(raw)) { dropped.push({ name: s.name_cn || s.name_en, why: '名单里自带「已剔除 / 已排除」批注' }); return false; }
  return true;
}).map(s => ({ ...s, name_cn: cleanName(s.name_cn), name_en: cleanName(s.name_en) }));
console.log(`候选 ${src.suppliers.length} 家，先丢掉带剔除批注的 ${dropped.length} 家，剩 ${cands.length} 家要核实`);

const results: any[] = [];
let next = 0;
await Promise.all(Array.from({ length: PAR }, async () => {
  while (next < cands.length) {
    const s = cands[next++];
    const name = s.name_cn || s.name_en;
    let md = '';
    if (s.website) md = ((await fetchJinaUrl(s.website).catch(() => '')) || '').slice(0, 6000);
    const prompt = `判断下面这家公司能不能作为「科研仪器 / 试剂耗材供应商」收进名单。
公司：${s.name_cn || ''}${s.name_en ? ` / ${s.name_en}` : ''}（${s.country || '国家不明'}）
名单里给的类目：${s.categories.join('、')}；主营：${(s.products || []).join('、') || '—'}
官网：${s.website || '无'}
${md.length > 300 ? `官网首页内容（节选）：\n${md}` : '官网打不开或没内容。'}

判断：
- is_company：是真实存在的公司（不是大学、研究所、政府 / 标准机构、协会）；
- website_ok：官网内容确实是这家公司（打不开就 false）；
- supplier：确实做科研仪器、实验室设备或试剂耗材（卖给实验室、科研、检测、研发）；科研算力也算（高性能计算 / AI 服务器、GPU / AI 加速卡、服务器 CPU、科学计算存储，归「计算机及其配套设备」，用户 10-21 定）；
- categories：从这些里选它真正做的（可多选，原样照抄）：${INSTRUMENT_CATEGORIES.map(c => c.name).join('、')}；
- name_cn / name_en：公司规范名称（中文名用公司自己的叫法，不要括号批注）。
只返回 JSON：{"is_company":true,"website_ok":true,"supplier":true,"categories":[""],"name_cn":"","name_en":"","why":"一句话"}`;
    try {
      const r = await generateContent(prompt, MODEL, { jsonMode: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'company-pipeline', task_name: 'Instrument Supplier Verify', institution: name, model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
      const v = parseJsonLoose(r.text) || {};
      const cats = [...new Set(((v.categories || []) as string[]).map(c => keyOf.get(String(c).trim())).filter(Boolean))] as string[];
      const ok = v.is_company === true && v.supplier === true && cats.length > 0;
      results.push({ ...s, ok, website_ok: v.website_ok === true && md.length > 300, verified_categories: cats, name_cn: cleanName(v.name_cn) || s.name_cn, name_en: cleanName(v.name_en) || s.name_en, why: v.why || '' });
      process.stdout.write(`\r核实了 ${results.length}/${cands.length}，通过 ${results.filter(x => x.ok).length}`);
    } catch (e: any) { results.push({ ...s, ok: false, why: `核实失败：${String(e?.message || e).slice(0, 60)}` }); }
  }
}));
console.log();
const pass = results.filter(r => r.ok), fail = results.filter(r => !r.ok);
console.log(`通过 ${pass.length} 家（国内 ${pass.filter(r => r.is_domestic).length}、官网核实 ${pass.filter(r => r.website_ok).length}），剔除 ${fail.length} 家`);
for (const f of fail.slice(0, 30)) console.log(`  ✗ ${f.name_cn || f.name_en}：${f.why}`);

fs.writeFileSync(IN.replace(/\.json$/, '-verified.json'), JSON.stringify({ at: new Date().toISOString(), pass, fail, dropped }, null, 1));
console.log('核实结果已存；和企业库比对、写库用 scripts/apply-instrument-suppliers.mts');
