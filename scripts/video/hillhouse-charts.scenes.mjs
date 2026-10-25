/** 《真活 1.0 使用演示》补录：新封面 + 五张概念图卡（静态，各停几秒，插进对应段落之间）。 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const cover = (line, sub) => `${BASE}/video/cover-work.html?line=${encodeURIComponent(line)}&sub=${encodeURIComponent(sub)}&size=78`;
const chart = id => `${BASE}/video/chart-work.html?id=${id}`;
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('真活 1.0 使用演示//|出真活 · 做真活 · 评真活', '百业AI｜真活 · 平方智能'), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 6 },
  { pause: true }, { go: chart('two-ways'), wait: 1500 }, { resume: true }, { note: 'ch_two' }, { hold: 7 },
  { pause: true }, { go: chart('pipeline'), wait: 1500 }, { resume: true }, { note: 'ch_pipe' }, { hold: 7 },
  { pause: true }, { go: chart('three-ways'), wait: 1500 }, { resume: true }, { note: 'ch_three' }, { hold: 7 },
  { pause: true }, { go: chart('modules'), wait: 1500 }, { resume: true }, { note: 'ch_mod' }, { hold: 7 },
  { pause: true }, { go: chart('grading'), wait: 1500 }, { resume: true }, { note: 'ch_grade' }, { hold: 7 },
];
