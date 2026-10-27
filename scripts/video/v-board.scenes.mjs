/** 《真活 1.01 · 新操作台白板》：自由画 → 组件库搭一屏线框 → 交卷存图 + 转文字 → 和别的操作台混用。TOKEN_FILE=<登录令牌> */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { run, BASE, cover, chart } from './_rec-helpers.mjs';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const { data: ql } = await db.from('work_tasks').select('share_token, owner_key').eq('share_token', 'RQWwWVpEBzU').single();
const QL = `${BASE}/work/${ql.share_token}?k=${ql.owner_key}`;
// 组件库搭一屏：真点出来的主按钮挪进手机屏，其余组件按布局一件件放进去（用白板挂在 window 上的接口）
const BUILD = `const W = window.__workBoard, a = W.api;
  const f = a.getSceneElements().find(e => e.type === 'frame' && e.name === '手机屏'); if (!f) return 'no frame';
  const sel = a.getAppState().selectedElementIds || {}; const chosen = a.getSceneElements().filter(e => sel[e.id]);
  if (chosen.length) { const mx = Math.min(...chosen.map(e => e.x)), my = Math.min(...chosen.map(e => e.y)); a.updateScene({ elements: a.getSceneElements().map(e => sel[e.id] ? { ...e, x: e.x - mx + f.x + 117, y: e.y - my + f.y + 534, frameId: f.id } : e), appState: { selectedElementIds: {} } }); await L.sleep(900); }
  const place = (name, dx, dy) => { const it = W.lib.find(x => x.name === name); const g = 'g' + Math.random().toString(36).slice(2); const ne = W.convert(it.sk.map(s => ({ ...s, x: s.x + f.x + dx, y: s.y + f.y + dy }))).map(e => ({ ...e, groupIds: [g], frameId: f.id })); a.updateScene({ elements: [...a.getSceneElements(), ...ne] }); };
  for (const [n, x, y] of [['顶部导航栏', 0, 30], ['搜索框', 37, 100], ['卡片', 37, 156], ['列表项', 8, 360], ['列表项', 8, 432], ['标签', 37, 596], ['底部标签栏', 0, 748]]) { place(n, x, y); await L.sleep(750); }
  a.toggleSidebar?.({ name: 'default', force: false }); await L.sleep(600); a.scrollToContent(f, { fitToContent: true, animate: true }); await L.sleep(2200); return 'built';`;
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('真活 1.01//|新操作台：白板', '百业AI｜真活 · 平方智能', 92), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  { pause: true }, { go: chart('board'), wait: 1500 }, { resume: true }, { note: 'ch_board' }, { hold: 7 },
  // 进一道设计任务：IP 形象交在白板上
  { pause: true }, { go: QL, wait: 3000 }, { eval: run(`localStorage.clear(); localStorage.setItem('work-tour-done', '1'); return 1;`), timeout: 10 }, { go: QL, wait: 6000 },
  { eval: run(`const n = document.querySelector('input[placeholder="姓名 / 昵称"]'); if (n) { L.setVal(n, '示范 · 设计'); await L.sleep(300); L.btn(/开始做/)?.click(); } await L.until(() => document.querySelector('.excalidraw'), 20000); await L.sleep(2500); document.querySelector('button[title^="最小化"]')?.click(); await L.sleep(1200); return 1;`), timeout: 40 },
  { resume: true }, { note: 'board_open' }, { eval: run(`const c = [...document.querySelectorAll('span')].find(x => /白板画形象/.test(x.textContent)); await L.flash(c, 1500); await L.sleep(3500); return 1;`), timeout: 20 },
  // 自由画
  { note: 'board_draw' },
  { key: 'v' }, { drag: { rel: '.excalidraw', from: [60, 520], to: [70, 530], steps: 2 } },
  { key: 'r' }, { drag: { rel: '.excalidraw', from: [300, 150], to: [470, 230] } },
  { key: 'o' }, { drag: { rel: '.excalidraw', from: [320, 280], to: [440, 400] } },
  { key: 'a' }, { drag: { rel: '.excalidraw', from: [500, 340], to: [660, 340] } },
  { key: 'p' }, { drag: { rel: '.excalidraw', from: [700, 200], to: [800, 330], steps: 26 } }, { key: 'v' }, { hold: 1.5 },
  // 组件库搭一屏
  { note: 'board_lib' },
  { eval: run(`L.btn(/^手机屏$/)?.click(); await L.sleep(1800); L.btn(/^组件库$/)?.click(); await L.sleep(2200); const u = document.querySelectorAll('.library-unit')[0]; if (u) u.setAttribute('data-pick', '1'); return !!u;`), timeout: 20 },
  { clickAt: { rel: '[data-pick="1"]', at: [30, 22] } }, { hold: 1.2 },
  { eval: run(BUILD), timeout: 40 }, { hold: 2 },
  // 交卷：存图 + 转文字
  { note: 'board_submit' }, { eval: run(`const b = L.btn(/交卷/); await L.flash(b, 1800); await L.sleep(4500); return 1;`), timeout: 20 },
  // 和别的操作台混用
  { note: 'board_tabs' }, { eval: run(`const t = [...document.querySelectorAll('button')].filter(x => /^d[0-9]/.test(x.innerText.trim())); for (const x of t.slice(1)) { await L.flash(x, 700); x.click(); await L.sleep(2200); } t[0]?.click(); await L.sleep(1800); return 1;`), timeout: 30 },
  { pause: true }, { go: cover('白板//|已上线', '百业AI｜真活 · www.aidataoffice.com', 100), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 4 },
];
