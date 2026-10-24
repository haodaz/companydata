/**
 * 《考试台与插件》分镜（2026-10-24）：封面 → 参与页三种做法 → 设计台（宁德 PLC：推进 / 画图 / 参数表）→ 代码台（阿里）→ 插件页 → 手机预览 → 收尾。
 * 录制会以「平方演示」开两个作答，录完删。
 *   TOKEN_FILE=<登录 token> node scripts/video/drive.mjs out/bench-plugin scripts/video/bench-plugin.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
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
  async function start(name = '平方演示') { const inp = document.querySelector('input'); if (!inp) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, name); inp.dispatchEvent(new Event('input', { bubbles: true })); await sleep(300); const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('开始做')); b && b.click(); await until(() => !document.body.innerText.includes('留个名字就开始'), 15000); await sleep(1500); return true; }
  // 设计台：慢慢填两个参数
  async function type(el, text, ms = 90) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; for (let i = 1; i <= text.length; i++) { set.call(el, text.slice(0, i)); el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(ms); } }
  return (window.__ck = { sleep, until, glide, glideEl, top, kill, flash, start, type });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
const cover = (line, sub) => `${BASE}/video/cover-work.html?line=${encodeURIComponent(line)}&sub=${encodeURIComponent(sub)}`;

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('像机考，|又是真活', '三种做法 · 设计台 · 代码台 · 插件 · 手机'), wait: 2500 }, { resume: true },
  { note: 'cover' }, { hold: 7 },

  // 三种做法
  { pause: true }, { go: `${BASE}/work/ZGAjovEtLYU`, wait: 7000 }, { eval: run(`await L.until(() => document.body.innerText.includes('怎么做'), 20000); const h = [...document.querySelectorAll('div')].find(x => x.textContent === '怎么做'); if (h) scrollTo(0, L.top(h, 140)); await L.sleep(600); return 1;`), timeout: 30 }, { resume: true },
  { note: 'choose' }, { eval: run(`const cards = [...document.querySelectorAll('div')].filter(x => /^[●○] /.test(x.textContent) && x.textContent.length < 20).map(x => x.parentElement); for (const c of cards) { await L.flash(c, 1600); await L.sleep(600); } await L.sleep(3000); return 1;`), timeout: 40 },

  // 设计台
  { note: 'design' }, { eval: run(`await L.glide(document.body.scrollHeight, 1500); await L.start(); await L.until(() => document.body.innerText.includes('属性 · 参数表'), 20000); await L.sleep(4000); const q2 = [...document.querySelectorAll('div')].find(x => x.textContent.startsWith('Q2') && x.textContent.length < 40); if (q2) { q2.parentElement.click(); await L.sleep(3500); } return 1;`), timeout: 60 },
  { note: 'params' }, { eval: run(`const inputs = [...document.querySelectorAll('input')].filter(i => i.closest('[class*=param], .ant-input, div')); const ins = [...document.querySelectorAll('input[type=text], input:not([type])')].slice(0, 2); if (ins[0]) { ins[0].focus(); await L.type(ins[0], '11.3'); await L.sleep(800); } if (ins[1]) { ins[1].focus(); await L.type(ins[1], '7.5'); await L.sleep(800); } await L.sleep(3500); return 1;`), timeout: 40 },

  // 代码台
  { pause: true }, { go: `${BASE}/work/4M3njYU9GM0`, wait: 7000 }, { eval: run(`await L.until(() => document.body.innerText.includes('留个名字就开始'), 20000); await L.glide(document.body.scrollHeight, 800); await L.start(); await L.until(() => document.body.innerText.includes('EXPLORER') || document.querySelector('textarea'), 20000); await L.sleep(1500); return 1;`), timeout: 60 }, { resume: true },
  { note: 'code' }, { eval: run(`await L.sleep(3000); const m = [...document.querySelectorAll('div')].find(x => x.textContent.startsWith('m1') && x.textContent.length < 80); if (m) { m.click(); await L.sleep(3000); } await L.sleep(3000); return 1;`), timeout: 40 },

  // 插件页
  { pause: true }, { go: `${BASE}/work/plugin`, wait: 7000 }, { eval: run(`await L.sleep(500); scrollTo(0, 0); return 1;`), timeout: 20 }, { resume: true },
  { note: 'plugin' }, { eval: run(`await L.sleep(3000); await L.glide(700, 2400); await L.sleep(3500); await L.glide(1500, 2400); await L.sleep(3500); return 1;`), timeout: 40 },

  // 手机
  { pause: true }, { go: `${BASE}/video/phone.html?url=${encodeURIComponent('/work/FV4cetwjYdw')}`, wait: 7000 }, { resume: true },
  { note: 'mobile' }, { eval: run(`await L.sleep(3000); const f = document.getElementById('f'); try { const d = f.contentDocument; const t0 = performance.now(); const y = 900; const step = now => { const t = Math.min(1, (now - t0) / 2600); d.documentElement.scrollTop = y * (t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2); if (t < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); } catch {} await L.sleep(6000); return 1;`), timeout: 30 },

  { pause: true }, { go: cover('操作台，|越收越多', '四种站内台 · 插件 · 录屏 · 下一步：自动校核的机考台'), wait: 2500 }, { resume: true },
  { note: 'end' }, { hold: 7 },
];
