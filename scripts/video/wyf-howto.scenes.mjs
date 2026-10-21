/**
 * 教学短片：用平方给一家投资机构出真活——以武岳峰资本为例（2026-10-21，给老板看怎么操作，不讲故事）。
 *   企业库找到武岳峰 → 关联企业（鼎峰科创，同一批合伙人）→ 深度画像报告 → 出题页：直接说要找什么样的人 → 出题 → 看题 → 参与链接
 *   CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/wyf-howto.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 要登录（.preview-token）。出题 + 基线真跑约 3 分钟：pause 掉。会真的建一道题（留作示范），日志里打出链接。
 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync('.preview-token', 'utf8').trim();
const NEED = '我要一个能看懂人工智能行业的人来做投资';

const H = `(() => {
  if (window.__hw) return window.__hw;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  function glide(y, ms = 1800) { return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
    const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  const btn = t => [...document.querySelectorAll('button, a')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const setv = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, cps = 10) { el.focus(); let cur = ''; for (const ch of text) { cur += ch; setv(el, cur); await sleep(1000 / cps); } }
  // 录屏里不出现真实账号
  const mask = () => { for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /@/.test(el.textContent || '') && /\\.(com|cn)/.test(el.textContent || '')) el.textContent = '平方 · 投资者关系'; };
  const hl = (el, on = true) => { if (!el) return; el.style.transition = 'box-shadow .3s'; el.style.boxShadow = on ? '0 0 0 3px #b08d57' : ''; };
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  return (window.__hw = { sleep, vis, until, glide, top, btn, setv, type, mask, hl, kill });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); L.mask(); ${body} }`;
const MASK = { eval: run(`setInterval(L.mask, 500); return 'masked';`) };

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  // ── 1. 企业库里的武岳峰 ──
  { pause: true },
  { go: `${BASE}/admin/db-company/892`, wait: 12000 },
  MASK,
  { resume: true },
  { note: 'company' },
  { hold: 7 },
  { note: 'related' },
  { eval: run(`const card = [...document.querySelectorAll('.ant-card')].find(c => /关联企业/.test(c.querySelector('.ant-card-head')?.innerText || ''));
      if (card) { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); await L.sleep(2000); L.hl(card); const row = [...card.querySelectorAll('tr, li, a')].find(r => /鼎峰科创/.test(r.innerText)); if (row) { await L.sleep(1200); row.style.background = 'rgba(176,141,87,.2)'; } }
      await L.sleep(8000); return !!card;`), timeout: 30 },
  // ── 2. 深度画像报告 ──
  { pause: true },
  { go: `${BASE}/admin/db-company/892/report`, wait: 14000 },
  MASK,
  { resume: true },
  { note: 'report' },
  { eval: run(`await L.sleep(2500);
      for (const id of ['v2', 'v4', 'v5', 'v8']) { const s = document.getElementById(id); if (s) { s.scrollIntoView({ block: 'start', behavior: 'smooth' }); await L.sleep(4200); } }
      return 1;`), timeout: 60 },
  // ── 3. 出题页：企业 + 一句话说要找什么样的人 ──
  { pause: true },
  { go: `${BASE}/work/new`, wait: 9000 },
  MASK,
  { resume: true },
  { note: 'new' },
  { hold: 2 },
  { eval: run(`const inputs = [...document.querySelectorAll('.ant-select-selection-search-input, input')].filter(L.vis);
      const co = inputs[0]; co.click(); await L.type(co, '武岳峰资本', 6); await L.sleep(1800);
      const opt = await L.until(() => [...document.querySelectorAll('.ant-select-item-option')].find(o => /武岳峰资本/.test(o.innerText)), 8000);
      if (opt) { opt.click(); await L.sleep(1500); }
      return opt ? 'picked' : 'no option';`), timeout: 40 },
  { note: 'need' },
  { eval: run(`const inputs = [...document.querySelectorAll('.ant-select-selection-search-input, input')].filter(L.vis);
      const role = inputs[1]; role.click(); await L.type(role, ${JSON.stringify(NEED)}, 7); await L.sleep(800); document.body.click(); await L.sleep(2500); return role.value;`), timeout: 40 },
  { note: 'go' },
  { eval: run(`const b = L.btn('出题'); L.hl(b); await L.sleep(1500); b.click(); await L.sleep(3000); return 'clicked';`), timeout: 20 },
  // 出题 + 基线：约 3 分钟，不录
  { pause: true },
  { eval: run(`await L.until(() => /\\/owner/.test(location.pathname), 420000); await L.sleep(6000); L.mask(); return location.href;`), timeout: 440 },
  { eval: run(`scrollTo(0, 0); await L.sleep(800); return 1;`) },
  { resume: true },
  // ── 4. 出来的题 ──
  { note: 'result' },
  { eval: run(`await L.sleep(3500); await L.glide(700, 3000); await L.sleep(3500); await L.glide(1600, 3000); await L.sleep(3500); return 1;`), timeout: 40 },
  // ── 5. 发给候选人的链接 ──
  { pause: true },
  { eval: run(`const a = [...document.querySelectorAll('a')].find(x => /\\/work\\/[A-Za-z0-9_-]{8,}$/.test(x.getAttribute('href') || '')); if (a) location.href = a.getAttribute('href'); await L.sleep(9000); return a ? a.getAttribute('href') : 'no link';`), timeout: 30 },
  { eval: run(`scrollTo(0, 0); await L.sleep(800); return location.pathname;`) },
  { resume: true },
  { note: 'share' },
  { eval: run(`await L.sleep(3000); await L.glide(500, 2500); await L.sleep(4000); return 1;`), timeout: 20 },
];
