/**
 * 找职业库该增补的职业（全量）：逻辑在 src/lib/occupation-gaps.ts，飞轮检测也用它（只看近 30 天新进的岗位）。
 *   npx tsx scripts/occupation-gaps.mts --model qwen-plus [--top 900] [--since 30] [--out reports/occupation-gaps.json]
 * 只出建议清单，不写库；要建就把清单（或挑过的）交给 scripts/occupation-add.mts。
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { findOccupationGaps } = await import('@/lib/occupation-gaps');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', process.env.CHEAP_MODEL || '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const OUT = opt('out', 'reports/occupation-gaps.json');

const r = await findOccupationGaps({ model: MODEL, top: Number(opt('top', '900')), sinceDays: Number(opt('since', '0')) || undefined, log: s => console.log(s) });
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
console.log(`→ ${OUT}`);
for (const g of r.gaps.slice(0, 50)) console.log(`  ${g.name}（${g.jobs} 个岗位）：${g.titles.slice(0, 4).join('、')}`);
if (r.aliasHints.length) console.log(`可记成别名：${r.aliasHints.slice(0, 15).map(a => `${a.titles.slice(0, 2).join('/')} → ${a.occupation}`).join('；')}`);
