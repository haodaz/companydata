// 把写好、验过的卡导出到独立的游戏仓库（~/Documents/1job1life）：node scripts/game-export.mjs <id> [id…]
// 复制中文卡和英文覆盖层，按目标目录里的卡重写两个 index.ts；之后到游戏仓库 tsc、提交、推送（推 main 自动部署）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const ids = process.argv.slice(2);
if (!ids.length) { console.log('用法：node scripts/game-export.mjs <id> [id…]'); process.exit(1); }
const SRC = 'src/lib/game/cards', DST = path.join(os.homedir(), 'Documents/1job1life/src/lib/game/cards');
for (const id of ids) for (const sub of ['', 'en/']) {
  const from = `${SRC}/${sub}${id}.json`;
  if (!fs.existsSync(from)) { console.error(`缺 ${from}，什么都没导出`); process.exit(1); }
}
// 身份字段缺了不准导出（中文卡和英文覆盖层的字段名略有不同）
const blank = v => !String(v ?? '').trim();
for (const id of ids) {
  const c = JSON.parse(fs.readFileSync(`${SRC}/${id}.json`, 'utf8')), e = JSON.parse(fs.readFileSync(`${SRC}/en/${id}.json`, 'utf8'));
  const lost = [...['role', 'headline', 'unit', 'unit_type', 'city', 'city_tier', 'education', 'intro'].filter(k => blank(c[k])), ...(blank(c.occupation?.name) ? ['occupation.name'] : []), ...(blank(c.start?.level) ? ['start.level'] : []), ...['occupation', 'role', 'headline', 'unit', 'unit_type', 'city', 'city_tier', 'education', 'level', 'intro'].filter(k => blank(e[k])).map(k => `en.${k}`)];
  if (lost.length) { console.error(`${id} 缺身份字段：${lost.join('、')}，什么都没导出`); process.exit(1); }
}
for (const id of ids) for (const sub of ['', 'en/']) fs.copyFileSync(`${SRC}/${sub}${id}.json`, `${DST}/${sub}${id}.json`);
const list = fs.readdirSync(DST).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort();
const noEn = list.filter(i => !fs.existsSync(`${DST}/en/${i}.json`));
if (noEn.length) { console.error('这些卡没有英文覆盖层：', noEn.join(' ')); process.exit(1); }
fs.writeFileSync(`${DST}/index.ts`, ['/** 卡池（companydata 的 scripts/game-export.mjs 生成，别手改；只在服务端 import） */', ...list.map((x, i) => `import c${i} from './${x}.json';`), "import type { GameCard } from '../types';", `export const CARDS = [${list.map((_, i) => `c${i}`).join(', ')}] as unknown as GameCard[];`].join('\n') + '\n');
fs.writeFileSync(`${DST}/en/index.ts`, ['/** 英文覆盖层索引（companydata 的 scripts/game-export.mjs 生成；别手改） */', ...list.map((x, i) => `import e${i} from './${x}.json';`), "import type { CardEn } from '../../i18n';", `export const EN: Record<string, CardEn> = { ${list.map((x, i) => `'${x}': e${i} as unknown as CardEn`).join(', ')} };`].join('\n') + '\n');
console.log(`导出 ${ids.length} 张，卡池现在 ${list.length} 张。接着：cd ~/Documents/1job1life && npx tsc --noEmit && git add -A && git commit && git push`);
