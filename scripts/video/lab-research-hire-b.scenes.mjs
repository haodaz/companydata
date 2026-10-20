/**
 * 片二 · 下半：申请人苏晴打开陈老师发的研究真活，读材料、问 AI、改表写分析、交卷；陈老师那边看到报告。
 *   CHROME_GPU=1 TASK=8XOQVxQUKKI OWNER_KEY=<…> node scripts/video/drive.mjs <输出目录> scripts/video/lab-research-hire-b.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 答卷（清洗后的表 + 分析说明）在 scratchpad：SUQING_CSV / SUQING_NOTE 两个环境变量给路径。评分要几分钟：pause 掉。
 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const T = process.env.TASK || '8XOQVxQUKKI';
const OWNER = process.env.OWNER_KEY || '';
const CSV = fs.readFileSync(process.env.SUQING_CSV, 'utf8').trim();
const NOTE = fs.readFileSync(process.env.SUQING_NOTE, 'utf8').trim();

const H = `(() => {
  if (window.__wk) return window.__wk;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const btn = t => [...document.querySelectorAll('button, a')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const click = async (el, wait = 700) => { if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(350); el.click(); await sleep(wait); return true; };
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  const setv = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, cps = 22) { el.focus(); let cur = el.value || ''; for (const ch of text) { cur += ch; setv(el, cur); await sleep(1000 / cps); } }
  async function scrollBy(px, steps = 30, ms = 40) { const y0 = window.scrollY; for (let i = 1; i <= steps; i++) { window.scrollTo(0, y0 + px * i / steps); await sleep(ms); } }
  const zoom = z => { document.documentElement.style.zoom = String(z); };
  return (window.__wk = { sleep, vis, btn, click, until, setv, type, scrollBy, zoom });
})()`;
const run = body => `async () => { const L = ${H}; ${body} }`;

export default [
  { eval: `() => { try { localStorage.removeItem('work:${T}'); } catch {} return 'cleared'; }` },
  { pause: true },
  { go: `${BASE}/work/${T}`, wait: 5000 },
  { eval: `() => { try { localStorage.removeItem('work:${T}'); } catch {} location.reload(); return 'reload'; }` },
  { hold: 5 },
  { resume: true },
  { note: 'b_enter' }, { hold: 2.5 },
  { eval: run(`await L.scrollBy(500, 30, 40); await L.sleep(600); const name = document.querySelector('input[placeholder="姓名 / 昵称"]'); await L.type(name, '苏晴'); await L.sleep(500); await L.click(L.btn('开始做'), 2500); return 'started';`), timeout: 40 },

  // 读材料：先看博士生的拟合说明，再翻测试记录，最后 XPS
  { note: 'b_materials' }, { hold: 1 },
  { eval: run(`const items = [...document.querySelectorAll('aside > div')].filter(d => /m\\d ·/.test(d.innerText)); const pick = id => items.find(d => d.innerText.includes(id + ' ·'));
    for (const id of ['m2', 'm1', 'm3']) { const m = pick(id); if (m) { m.click(); await L.sleep(3200); } } return items.length;`), timeout: 40 },

  // 问 AI 一个细节
  { note: 'b_ai' }, { hold: .5 },
  { eval: run(`const q = document.querySelector('textarea[placeholder^="问 AI"]'); await L.type(q, '表里的 Q_mid 是 CPE 参数，要换成有效电容，该用 Brug 还是 Hsu–Mansfeld 公式？两者适用条件有什么区别？', 18); await L.sleep(400); await L.click(L.btn('问'), 500); return 'asked';`), timeout: 40 },
  { pause: true },
  { eval: run(`await L.until(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('放进交付物')), 120000); return 'answered';`), timeout: 130 },
  { resume: true },
  { hold: 5 },

  // 改表：一行一行写回去，看得见表在变；再写分析说明
  { note: 'b_edit' }, { hold: .5 },
  { eval: run(`await L.click(L.btn('CSV 源'), 900); const csv = [...document.querySelectorAll('main textarea')][0];
    const target = ${JSON.stringify(CSV)}.split('\\n'); const orig = csv.value.split('\\n');
    for (let i = 1; i <= target.length; i++) { L.setv(csv, target.slice(0, i).concat(orig.slice(i)).join('\\n')); await L.sleep(260); }
    await L.sleep(900); await L.click(L.btn('表格视图'), 2500);
    const note = [...document.querySelectorAll('main textarea')].pop(); note.scrollIntoView({ block: 'center' });
    const text = ${JSON.stringify(NOTE)}; const head = text.slice(0, 420);
    await L.type(note, head, 26); L.setv(note, text); await L.sleep(1500); return 'edited';`), timeout: 120 },
  { hold: 1.5 },

  { note: 'b_submit' }, { hold: .5 },
  { eval: run(`await L.click(L.btn('交卷'), 800); const c = L.btn('再点一次确认交卷'); if (c) await L.click(c, 1500); return 'submitted';`), timeout: 20 },
  { hold: 3 },
  { pause: true },
  { eval: run(`await L.until(() => document.body.innerText.includes('真活台 · 报告'), 400000); return 'report';`), timeout: 420 },
  { resume: true },
  { note: 'b_report' }, { hold: 5 },
  { eval: run(`await L.scrollBy(700, 40, 50); await L.sleep(2500); await L.scrollBy(800, 40, 50); await L.sleep(2500); await L.scrollBy(800, 40, 50); return 'v';`), timeout: 40 },
  { hold: 2 },

  // 陈老师那边：真活空间里看到苏晴的报告
  { pause: true },
  { go: `${BASE}/work/${T}/owner?k=${OWNER}`, wait: 5000 },
  { eval: run(`L.zoom(1.25); await L.sleep(600); return 'zoom';`) },
  { resume: true },
  { note: 'b_end' }, { hold: 2 },
  { eval: run(`const tab = [...document.querySelectorAll('.ant-tabs-tab')].find(t => t.innerText.includes('做题情况')); if (tab) { tab.click(); await L.sleep(2000); } const b = L.btn('看报告'); if (b) { await L.click(b, 2500); const dr = document.querySelector('.ant-drawer-body'); if (dr) { for (let i = 0; i < 40; i++) { dr.scrollTop += 24; await L.sleep(70); } } } return 'report-drawer';`), timeout: 40 },
  { hold: 6 },
];
