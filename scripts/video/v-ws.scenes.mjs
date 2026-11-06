/** 《真活工作台怎么用》（11-06，给国内产品与技术）：封面 → 图卡 → 首页 → 聊着出一道任务（问到的都点按钮）→ 发布 → 问报告、比人 → 四个侧栏页各几秒 → 收尾 */
import fs from 'node:fs';
import { run, BASE, cover, chart, last } from './_rec-helpers.mjs';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const busy = `!L.chatIdle() || document.querySelector('.wc-typing')`;
const waitIdle = (ms = 300000) => [{ pause: true }, { eval: run(`await L.sleep(1500); await L.until(() => !(${busy}), ${ms}); await L.sleep(1000); return 1;`), timeout: Math.round(ms / 1000) + 20 }, { resume: true }];
// 助理问话（ask_user 按钮）：按偏好点一个；没有待答的就什么也不做
const answer = prefer => run(`const asks = [...document.querySelectorAll('.wc-ask')]; const a = asks[asks.length - 1]; if (!a) return 0; const opts = [...a.querySelectorAll('button')].filter(b => !b.disabled); if (!opts.length) return 0; const o = opts.find(b => ${prefer}.test(b.textContent)) || opts[0]; await L.flash(o, 900); o.click(); await L.sleep(1500); return o.textContent;`);
const show = (secs = 7) => run(`${last} await L.sleep(${secs * 1000}); return 1;`);
const PREF = '/就这样|出吧|确认|没有|不用|直接|好的|可以|默认/';
const round = n => [...waitIdle(), { note: `chat_r${n}` }, { eval: show(7), timeout: 30 }, { note: `chat_a${n}` }, { eval: answer(PREF), timeout: 20 }];
const page = (url, note, secs = 5) => [{ pause: true }, { go: `${BASE}${url}`, wait: 7000 }, { eval: run(`await L.until(() => !document.body.innerText.includes('读取中'), 30000); await L.sleep(800); return 1;`), timeout: 40 }, { resume: true }, { note }, { hold: secs }];
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: `${BASE}/work/ws`, wait: 4000 }, { local: { 'wws-tour-home': '1', 'wws-tour-chat': '1' } },
  { go: cover('真活工作台//|怎么用', '百业AI｜真活 · 给国内产品与技术', 96), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 6 },
  { pause: true }, { go: chart('ws-map'), wait: 1500 }, { resume: true }, { note: 'map' }, { hold: 11 },
  ...page('/work/ws', 'home', 1),
  { eval: run(`await L.flash(document.querySelector('.wws-nav'), 1600); await L.sleep(1500); return 1;`), timeout: 20 },
  { note: 'home_ask' },
  { eval: run(`const ta = document.querySelector('.wc-composer textarea'); await L.type(ta, '我要给高瓴资本找一个能看懂 AI 基础设施、做早期投资的分析师，出一道真活。', 45); await L.sleep(700); document.querySelector('.wc-send').click(); await L.sleep(2500); return 1;`), timeout: 40 },
  ...round(1), ...round(2), ...round(3), ...round(4), ...round(5),
  { pause: true }, { eval: run(`await L.until(() => document.querySelector('.wc-art iframe') && !(${busy}), 600000); await L.sleep(4000); return 1;`), timeout: 620 }, { resume: true },
  { note: 'task_done' }, { eval: run(`${last} await L.sleep(4000); await L.flash(document.querySelector('.wc-art'), 1500); await L.sleep(6000); return 1;`), timeout: 40 },
  { note: 'task_scroll' }, { eval: run(`const d = document.querySelector('.wc-art iframe')?.contentDocument; const el = d && ([...d.querySelectorAll('div,main')].filter(e => getComputedStyle(e).overflowY !== 'visible' && e.scrollHeight - e.clientHeight > 200).sort((a, b) => b.clientHeight - a.clientHeight)[0] || d.scrollingElement); if (el) await L.glideEl(el, 900, 3000); await L.sleep(4000); if (el) await L.glideEl(el, 0, 1500); return 1;`), timeout: 30 },
  { note: 'pub' }, { eval: run(`await L.say('看过了，发布吧。'); await L.sleep(1500); return 1;`), timeout: 30 },
  ...waitIdle(), { note: 'pub_r' }, { eval: show(5), timeout: 30 }, { note: 'pub_a' }, { eval: answer('/发布|确认|好|可以/'), timeout: 20 },
  ...waitIdle(), { note: 'pub_r2' }, { eval: show(5), timeout: 30 },
  // 第二件事：新开一个对话问报告
  ...page('/work/ws', 'home2', 1),
  { note: 'rep_ask' },
  { eval: run(`const ta = document.querySelector('.wc-composer textarea'); await L.type(ta, '我之前那道高瓴「看懂 AI 基础设施」的题，周明远交过卷的那道，谁做得最好？', 45); await L.sleep(700); document.querySelector('.wc-send').click(); await L.sleep(2500); return 1;`), timeout: 40 },
  ...waitIdle(), { note: 'rep_r1' }, { eval: show(8), timeout: 30 }, { note: 'rep_a1' }, { eval: answer('/周明远|AI 基础设施|那道/'), timeout: 20 },
  ...waitIdle(), { note: 'rep_r2' }, { eval: show(8), timeout: 30 },
  { note: 'cmp_ask' }, { eval: run(`await L.say('把周明远和林一诺比一下，差在哪？'); await L.sleep(1500); return 1;`), timeout: 30 },
  ...waitIdle(), { note: 'cmp_r' }, { eval: show(10), timeout: 30 }, { note: 'cmp_a' }, { eval: answer('/比|对比|确认|好/'), timeout: 20 },
  ...waitIdle(), { note: 'cmp_r2' }, { eval: show(6), timeout: 30 },
  ...page('/work/ws/tasks', 'tasks', 5),
  ...page('/work/ws/reports', 'reports', 5),
  ...page('/work/ws/kb', 'kb', 5),
  ...page('/work/ws/library', 'library', 5),
  { pause: true }, { go: cover('说要什么//|AI 去办', '百业AI｜真活 · 平方智能', 96), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 5 },
];
