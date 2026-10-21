/**
 * 百业大学介绍片《百业大学：培养 AI 数字职人，走进千行百业》（2026-10-21 第二版：用户要「按介绍一所大学讲故事」、格局要大、要有投资人感染力）。
 * 学校的口吻：为什么办这所大学 → 怎么教（教材 / 老师 / 真活）→ 一个大模型化成万千数字职人 → 走进千行百业 + 新兴职业（出海 / 车间数据 / 新公司 / 基金）
 * → 给 OPC 和 AI Native 组织供血 → 会自己长大的大学 → 人 · 求真 · 心智世界 → 谁来这里。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/college-intro.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 不用登录（访客），不往库里写任何东西。
 */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';

const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  // 平滑滚到某个位置（ms 内，缓动）
  function glide(y, ms = 1800) {
    return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
      const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  const to = (sel, off = 80, ms = 1800) => glide(top(document.querySelector(sel), off), ms);
  const btn = t => [...document.querySelectorAll('button, a')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const click = async (el, wait = 700) => { if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(450); el.click(); await sleep(wait); return true; };
  const setv = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
  async function type(el, text, cps = 18) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(300); el.focus(); let cur = ''; for (const ch of text) { cur += ch; setv(el, cur); await sleep(1000 / cps); } await sleep(250); }
  // 申请表：按标签文字找输入框
  const field = label => { const l = [...document.querySelectorAll('.af label')].find(x => (x.querySelector('span')?.innerText || '').startsWith(label)); return l && l.querySelector('input, textarea, select'); };
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  return (window.__ck = { sleep, vis, until, glide, to, top, btn, click, setv, type, field, kill });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;

export default [
  // ── 首页：首屏影像（开场的问题） ──
  { pause: true },
  { go: `${BASE}/college`, wait: 9000 },
  { eval: run(`await L.until(() => document.querySelectorAll('.cu-one').length > 10, 30000); scrollTo(0, 0); await L.sleep(1500); return 'ready';`), timeout: 40 },
  { resume: true },
  { note: 'hero' },
  { hold: 12 },
  { note: 'about' },
  { eval: run(`await L.to('#about', 40, 2600); await L.sleep(8000); return 1;`), timeout: 20 },
  { note: 'become' },
  { eval: run(`await L.to('.cu-become', 70, 2400); await L.sleep(9000); return 1;`), timeout: 20 },
  { note: 'book' },
  { eval: run(`const p = document.querySelectorAll('.cu-pillar'); await L.glide(L.top(p[0], 90), 2200); await L.sleep(3000); return 1;`), timeout: 15 },
  { note: 'hands' },
  { eval: run(`const p = document.querySelectorAll('.cu-pillar'); await L.glide(L.top(p[1], 90), 2200); await L.sleep(6500); return 1;`), timeout: 15 },
  { note: 'work' },
  { eval: run(`const p = document.querySelectorAll('.cu-pillar'); await L.glide(L.top(p[2], 90), 2200); await L.sleep(4500); return 1;`), timeout: 15 },
  { note: 'academics' },
  { eval: run(`await L.to('#academics', 40, 2400); await L.sleep(4000); return 1;`), timeout: 15 },
  { note: 'rooms' },
  { eval: run(`await L.to('.cu-dark', 40, 2400); await L.glide(L.top(document.querySelector('.cu-media'), 160), 1800); await L.sleep(4500); return 1;`), timeout: 20 },
  { note: 'industries' },
  { eval: run(`await L.to('#industries', 40, 2400); await L.glide(L.top(document.querySelector('.cu-mosaic'), 120), 1500); await L.sleep(4000); return 1;`), timeout: 20 },
  { note: 'supply' },
  { eval: run(`await L.to('.cu-supply', 160, 2000); await L.sleep(9000); return 1;`), timeout: 20 },
  { note: 'cases' },
  { eval: run(`await L.to('#cases', 40, 2200); await L.sleep(2500); return 1;`), timeout: 15 },

  // ── 新兴职业：四个案例 ──
  { pause: true },
  { go: `${BASE}/college/cases`, wait: 8000 },
  { eval: run(`const s = document.getElementById('overseas'); scrollTo(0, L.top(s, 40)); await L.sleep(1200); return 1;`), timeout: 10 },
  { resume: true },
  ...['overseas', 'workshop', 'startup', 'fund'].flatMap((id, i) => [
    { note: `case${i + 1}` },
    { eval: run(`const s = document.getElementById('${id}'); ${i ? `await L.glide(L.top(s, 40), 2000);` : ''} await L.sleep(1800);
        const tags = s.querySelector('.cs-tags'); [...tags.querySelectorAll('span')].forEach((t, k) => setTimeout(() => { t.style.transition = 'all .4s'; t.style.background = '#b08d57'; t.style.color = '#fff'; }, 600 + k * 900));
        await L.glide(L.top(s.querySelector('.cs-team'), 220), 2200); await L.sleep(2400); return 1;`), timeout: 30 },
  ]),

  // ── 会自己长大的大学：毕业生名录 ──
  { pause: true },
  { go: `${BASE}/college/graduates`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelectorAll('.cg-card').length > 10, 30000); scrollTo(0, L.top(document.querySelector('#graduates'), 60)); await L.sleep(1200); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'graduates' },
  { eval: run(`const g = document.querySelector('.cg-grid'); const y0 = L.top(g, 120); await L.glide(y0, 1500); await L.glide(y0 + 2600, 9000); await L.sleep(1500); return 1;`), timeout: 25 },

  // ── 我们相信 → 谁来这里 → 首屏收尾 ──
  { pause: true },
  { go: `${BASE}/college`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('.cu-beliefs'), 20000); scrollTo(0, L.top(document.querySelector('.cu-beliefs'), 260)); await L.sleep(1500); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'beliefs' },
  { hold: 9 },
  { note: 'doors' },
  { eval: run(`await L.to('#start', 40, 2200); await L.glide(L.top(document.querySelector('.cu-doors'), 140), 1500); await L.sleep(7000); return 1;`), timeout: 20 },
  { pause: true },
  { eval: run(`scrollTo(0, 0); await L.sleep(1500); return 1;`), timeout: 10 },
  { resume: true },
  { note: 'end' },
  { hold: 10 },
];
