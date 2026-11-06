/** 《真活工作台怎么用》补录：主录到任务库时磁盘满了，补任务库 + 结尾 */
import fs from 'node:fs';
import { run, BASE, cover } from './_rec-helpers.mjs';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: `${BASE}/work/ws`, wait: 4000 }, { local: { 'wws-tour-home': '1', 'wws-tour-chat': '1' } },
  { go: `${BASE}/work/ws/kb`, wait: 7000 }, { eval: run(`await L.until(() => !document.body.innerText.includes('读取中'), 30000); await L.sleep(800); return 1;`), timeout: 40 }, { resume: true }, { note: 'kb' }, { hold: 5 },
  { pause: true }, { go: `${BASE}/work/ws/library`, wait: 7000 }, { eval: run(`await L.until(() => !document.body.innerText.includes('读取中'), 30000); await L.sleep(800); return 1;`), timeout: 40 }, { resume: true }, { note: 'library' }, { hold: 6 },
  { pause: true }, { go: cover('说要什么//|AI 去办', '百业AI｜真活 · 平方智能', 96), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 5 },
];
