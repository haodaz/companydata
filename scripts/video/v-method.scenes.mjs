/**
 * 《一份展会会刊，变成一堂科研课》（2026-11-02，约 2 分钟）：封面 → 一份数据喂三处 → 中间加一层「实验方法」→ 方法库（细胞培养：步骤、常见坑、库里的真实产品）
 *   → 几个别的方法一闪（证明有）→ 百业科研空间（研一进组第一周，09:15 污染瓶那一段走两步）→ 科研真活（细胞房设备选型，材料是库里的真实型号）→ 片尾。
 *   node scripts/video/drive.mjs out/v-method scripts/video/v-method.scenes.mjs --width=1600 --height=900 --dsf=2 --out=3200x1800
 * 后台页要登录：ADMIN_TOKEN_FILE 指向一行 auth_token（不进仓库）。
 */
import fs from 'node:fs';
import { run as labRun } from './lab-surgeon.scenes.mjs';
import { run, BASE, cover as cov } from './_rec-helpers.mjs';
const cover = (line, sub, size) => `${cov(line, sub, size)}&badge=0&brand=${encodeURIComponent('平方数据工厂 · 百业AI')}`;

const TOKEN = fs.readFileSync(process.env.ADMIN_TOKEN_FILE, 'utf8').trim().split('\n').pop();
const SPACE = 'e6f03835-67b4-43e0-9d2d-6e3da7e73f99';
const WORK = 'SQ9Pp4IG_X0';
const chart = id => `${BASE}/video/chart-method.html?id=${id}&linked=6601`;
const DRAWER = `document.querySelector('.ant-drawer-body')`;
const toHead = (txt, off = 10, ms = 2200) => run(`const b = await L.until(() => ${DRAWER}); await L.sleep(300); const h = await L.until(() => [...b.querySelectorAll('span')].find(x => x.textContent.startsWith('${txt}'))); await L.glideEl(b, h.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - ${off}, ${ms}); return 1;`);

// 进某一段：一天页选时段 → 进入操作台 → 开始这一段
const enter = slot => labRun(`
  window.__stepFrom = 0;
  const t = await L.until(() => [...document.querySelectorAll('.dayv-tl button')].find(b => b.innerText.includes('${slot}')));
  await L.click(t, 1500); window.scrollTo({ top: 0 });
  await L.click(await L.until(() => L.btn('进入操作台')), 2500);
  await L.click(await L.until(() => L.btn('开始这一段')), 1800); return 'start ${slot}';`);
// 按示范答案走前 n 步
const walk = (slot, n) => labRun(`
  const sp = await fetch('/api/lab/spaces/${SPACE}').then(r => r.json());
  const ch = sp.space.chapters.find(c => c.slot === '${slot}'); const tr = ch.expert_trace || {}; const out = [];
  await L.dialogue(); await L.sleep(600);
  for (const st of ch.sim.steps.slice(0, ${n})) { if (st.type === 'text' || st.type === 'bench') break; out.push(st.id + ':' + await L.answer(st, tr[st.id])); await L.sleep(900); }
  return out;`);

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('一份展会会刊//|变成一堂科研课', '慕尼黑上海分析生化展 → 实验方法 → 百业科研模拟 · 科研真活', 92), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  { pause: true }, { go: chart('flow'), wait: 1500 }, { resume: true }, { note: 'ch_flow' }, { hold: 10 },
  { pause: true }, { go: chart('layer'), wait: 1500 }, { resume: true }, { note: 'ch_layer' }, { hold: 10 },

  // 方法库列表
  { pause: true }, { go: `${BASE}/admin/db-method`, wait: 5000 }, { resume: true }, { note: 'methods' }, { hold: 4 },
  { scroll: 420, over: 2.5 }, { hold: 2 },
  // 细胞培养：简介 + 操作指南
  { pause: true }, { go: `${BASE}/admin/db-method?id=1`, wait: 5000 }, { resume: true }, { note: 'cell' }, { hold: 3 },
  { eval: toHead('操作指南', 10, 2600), timeout: 20 }, { hold: 3 },
  // 常见坑
  { eval: toHead('常见坑', 10, 1800), timeout: 20 }, { note: 'pitfalls' }, { hold: 5 },
  { eval: run(`const b = ${DRAWER}; await L.glideEl(b, b.scrollTop + 520, 3500); return 1;`), timeout: 20 }, { hold: 2 },
  // 库里对上的真实产品
  { eval: toHead('科研产品库里对上的产品', 10, 2200), timeout: 20 }, { note: 'products' }, { hold: 3 },
  { eval: run(`const b = ${DRAWER}; await L.glideEl(b, b.scrollHeight, 3500); return 1;`), timeout: 20 }, { hold: 1.5 },
  // 证明有：别的方法一闪
  { pause: true }, { go: `${BASE}/admin/db-method?id=41`, wait: 4500 }, { eval: toHead('常见坑', 10, 10), timeout: 20 }, { resume: true }, { note: 'proof' }, { hold: 2.5 },
  { pause: true }, { go: `${BASE}/admin/db-method?id=53`, wait: 4500 }, { eval: toHead('常见坑', 10, 10), timeout: 20 }, { resume: true }, { hold: 2.5 },

  // 百业科研空间：主页 → 一天 → 09:15 走两步
  // 空间主页是深色的，全片浅色，不进主页，直接进一天页
  { pause: true }, { go: `${BASE}/lab/${SPACE}?m=test`, wait: 6000 },
  { local: { 'lab:visitor': 'v:demo-method-video', 'lab:rookie': { name: '小周', note: '生物学 · 研一', location: '上海' }, 'lab:rookie:asked': '1' }, wait: 8000 },
  { resume: true }, { note: 'day' }, { hold: 3 }, { scroll: 600, over: 3 }, { scroll: 0, over: 1.5 },
  { eval: enter('09:15'), timeout: 40 }, { note: 'chapter' },
  { eval: walk('09:15', 2), timeout: 120 }, { hold: 2 },

  // 科研真活：任务书 → 作答页（左边材料就是库里的真实型号）
  { pause: true }, { go: `${BASE}/work/${WORK}`, wait: 5000 }, { resume: true }, { note: 'work' }, { hold: 4 }, { scroll: 500, over: 3 }, { hold: 2 },
  { pause: true },
  { eval: run(`localStorage.setItem('work-tour-done', '1'); window.scrollTo(0, 0); const i = await L.until(() => document.querySelector('input[placeholder="姓名 / 昵称"]')); await L.type(i, '演示·录片', 10); await L.sleep(300); L.btn(/开始做/).click(); await L.until(() => [...document.querySelectorAll('div')].some(d => d.textContent.trim() === '真活台'), 20000); await L.sleep(2500); return 1;`), timeout: 40 },
  { resume: true }, { note: 'work_mat' }, { hold: 4 },
  { eval: run(`const el = [...document.querySelectorAll('.wk-mat')][0]; const box = el?.closest('div[style*="overflow"]') || el?.parentElement; if (box) await L.glideEl(box, 900, 5000); return 1;`), timeout: 20 }, { hold: 2 },

  { pause: true }, { go: cover('九十块钱的数据//|一堂课 · 一道真活', '平方数据工厂 · 企业库 · 北辰严选 · 百业', 92), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 5 },
];
