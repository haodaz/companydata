/**
 * 展商名单图片 OCR 文字 → 展商列表（数据部门 10-23 #42：2024 慕尼黑上海分析生化展的名单是文章里的图片）。
 * 每张图一段交给模型：只整理 OCR 原文里的公司名（中文名 / 英文名配对），修正明显的识别错字，不补原文没有的公司。
 *   npx tsx scripts/parse-exhibitor-ocr.mts --model qwen-plus --in reports/munich-shanghai-2024-ocr.txt --out reports/munich-shanghai-2024-exhibitors.json
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error('--model 要用模型选单里的'); process.exit(1); }
const parts = fs.readFileSync(opt('in'), 'utf8').split(/^### .*$/m).map(s => s.trim()).filter(s => s.length > 30);
const all: any[] = [];
for (const [i, part] of parts.entries()) {
  const r = await generateContent(`下面是展会展商名单图片的 OCR 文字（每家通常是：中文公司名、英文公司名、展位号，可能只有其中一种；行可能断开或错位）。
把它整理成展商列表：只收原文里出现的公司；同一家的中文名和英文名配成一条；修正明显的 OCR 错字（如「袋商」→「展商」、「Shanghail」→「Shanghai」），不要补原文没有的公司；表头、展位号单独成行的不要。
只返回 JSON：{"exhibitors":[{"name_cn":"","name_en":"","booth":""}]}
OCR 文字：
${part.slice(0, 12000)}`, MODEL, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'company-pipeline', task_name: 'Exhibitor OCR Parse', institution: '慕尼黑上海分析生化展 2024', model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const list = ((parseJsonLoose(r.text)?.exhibitors || []) as any[]).filter(e => e?.name_cn || e?.name_en);
  all.push(...list);
  process.stdout.write(`\r第 ${i + 1}/${parts.length} 张：累计 ${all.length} 家`);
}
const uniq = [...new Map(all.map(e => [String(e.name_cn || e.name_en).replace(/\s+/g, '').toLowerCase(), e])).values()];
fs.writeFileSync(opt('out'), JSON.stringify(uniq, null, 1));
console.log(`\n去重后 ${uniq.length} 家 → ${opt('out')}`);
