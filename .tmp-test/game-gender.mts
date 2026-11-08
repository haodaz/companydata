import fs from 'node:fs';
const dir = 'src/lib/game/cards', set = process.argv.includes('--set');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const c = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const t = JSON.stringify([c.intro, c.day, c.events, c.choices, c.endings, c.past, c.late, c.headline, c.brief]);
  const F = (t.match(/丈夫|老公|男朋友|怀孕|(?<!陪)产假|孕期|哺乳|月子|嫁/g) || []).length, M = (t.match(/妻子|老婆|媳妇|女朋友|彩礼|娶/g) || []).length;
  const g = F > M && F >= 1 ? 'f' : M > F && M >= 1 ? 'm' : undefined;
  console.log(f.padEnd(28), 'F', F, 'M', M, '→', g || '不限', c.gender ? `(已标 ${c.gender})` : '');
  if (set && g && !c.gender) { c.gender = g; fs.writeFileSync(`${dir}/${f}`, JSON.stringify(c, null, 1)); }
}
