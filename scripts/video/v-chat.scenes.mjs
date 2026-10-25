/** 《真活 1.0 · 聊着出题》：封面 → 对话（认企业、问素材、问参考、复述、出题、基线）→ 右侧空间 → 说「发布」→ 已发布。 */
import fs from 'node:fs';
import { run, BASE, cover, last } from './_rec-helpers.mjs';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const waitIdle = (ms = 240000) => [{ pause: true }, { eval: run(`await L.until(() => L.chatIdle(), ${ms}); await L.sleep(800); return 1;`), timeout: Math.round(ms / 1000) + 20 }, { resume: true }];
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('真活 1.0 使用演示 · 二//|聊着出题', '百业AI｜真活 · 平方智能', 92), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  { pause: true }, { go: `${BASE}/work/new/chat`, wait: 6000 }, { eval: run(`await L.until(() => document.querySelector('.wc-hero'), 20000); await L.sleep(500); return 1;`), timeout: 30 }, { resume: true },
  { note: 'chat_open' }, { eval: run(`await L.flash(document.querySelector('.wc-mode'), 1200); await L.sleep(4000); return 1;`), timeout: 20 },
  { note: 'chat_1' }, { eval: run(`await L.say('我要给高瓴资本找一个能做医疗健康控股型并购投后的人，出一道题。'); await L.sleep(1500); return 1;`), timeout: 30 },
  ...waitIdle(), { note: 'chat_1r' }, { eval: run(`${last} await L.sleep(7000); return 1;`), timeout: 30 },
  { note: 'chat_2' }, { eval: run(`await L.say('这次不用给素材，用你们库里的材料出。'); await L.sleep(1200); return 1;`), timeout: 30 },
  ...waitIdle(), { note: 'chat_2r' }, { eval: run(`${last} await L.sleep(6000); return 1;`), timeout: 30 },
  { note: 'chat_3' }, { eval: run(`await L.say('没有以前的题，直接出吧。'); await L.sleep(1200); return 1;`), timeout: 30 },
  ...waitIdle(), { note: 'chat_3r' }, { eval: run(`${last} await L.sleep(6000); return 1;`), timeout: 30 },
  { note: 'chat_4' }, { eval: run(`await L.say('对，出吧。'); await L.sleep(4000); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.until(() => document.querySelector('.wc-art') && L.chatIdle(), 600000); await L.sleep(1500); return 1;`), timeout: 620 }, { resume: true },
  { note: 'chat_done' }, { eval: run(`${last} await L.sleep(5000); await L.flash(document.querySelector('.wc-art'), 1500); await L.sleep(4000); return 1;`), timeout: 40 },
  { note: 'chat_pub' }, { eval: run(`await L.say('看过了，可以，发布吧。'); await L.sleep(1500); return 1;`), timeout: 30 },
  ...waitIdle(120000), { note: 'chat_pubr' }, { eval: run(`${last} await L.sleep(5000); return 1;`), timeout: 30 },
  { pause: true }, { go: cover('缺什么它问什么//|确认了再出', '百业AI｜真活 · 平方智能', 92), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 5 },
];
