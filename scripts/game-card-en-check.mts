/** 英文覆盖层校验：npx tsx scripts/game-card-en-check.mts [id …]（不给 = 全部）。对不齐、缺条、还有中文都报出来 */
import fs from 'node:fs';
import path from 'node:path';
import { checkEn } from '../src/lib/game/i18n';
const dir = path.join(import.meta.dirname, '../src/lib/game/cards');
const want = process.argv.slice(2);
let bad = 0; const passed: string[] = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && (!want.length || want.includes(f.replace(/\.json$/, ''))))) {
  const id = f.replace(/\.json$/, ''), enPath = path.join(dir, 'en', f);
  if (!fs.existsSync(enPath)) { console.log(`… ${id}：还没有英文`); continue; }
  const probs = checkEn(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), JSON.parse(fs.readFileSync(enPath, 'utf8')));
  if (probs.length) { bad++; console.log(`✗ ${id}`); probs.forEach(p => console.log('   - ' + p)); } else { console.log(`✓ ${id}`); passed.push(id); }
}
// 英文索引只收校验全过的（全量跑时才重写，免得只查几张就把别的卡挤出索引）
if (!want.length) {
  const ids = passed.sort();
  fs.writeFileSync(path.join(dir, 'en', 'index.ts'), `/** 英文覆盖层索引（scripts/game-card-en-check.mts 生成：只收校验全过的；别手改） */\n${ids.map((x, i) => `import e${i} from './${x}.json';`).join('\n')}\nimport type { CardEn } from '../../i18n';\nexport const EN: Record<string, CardEn> = { ${ids.map((x, i) => `'${x}': e${i} as unknown as CardEn`).join(', ')} };\n`);
  console.log(`英文卡池 ${ids.length} 张`);
}
process.exitCode = bad ? 1 : 0;
