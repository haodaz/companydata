/**
 * 《产业投资地图》短片（2026-11-09）。AI 回答是当场跑的，等待段 pause 掉。
 *   TOKEN_FILE=.preview-token node scripts/video/drive.mjs out/v-invest scripts/video/v-invest.scenes.mjs --width=1600 --height=900 --dsf=2 --out=3200x1800
 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 60000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(300); } return null; }
  const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
  function glideEl(el, y, ms = 1800) { return new Promise(res => { const y0 = el.scrollTop, t0 = performance.now(); const step = now => { const t = Math.min(1, (now - t0) / ms); el.scrollTop = y0 + (y - y0) * ease(t); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  function glide(y, ms = 1800) { return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  const by = (sel, t) => [...document.querySelectorAll(sel)].find(x => x.textContent.includes(t));
  async function type(sel, text, ms = 55) { const el = document.querySelector(sel); el.focus(); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; for (let i = 1; i <= text.length; i++) { set.call(el, text.slice(0, i)); el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(ms); } await sleep(500); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
  const idle = () => until(() => document.querySelector('.iv-ask .iv-send[aria-label="发送"]') && document.querySelector('.iv-ai') && !document.querySelector('.iv-step i.run'), 200000);
  return (window.__ck = { sleep, until, glide, glideEl, kill, by, type, idle });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
const cover = (a, b, sub) => `${BASE}/video/cover-invest.html?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&sub=${encodeURIComponent(sub)}`;
const ready = sel => ({ eval: run(`await L.until(() => document.querySelector('${sel}'), 90000); await L.sleep(900); return 1;`), timeout: 100 });

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('产业投资地图', '一句话问清', '赛道、机构、项目、人'), wait: 2500 }, { resume: true },
  { note: 'cover' }, { hold: 7 },
  { pause: true }, { go: `${BASE}/video/chart-invest.html`, wait: 400 }, { resume: true },
  { note: 'four' }, { hold: 11 },

  { pause: true }, { go: `${BASE}/invest`, wait: 5000 }, ready('.iv-prov'), { resume: true },
  { note: 'home' }, { hold: 7 },
  { note: 'map' }, { eval: run(`await L.glide(330, 1400); await L.sleep(8000); return 1;`), timeout: 20 },
  { note: 'rank' }, { eval: run(`const h = L.by('.iv-card h2', '谁在出手'); await L.glide(h.getBoundingClientRect().top + scrollY - 70, 1600); await L.sleep(7500); return 1;`), timeout: 20 },

  { pause: true }, { go: `${BASE}/invest/chain`, wait: 4000 }, ready('.iv-pick'), { eval: run(`L.by('.iv-pick button', '半导体').click(); await L.until(() => document.querySelector('.iv-node'), 30000); await L.sleep(900); return 1;`), timeout: 40 }, { resume: true },
  { note: 'chain' }, { hold: 9 },
  { note: 'node' }, { eval: run(`L.by('.iv-node', '功率与化合物').click(); await L.sleep(1400); await L.glide(520, 1600); await L.sleep(6000); return 1;`), timeout: 20 },

  { pause: true }, { go: `${BASE}/invest/chat`, wait: 3500 }, ready('.iv-hero textarea'), { resume: true },
  { note: 'ask' }, { eval: run(`await L.sleep(1200); await L.type('.iv-hero textarea', '功率半导体这一环，近三年谁在融资？红杉中国在半导体投了谁？'); await L.sleep(1500); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.idle(); await L.sleep(800); const s = document.querySelector('.iv-stream'); s.scrollTop = 0; await L.sleep(500); return 1;`), timeout: 210 }, { resume: true },
  { note: 'answer' }, { eval: run(`const s = document.querySelector('.iv-stream'); await L.sleep(4000); await L.glideEl(s, s.scrollHeight, 5000); await L.sleep(4000); return 1;`), timeout: 30 },
  { note: 'entity' }, { eval: run(`const ts = [...document.querySelectorAll('.iv-ai table')]; const rows = [...(ts[ts.length - 1] || document).querySelectorAll('a')].filter(a => /^\\/invest\\/c\\//.test(a.getAttribute('href') || '')); const a = rows[0] || [...document.querySelectorAll('.iv-ai a')].find(a => /^\\/invest\\/c\\//.test(a.getAttribute('href') || '')); a.click(); await L.until(() => document.querySelector('.iv-app-b .iv-tl'), 20000); await L.sleep(4500); const b = document.querySelector('.iv-app-b'); await L.glideEl(b, 420, 2200); await L.sleep(4000); return 1;`), timeout: 50 },
  { note: 'investor' }, { eval: run(`const b = document.querySelector('.iv-app-b'); b.scrollTop = 0; const a = [...document.querySelectorAll('.iv-tl small a')].find(x => x.textContent.includes('红杉')) || [...document.querySelectorAll('.iv-tl small a')][0]; a.click(); await L.until(() => document.querySelector('.iv-app-b .peer'), 20000); await L.sleep(8500); return 1;`), timeout: 50 },

  { note: 'pathq' }, { eval: run(`document.querySelector('.iv-app-h [aria-label="收起应用区"]').click(); await L.sleep(500); await L.type('.iv-dock textarea', '想见 Justin Johnson，从吴恩达那边怎么搭上线？'); await L.sleep(1200); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.idle(); await L.sleep(1200); const s = document.querySelector('.iv-stream'); s.scrollTop = s.scrollHeight; await L.sleep(600); return 1;`), timeout: 210 }, { resume: true },
  { note: 'path' }, { hold: 10 },

  { pause: true }, { go: `${BASE}/invest/projects`, wait: 4000 }, ready('.iv-table tbody tr'), { resume: true },
  { note: 'p1' }, { eval: run(`await L.sleep(800); L.by('.iv-seg button', '未见融资').click(); await L.sleep(1400); L.by('.iv-seg button', '在招岗位').click(); await L.sleep(2200); return 1;`), timeout: 15 },
  { pause: true }, { go: `${BASE}/invest/chain`, wait: 3000 }, ready('.iv-pick'), { eval: run(`L.by('.iv-pick button', '科学仪器').click(); await L.until(() => document.querySelector('.iv-node'), 30000); await L.sleep(800); return 1;`), timeout: 40 }, { resume: true },
  { note: 'p2' }, { hold: 4 },
  { pause: true }, { go: `${BASE}/invest/investors?name=${encodeURIComponent('高瓴')}`, wait: 3500 }, ready('.peer'), { resume: true },
  { note: 'p3' }, { hold: 4 },

  { pause: true }, { go: cover('从一个产业', '问到一个人', '查得到来源，查不到就说没有'), wait: 2500 }, { resume: true },
  { note: 'end' }, { hold: 7 },
];
