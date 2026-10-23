/**
 * 深度样本批量入库（2026-10-24）：一本案例集 PDF → 按页抽文字 → 模型按每页开头判断每道题的页范围 → 每道题 parseSample 成骨架 → 入库（shared，训练素材）。
 *   npx tsx scripts/work-samples-ingest.mts <pdf> --source "Darden Casebook 2020-21" [--dry] [--model claude-sonnet-5-5] [--limit 3] [--concurrency 2]
 * --dry 只打印切出来的题目和页范围，不解析不入库。去重：同 source_name + 同 title 的跳过。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const argv = process.argv.slice(2); const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const PDF = argv.find(a => !a.startsWith('--'))!, SOURCE = opt('source', PDF.split('/').pop()!), DRY = argv.includes('--dry'), MODEL = opt('model', 'claude-sonnet-5-5'), LIMIT = Number(opt('limit', '0')), CONC = Number(opt('concurrency', '2'));
process.env.WORK_SAMPLE_MODEL = MODEL;
const { generateContent } = await import('../src/lib/llm-client');
const { parseJsonLoose } = await import('../src/lib/agents/search-llm');
const { parseSample, saveSample, listSamples } = await import('../src/lib/work/samples');
const { extractText, getDocumentProxy } = await import('unpdf');

const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(PDF)));
const { text } = await extractText(pdf); const pages = (text as unknown as string[]).map(p => p.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
console.log(`${PDF}: ${pages.length} 页`);
// 1) 切题：把每页开头 140 字给模型，让它按案例集的结构标出每道题的起止页（pdf 页号，从 1 起）
const heads = pages.map((p, i) => `[${i + 1}] ${p.replace(/\s+/g, ' ').slice(0, 140)}`).join('\n');
const splitPrompt = `下面是一本咨询 / 商学院案例集（casebook）每一页的开头。把它切成一道道完整的案例（case）：每道题从题目的标题页起，到它的结论 / 反馈表 / 附录结束（下一题标题页之前）。
不要把前面的方法论、行业概览、计算公式、目录当成题；附录里重复的 exhibit 归到它所属的题。
只返回 JSON：{ "cases": [ { "title": "题名", "firm": "出题公司（如 McKinsey，没有留空）", "industry": "", "start": 起始 pdf 页号, "end": 结束 pdf 页号 } ] }
${heads}`;
const res = await generateContent(splitPrompt, MODEL, { jsonMode: true });
const cases: { title: string; firm?: string; industry?: string; start: number; end: number }[] = (parseJsonLoose(res.text).cases || []).filter((c: any) => c.start >= 1 && c.end >= c.start && c.end <= pages.length);
console.log(`切出 ${cases.length} 道：`); for (const c of cases) console.log(`  p${c.start}-${c.end}  ${c.title}${c.firm ? ` · ${c.firm}` : ''}${c.industry ? ` · ${c.industry}` : ''}`);
if (DRY) process.exit(0);
// 2) 逐题解析入库
const have = new Set((await listSamples({ sharedOnly: true })).filter(x => x.source_name === SOURCE).map(x => x.title));
const todo = (LIMIT ? cases.slice(0, LIMIT) : cases).filter(c => !have.has(c.title));
console.log(`待入库 ${todo.length}（已有 ${cases.length - todo.length}）`);
let ok = 0, fail = 0;
const work = async (c: typeof cases[0]) => {
  const raw = pages.slice(c.start - 1, c.end).join('\n\n');
  try {
    const k = await parseSample(raw, { title: c.title, model: MODEL, actor: 'ingest' });
    if (!k.stages.length) { console.log(`  ✗ ${c.title}：没解析出步骤`); fail++; return; }
    k.title = c.title; if (!k.industry && c.industry) k.industry = c.industry;
    if (c.firm) k.style_notes.unshift(`出题公司：${c.firm}`);
    await saveSample(k, raw, { source_name: SOURCE, created_by: 'ingest@pingfang', shared: true });
    ok++; console.log(`  ✓ ${c.title} · ${k.problem_type} · ${k.stages.length} 步 · 算式 ${k.stages.reduce((a, s) => a + (s.calc?.length || 0), 0)}`);
  } catch (e: any) { fail++; console.log(`  ✗ ${c.title}：${String(e.message).slice(0, 120)}`); }
};
const q = [...todo]; await Promise.all(Array.from({ length: CONC }, async () => { while (q.length) await work(q.shift()!); }));
console.log(`done：入库 ${ok}，失败 ${fail}`);
process.exit(0);
