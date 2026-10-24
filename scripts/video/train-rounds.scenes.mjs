/**
 * 《两轮训练》分镜（2026-10-24）：封面 → 训练前（老王的 ESG 题）→ 第一轮样本（样本库抽屉）→ 第一轮题 → 第二轮库（33 页）→ 三类来源各开一份 → 三道新题 → 同题三代 → 收尾。
 *   TOKEN_FILE=<登录 token> node scripts/video/drive.mjs out/train-rounds scripts/video/train-rounds.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();

const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  function glideEl(el, y, ms = 1800) { return new Promise(res => { const y0 = el.scrollTop, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); el.scrollTop = y0 + (y - y0) * ease(t); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  function glide(y, ms = 1800) { return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  const flash = async (el, ms = 900) => { if (!el) return; const o = el.style.boxShadow; el.style.transition = 'box-shadow .3s'; el.style.boxShadow = '0 0 0 3px #6055f5'; await sleep(ms); el.style.boxShadow = o; };
  const tab = async (txt) => { const t = [...document.querySelectorAll('.ant-tabs-tab')].find(x => x.innerText.includes(txt)); if (t) { t.click(); await sleep(1500); } return t; };
  // 样本库表格：翻页找到标题含 txt 的行，点开抽屉
  async function openSample(txt, maxPages = 40) { for (let p = 0; p < maxPages; p++) { const a = [...document.querySelectorAll('.ant-table a')].find(x => x.innerText.includes(txt)); if (a) { a.click(); await until(() => document.querySelector('.ant-drawer-open'), 8000); await sleep(1200); return true; } const nx = document.querySelector('.ant-pagination-next:not(.ant-pagination-disabled)'); if (!nx) return false; nx.click(); await sleep(700); } return false; }
  async function closeDrawer() { const c = document.querySelector('.ant-drawer-open .ant-drawer-close'); if (c) { c.click(); await sleep(700); } }
  async function drawerScroll(y, ms = 2200) { const b = document.querySelector('.ant-drawer-open .ant-drawer-body'); if (b) await glideEl(b, y, ms); }
  return (window.__ck = { sleep, until, glide, glideEl, top, kill, flash, tab, openSample, closeDrawer, drawerScroll });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
const cover = (line, sub) => `${BASE}/video/cover-work.html?line=${encodeURIComponent(line)}&sub=${encodeURIComponent(sub)}`;
const owner = (t, k) => `${BASE}/work/${t}/owner?k=${k}`;
const STAGES = `await L.until(() => document.querySelector('.ant-tabs-tab'), 20000); await L.tab('推进步骤'); await L.glide(560, 1600); await L.sleep(500);`;

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('两轮训练，|三组对比', '训练前 · 第一轮 · 第二轮'), wait: 2500 }, { resume: true },
  { note: 'cover' }, { hold: 7 },

  // 训练前：老王的 ESG 题
  { pause: true }, { go: owner('qyf7vRcSVbY', 'bMXH9AFNWZNLgZAS'), wait: 7000 }, { eval: run(`await L.until(() => document.querySelector('.ant-tabs-tab'), 20000); scrollTo(0, 0); await L.sleep(600); return 1;`), timeout: 30 }, { resume: true },
  { note: 'before' }, { eval: run(`await L.sleep(3000); await L.glide(520, 2200); await L.sleep(4000); await L.glide(1100, 2200); await L.sleep(6000); return 1;`), timeout: 40 },

  // 第一轮样本：样本库抽屉 McBurger
  { pause: true }, { go: `${BASE}/work/admin`, wait: 7000 }, { eval: run(`await L.until(() => document.querySelector('.ant-tabs-tab'), 20000); await L.tab('样本库'); await L.sleep(800); return 1;`), timeout: 40 }, { resume: true },
  { note: 'r1samples' }, { eval: run(`await L.openSample('McBurger'); await L.sleep(3000); await L.drawerScroll(700, 2600); await L.sleep(3000); await L.drawerScroll(1500, 2600); await L.sleep(4000); await L.closeDrawer(); return 1;`), timeout: 60 },

  // 第一轮题：百胜 推进步骤
  { pause: true }, { go: owner('FV4cetwjYdw', '46UqP7yTJ2AdyXed'), wait: 7000 }, { eval: run(STAGES + 'return 1;'), timeout: 40 }, { resume: true },
  { note: 'r1case' }, { eval: run(`await L.sleep(3000); await L.glide(1300, 2400); await L.sleep(4000); await L.glide(2100, 2400); await L.sleep(4000); return 1;`), timeout: 40 },

  // 第二轮库：33 页
  { pause: true }, { go: `${BASE}/work/admin`, wait: 7000 }, { eval: run(`await L.until(() => document.querySelector('.ant-tabs-tab'), 20000); await L.tab('样本库'); await L.until(() => document.querySelector('.ant-pagination'), 10000); await L.sleep(800); return 1;`), timeout: 40 }, { resume: true },
  { note: 'r2lib' }, { eval: run(`await L.sleep(2000); await L.glide(L.top(document.querySelector('.ant-pagination'), 700), 2000); await L.flash(document.querySelector('.ant-pagination'), 1800); await L.sleep(2500); return 1;`), timeout: 30 },
  { note: 'src1' }, { eval: run(`scrollTo(0, 0); await L.openSample('Alpha Aviation') || await L.openSample('Messi'); await L.sleep(3000); await L.drawerScroll(600, 2400); await L.sleep(4000); await L.drawerScroll(1400, 2400); await L.sleep(4000); await L.closeDrawer(); return 1;`), timeout: 90 },
  { note: 'src2' }, { eval: run(`scrollTo(0, 0); await L.openSample('电工 · 三级'); await L.sleep(3000); await L.drawerScroll(600, 2400); await L.sleep(4500); await L.drawerScroll(1400, 2400); await L.sleep(4500); await L.closeDrawer(); return 1;`), timeout: 120 },
  { note: 'src3' }, { eval: run(`scrollTo(0, 0); await L.openSample('SpotOn'); await L.sleep(3000); await L.drawerScroll(600, 2400); await L.sleep(4000); await L.closeDrawer(); return 1;`), timeout: 120 },

  // 三道新题：题库列表
  { pause: true }, { go: `${BASE}/work/admin`, wait: 7000 }, { eval: run(`await L.until(() => document.querySelectorAll('.ant-table-row').length > 0, 20000); scrollTo(0, 0); await L.sleep(600); return 1;`), timeout: 40 }, { resume: true },
  { note: 'r2cases' }, { eval: run(`await L.sleep(1500); for (const k of ['三选一', '归因评测', '德布勒森']) { const r = [...document.querySelectorAll('.ant-table-row')].find(x => x.innerText.includes(k)); if (r) { await L.glide(L.top(r, 300), 1200); await L.flash(r, 1400); } } await L.sleep(3500); return 1;`), timeout: 40 },

  // 同题三代
  { pause: true }, { go: owner('SRi1-_BfqFo', '7DL7NkqAJUU8aJJy'), wait: 7000 }, { eval: run(`await L.until(() => document.querySelector('.ant-tabs-tab'), 20000); await L.glide(560, 1200); await L.sleep(500); return 1;`), timeout: 40 }, { resume: true },
  { note: 'cmp0' }, { eval: run(`await L.sleep(2500); await L.glide(1100, 2200); await L.sleep(4000); return 1;`), timeout: 30 },
  { pause: true }, { go: owner('UlopPAQtXog', 'ttoZjPgBUfT-TE2O'), wait: 7000 }, { eval: run(STAGES + 'return 1;'), timeout: 40 }, { resume: true },
  { note: 'cmp1' }, { eval: run(`await L.sleep(2500); await L.glide(1300, 2400); await L.sleep(4500); return 1;`), timeout: 30 },
  { pause: true }, { go: owner('7U1PRPxQWVg', 'CR6s5lrlWXdkuzAe'), wait: 7000 }, { eval: run(STAGES + 'return 1;'), timeout: 40 }, { resume: true },
  { note: 'cmp2' }, { eval: run(`await L.sleep(3000); await L.glide(1300, 2400); await L.sleep(5000); return 1;`), timeout: 30 },
  { pause: true }, { go: owner('ZGAjovEtLYU', 'jASTxlkwmwgx4yev'), wait: 7000 }, { eval: run(STAGES + 'return 1;'), timeout: 40 }, { resume: true },
  { note: 'cmp3' }, { eval: run(`await L.sleep(3500); await L.glide(1300, 2400); await L.sleep(5000); return 1;`), timeout: 30 },

  { pause: true }, { go: cover('哪一组更像题，|老王定', '样本工程常态化 · 自主机考台'), wait: 2500 }, { resume: true },
  { note: 'end' }, { hold: 7 },
];
