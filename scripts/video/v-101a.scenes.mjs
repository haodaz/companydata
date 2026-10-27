/** 《真活 1.01 · 任务库》：挑一道 → 原题直出换成自己公司 → 只问企业 → 出好的样子。TOKEN_FILE=<登录令牌> */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { run, BASE, cover, chart } from './_rec-helpers.mjs';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
// 从任务库「原题直出」换成亿纬锂能出的那道（10-27 实测）；潜历 IP 那道（白板）
const { data: eve } = await db.from('work_tasks').select('share_token, owner_key').eq('company_name', '亿纬锂能').order('created_at', { ascending: false }).limit(1).single();
const EVE = `${BASE}/work/${eve.share_token}/owner?k=${eve.owner_key}`;
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('真活 1.01//|任务库', '百业AI｜真活 · 平方智能', 100), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
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
  { pause: true }, { go: cover('任务库//|已上线', '百业AI｜真活 · www.aidataoffice.com', 96), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 4 },
];
