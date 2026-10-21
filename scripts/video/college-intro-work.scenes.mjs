/**
 * 百业大学介绍片第三版 · 补录「work」这一段：真活的任务书 + 真活分析台（不只是体验用的操作台）。
 * 名字填 NOVA 开始做 → 翻材料 → 问 AI → 在表里清洗单位 → 写口径说明。会建一条演示答题记录（work_sessions），录完按日志里的编号删掉；不交卷。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <补录目录> scripts/video/college-intro-work.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 拼回去：splice.py <片子目录> <补录目录> work
 */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const T = 'T712yYY1swI';
const H = `(() => {
  if (window.__wk) return window.__wk;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const btn = t => [...document.querySelectorAll('button, a')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const click = async (el, wait = 700) => { if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(350); el.click(); await sleep(wait); return true; };
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(300); } return null; }
  const setv = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, cps = 22) { el.focus(); let cur = el.value || ''; for (const ch of text) { cur += ch; setv(el, cur); await sleep(1000 / cps); } }
  const zoom = z => { document.documentElement.style.zoom = String(z); };
  async function scrollBy(px, steps = 30, ms = 40) { const y0 = window.scrollY; for (let i = 1; i <= steps; i++) { window.scrollTo(0, y0 + px * i / steps); await sleep(ms); } }
  return (window.__wk = { sleep, vis, btn, click, until, setv, type, scrollBy, zoom });
})()`;
const run = body => `async () => { const L = ${H}; document.querySelectorAll('nextjs-portal').forEach(n => n.remove()); ${body} }`;

export default [
  { pause: true },
  { eval: `() => { try { localStorage.removeItem('work:${T}'); } catch {} return 1; }` },
  { go: `${BASE}/work/${T}`, wait: 8000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('任务书'), 20000); scrollTo(0, 0); await L.sleep(800); return 1;`), timeout: 30 },
  // 先快闪四种真活的任务书（表格 / 代码 / 设计 / 文档），最后停在要做的这一道
  ...['rjob47BbXrM', '2ebPYYMKopQ', '7qcJtWqngHs'].flatMap((t, i) => [
    { pause: true },
    { go: `${BASE}/work/${t}`, wait: 6000 },
    { eval: run(`await L.until(() => document.body.innerText.includes('任务书'), 20000); scrollTo(0, 0); await L.sleep(800); return 1;`), timeout: 30 },
    { resume: true },
    ...(i === 0 ? [{ note: 'work' }] : []),
    { hold: 1.5 },
  ]),
  { pause: true },
  { go: `${BASE}/work/${T}`, wait: 6000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('任务书'), 20000); scrollTo(0, 0); await L.sleep(800); return 1;`), timeout: 30 },
  { resume: true },
  { hold: 2 },
  { eval: run(`await L.scrollBy(520, 40, 45); await L.sleep(2500); await L.scrollBy(500, 30, 40); await L.sleep(600); const name = document.querySelector('input[placeholder="姓名 / 昵称"]'); await L.type(name, 'NOVA', 8); await L.sleep(500); await L.click(L.btn('开始做'), 2500); return localStorage.getItem('work:${T}');`), timeout: 40 },
  { eval: run(`const items = [...document.querySelectorAll('aside > div')].filter(d => /m\\d ·/.test(d.innerText)); for (const m of items.slice(0, 3)) { m.click(); await L.sleep(2200); } return items.length;`), timeout: 40 },
  { eval: run(`const q = document.querySelector('textarea[placeholder^="问 AI"]'); await L.type(q, '表里 GWh、MWh、pack 三种单位混在一起，换算成 GWh 要注意什么？材料里有没有给单包电量？', 20); await L.sleep(400); await L.click(L.btn('问'), 500); return 'asked';`), timeout: 40 },
  { pause: true },
  { eval: run(`await L.until(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('放进交付物')), 90000); return 'answered';`), timeout: 100 },
  { resume: true },
  { hold: 4 },
  { eval: run(`await L.click(L.btn('CSV 源'), 900); const csv = [...document.querySelectorAll('main textarea')][0]; const lines = csv.value.split('\\n');
    const fixed = lines.map(l => l.replace(/,(\\d+(?:\\.\\d+)?),MWh,/, (m, v) => ',' + (Number(v) / 1000) + ',GWh,').replace(/,(\\d+),pack,/, (m, v) => ',' + (Number(v) * 75 / 1e6).toFixed(2) + ',GWh,'));
    for (let i = 1; i <= fixed.length; i++) { L.setv(csv, fixed.slice(0, i).concat(lines.slice(i)).join('\\n')); await L.sleep(120); }
    await L.sleep(800); await L.click(L.btn('表格视图'), 1500);
    const note = [...document.querySelectorAll('main textarea')].pop(); await L.type(note, '口径：统一换算为 GWh。MWh 除以 1000；pack 按 m5 给的商用车单包 75kWh 折算，这是假设，待确认。新旧版本取 V3-0910 为准，V2 作废、重复行删除。', 30); return 'edited';`), timeout: 120 },
  { hold: 3 },
];
