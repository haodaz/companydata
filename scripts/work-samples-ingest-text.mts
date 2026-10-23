/**
 * 单份文本 / Markdown / PDF / docx → 深度样本（2026-10-24）：take-home 作业题（GitHub README）、单篇案例、内部考题都走这里。
 *   npx tsx scripts/work-samples-ingest-text.mts <file> --title "…" --source "…" [--kind case|practical|takehome] [--model qwen3.7-plus] [--dry]
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const argv = process.argv.slice(2); const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const FILE = argv.find(a => !a.startsWith('--'))!, TITLE = opt('title', FILE.split('/').pop()!), SOURCE = opt('source', 'ingest'), KIND = opt('kind', 'case') as any, MODEL = opt('model', 'qwen3.7-plus'), DRY = argv.includes('--dry');
const { extractText, parseSample, saveSample, listSamples } = await import('../src/lib/work/samples');
const raw = (await extractText(fs.readFileSync(FILE), FILE)).trim();
console.log(`${FILE}: ${raw.length} 字 → ${TITLE} [${KIND}]`);
if (raw.length < 200) { console.log('太短'); process.exit(1); }
if ((await listSamples({ sharedOnly: true })).some(x => x.title === TITLE)) { console.log('已有，跳过'); process.exit(0); }
if (DRY) process.exit(0);
const k = await parseSample(raw, { title: TITLE, model: MODEL, actor: 'ingest', kind: KIND });
if (!k.stages.length) { console.log('✗ 没解析出步骤'); process.exit(1); }
k.title = TITLE;
await saveSample(k, raw, { source_name: SOURCE, created_by: 'ingest@pingfang', shared: true });
console.log(`✓ ${k.problem_type} · ${k.industry} · ${k.format} · ${k.stages.length} 步：${k.stages.map(s => s.question.slice(0, 30)).join(' / ')}`);
process.exit(0);
