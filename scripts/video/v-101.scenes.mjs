/** 《真活 1.01》更新短片：任务库（挑一道 → 原题直出换成自己公司 → 只问企业 → 出好的样子）+ 新操作台白板。TOKEN_FILE=<登录令牌> */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { run, BASE, cover, chart } from './_rec-helpers.mjs';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
// 从任务库「原题直出」换成亿纬锂能出的那道（10-27 实测）；潜历 IP 那道（白板）
const { data: eve } = await db.from('work_tasks').select('share_token, owner_key').eq('company_name', '亿纬锂能').order('created_at', { ascending: false }).limit(1).single();
const { data: ql } = await db.from('work_tasks').select('share_token, owner_key').eq('share_token', 'RQWwWVpEBzU').single();
const EVE = `${BASE}/work/${eve.share_token}/owner?k=${eve.owner_key}`, QL = `${BASE}/work/${ql.share_token}?k=${ql.owner_key}`;
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('真活 1.01//|任务库 + 白板', '百业AI｜真活 · 平方智能', 96), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  // 任务库
  { pause: true }, { go: `${BASE}/work/library`, wait: 6000 }, { resume: true }, { note: 'lib_page' },
  { eval: run(`await L.sleep(1500); for (const t of ['法律', '咨询', '新能源制造', '全部']) { const b = [...document.querySelectorAll('.wl-chips button')].find(x => x.textContent.startsWith(t)); if (b) { b.click(); await L.sleep(1700); } } return 1;`), timeout: 30 },
  { pause: true }, { go: chart('library'), wait: 1500 }, { resume: true }, { note: 'ch_lib' }, { hold: 6 },
  { pause: true }, { go: `${BASE}/work/library`, wait: 6000 }, { resume: true }, { note: 'lib_open' },
  { eval: run(`await L.sleep(800); const c = [...document.querySelectorAll('.wl-card')].find(x => /欧洲供需平衡/.test(x.textContent)) || document.querySelector('.wl-card'); await L.flash(c, 900); c.click(); await L.sleep(2500); const dr = document.querySelector('.ant-drawer-body'); if (dr) await L.glideEl(dr, dr.scrollHeight, 3500); await L.sleep(1200); return 1;`), timeout: 30 },
  { note: 'lib_use' }, { eval: run(`const lb = [...document.querySelectorAll('.wl-use label')][0]; await L.flash(lb, 1200); lb?.click(); await L.sleep(1200); const b = L.btn(/^填表出任务/); await L.flash(b, 1000); b?.click(); await L.sleep(3500); return 1;`), timeout: 30 },
  { note: 'lib_form' }, { eval: run(`const i = await L.until(() => document.querySelector('input.ant-select-input, .ant-select-selection-search-input'), 15000); await L.type(i, '亿纬锂能', 160); await L.sleep(1800); const o = await L.until(() => [...document.querySelectorAll('.ant-select-item-option')].find(x => /亿纬锂能/.test(x.textContent)), 8000); if (o) o.click(); await L.sleep(1800); const go = L.btn(/出任务（约/); await L.flash(go, 1500); await L.sleep(1500); return 1;`), timeout: 45 },
  { pause: true }, { go: EVE, wait: 9000 }, { eval: run(`try { localStorage.setItem('work-owner-tour-done', '1'); } catch {} const sk = L.btn(/^跳过$|^知道了$/); if (sk) sk.click(); return 1;`), timeout: 15 }, { resume: true }, { note: 'lib_result' },
  { eval: run(`await L.sleep(2500); await L.glide(520, 2600); await L.sleep(2500); const t = [...document.querySelectorAll('.ant-tabs-tab')].find(x => /材料包/.test(x.textContent)); if (t) { t.click(); await L.sleep(3000); } return 1;`), timeout: 30 },
  // 白板
  { pause: true }, { go: chart('board'), wait: 1500 }, { resume: true }, { note: 'ch_board' }, { hold: 6 },
  { pause: true }, { go: QL, wait: 3000 }, { eval: run(`localStorage.clear(); localStorage.setItem('work-tour-done', '1'); return 1;`), timeout: 10 }, { go: QL, wait: 6000 },
  { eval: run(`const n = document.querySelector('input[placeholder="姓名 / 昵称"]'); if (n) { L.setVal(n, '示范 · 设计'); await L.sleep(300); L.btn(/开始做/)?.click(); } await L.until(() => document.querySelector('.excalidraw'), 20000); await L.sleep(3000); return 1;`), timeout: 40 }, { resume: true }, { note: 'board_demo' },
  { eval: run(`document.querySelector('button[title^="最小化"]')?.click(); await L.sleep(1200); [...document.querySelectorAll('button')].find(x => x.innerText.trim() === '手机屏')?.click(); await L.sleep(2200); return document.querySelector('.excalidraw')?.getBoundingClientRect().height;`), timeout: 15 },
  { key: 'v' }, { drag: { rel: '.excalidraw', from: [60, 520], to: [70, 530], steps: 2 } },
  { key: 'r' }, { drag: { rel: '.excalidraw', from: [370, 110], to: [580, 165] } },
  { key: 'o' }, { drag: { rel: '.excalidraw', from: [420, 200], to: [530, 310] } },
  { key: 'a' }, { drag: { rel: '.excalidraw', from: [610, 260], to: [760, 260] } },
  { eval: run(`[...document.querySelectorAll('button')].find(x => x.innerText.trim() === '便签')?.click(); await L.sleep(1800); return 1;`), timeout: 15 },
  { key: 'p' }, { drag: { rel: '.excalidraw', from: [400, 380], to: [560, 430], steps: 26 } }, { key: 'v' }, { hold: 2 },
  { note: 'board_tabs' }, { eval: run(`const t = [...document.querySelectorAll('button')].filter(x => /^d[0-9]/.test(x.innerText.trim())); for (const x of t.slice(1)) { await L.flash(x, 700); x.click(); await L.sleep(2200); } t[0]?.click(); await L.sleep(1500); return 1;`), timeout: 30 },
  { pause: true }, { go: cover('真活 1.01//|已上线', '百业AI｜真活 · www.aidataoffice.com', 96), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 4 },
];
