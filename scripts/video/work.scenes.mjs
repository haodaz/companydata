/**
 * 分镜：百业AI｜真活（首页 → 出题 → 真活空间 → 候选人做题 → 报告 → 四种操作台 → 管理）。
 *   LAB_REC_PROFILE=/tmp/work-rec OWNER_KEY=<宁德供应链那题的 owner_key> node scripts/video/drive.mjs out/work-demo scripts/video/work.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * note 是后期切片的时间点（build.py 按它切、按 work.speed.json 加速）。出题真跑要 2–3 分钟，录的时候 pause 掉，用已出好的题。
 */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const T = { sheet: 'T712yYY1swI', code: 'rjob47BbXrM', design: '2ebPYYMKopQ', doc: '7qcJtWqngHs' };
const OWNER = process.env.OWNER_KEY || '';
const REPORT_SID = process.env.REPORT_SID || 'b9dca9f4-9a99-4649-aaa2-a752a186ed81';

// 页面里的小工具：慢慢打字、按文字找按钮、等元素出现
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
const run = body => `async () => { const L = ${H}; ${body} }`;

export default [
  // ── 首页 ──
  { go: `${BASE}/work`, wait: 5000 },
  { eval: run(`L.zoom(1.15); await L.sleep(500); return 'zoom';`) },
  { note: 'landing' }, { hold: 4 },
  { eval: run(`await L.scrollBy(620, 40, 45); return 'v';`), timeout: 20 },
  { note: 'landing_values' }, { hold: 3 },
  { eval: run(`await L.scrollBy(900, 45, 45); await L.sleep(1500); await L.scrollBy(900, 45, 45); return 'v';`), timeout: 40 },
  { hold: 1 },

  // ── 出题（我的真活） ──
  { go: `${BASE}/work/mine`, wait: 4000 },
  { eval: run(`L.zoom(1.35); await L.sleep(600); return 'zoom';`) },
  { note: 'create' }, { hold: 2.5 },
  { eval: run(`await L.click(L.btn('出一道真活'), 1200); const ins = [...document.querySelectorAll('.ant-drawer input, .ant-drawer textarea')]; await L.type(ins[0], '宁德时代'); await L.sleep(400); await L.type(ins[1], '供应链计划'); await L.sleep(400); const ta = document.querySelector('.ant-drawer textarea'); if (ta) await L.type(ta, '德布勒森新厂爬坡，欧洲客户的需求表口径不一致，先把账对清'); await L.sleep(600); const rest = ins.filter(i => i.placeholder && /称呼|联系/.test(i.placeholder)); if (rest[0]) await L.type(rest[0], '王经理'); if (rest[1]) await L.type(rest[1], '138****8888'); await L.sleep(800); return 'filled';`), timeout: 60 },
  { hold: 2 },

  // ── 真活空间（已出好的题） ──
  { go: `${BASE}/work/${T.sheet}/owner?k=${OWNER}`, wait: 5000 },
  { eval: run(`L.zoom(1.3); await L.sleep(600); return 'zoom';`) },
  { note: 'owner' }, { hold: 3 },
  { eval: run(`const tab = [...document.querySelectorAll('.ant-tabs-tab')].find(t => t.innerText.includes('rubric')); if (tab) { tab.click(); await L.sleep(1200); } await L.scrollBy(500, 30, 45); return 'rubric';`), timeout: 30 },
  { hold: 3 },
  { eval: run(`window.scrollTo({ top: 0, behavior: 'smooth' }); await L.sleep(900); await L.click(L.btn('复制参与链接'), 1200); return 'copied';`), timeout: 20 },
  { hold: 1 },

  // ── 候选人做题 ──
  { go: `${BASE}/work/${T.sheet}`, wait: 5000 },
  { note: 'enter' }, { hold: 2.5 },
  { eval: run(`await L.scrollBy(500, 30, 40); await L.sleep(600); const name = document.querySelector('input[placeholder="姓名 / 昵称"]'); await L.type(name, '示范 · 小周'); await L.sleep(500); await L.click(L.btn('开始做'), 2500); return 'started';`), timeout: 40 },
  { note: 'materials' }, { hold: 1 },
  { eval: run(`const items = [...document.querySelectorAll('aside > div')].filter(d => /m\\d ·/.test(d.innerText)); for (const m of items.slice(0, 3)) { m.click(); await L.sleep(2600); } return items.length;`), timeout: 40 },
  { note: 'ai' }, { hold: .5 },
  { eval: run(`const q = document.querySelector('textarea[placeholder^="问 AI"]'); await L.type(q, '表里 GWh、MWh、pack 三种单位混在一起，换算成 GWh 要注意什么？材料里有没有给单包电量？', 18); await L.sleep(400); await L.click(L.btn('问'), 500); return 'asked';`), timeout: 40 },
  { pause: true },
  { eval: run(`await L.until(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('放进交付物')), 90000); return 'answered';`), timeout: 100 },
  { resume: true },
  { hold: 5 },
  { note: 'edit' }, { hold: .5 },
  { eval: run(`await L.click(L.btn('CSV 源'), 900); const csv = [...document.querySelectorAll('main textarea')][0]; const lines = csv.value.split('\\n');
    const fixed = lines.map(l => l.replace(/,(\\d+(?:\\.\\d+)?),MWh,/, (m, v) => ',' + (Number(v) / 1000) + ',GWh,').replace(/,(\\d+),pack,/, (m, v) => ',' + (Number(v) * 75 / 1e6).toFixed(2) + ',GWh,'));
    // 慢慢「改」：一行一行写回去，看得见表在变
    for (let i = 1; i <= fixed.length; i++) { L.setv(csv, fixed.slice(0, i).concat(lines.slice(i)).join('\\n')); await L.sleep(140); }
    await L.sleep(800); await L.click(L.btn('表格视图'), 1500);
    const note = [...document.querySelectorAll('main textarea')].pop(); await L.type(note, '口径：统一换算为 GWh。MWh 除以 1000；pack 按 m5 给的商用车单包 75kWh 折算（4000 pack = 0.30 GWh），这是假设，乘用车包容量材料没给，待确认。新旧版本取 V3-0910 为准，V2-0815 作废、重复行删除。德布勒森合格产出按工厂邮件的爬坡计划逐月取「投入 × 良率」，良率按 m4 首周实测下调；缺口先用国内基地调拨补，但扣减海运 6 周和舱位约束，10 月铁路额度不足的部分顺延到 11 月；TECTRANS II 未签框架的需求单列为不确定需求，不进承诺口径。', 34); return 'edited';`), timeout: 120 },
  { hold: 1.5 },
  { note: 'submit' }, { hold: .5 },
  { eval: run(`await L.click(L.btn('交卷'), 800); await L.click(L.btn('再点一次确认交卷'), 1500); return 'submitted';`), timeout: 20 },
  { hold: 3 },
  { pause: true },
  { eval: run(`await L.until(() => document.body.innerText.includes('真活台 · 报告'), 240000); return 'report';`), timeout: 250 },
  { resume: true },
  { note: 'report' }, { hold: 5 },
  { eval: run(`await L.scrollBy(700, 40, 50); await L.sleep(2500); await L.scrollBy(800, 40, 50); await L.sleep(2500); await L.scrollBy(800, 40, 50); return 'v';`), timeout: 40 },
  { hold: 2 },

  // ── 其他操作台：代码 / 设计 / 文档 ──
  { go: `${BASE}/work/${T.code}`, wait: 4500 },
  { note: 'code' }, { hold: .5 },
  { eval: run(`await L.scrollBy(500, 20, 30); const name = document.querySelector('input[placeholder="姓名 / 昵称"]'); await L.type(name, '示范 · 小周', 30); await L.click(L.btn('开始做'), 2500); const items = [...document.querySelectorAll('aside > div')].filter(d => /m\\d ·/.test(d.innerText)); if (items[0]) { items[0].click(); await L.sleep(1500); } const ta = [...document.querySelectorAll('main textarea')][0]; L.setv(ta, ${JSON.stringify(process.env.CODE_SAMPLE || '')} || ta.value); await L.sleep(1000); await L.click(L.btn('跑自测'), 2500); return 'tests';`), timeout: 60 },
  { hold: 4 },
  { go: `${BASE}/work/${T.design}`, wait: 4500 },
  { note: 'design' }, { hold: .5 },
  { eval: run(`await L.scrollBy(500, 20, 30); const name = document.querySelector('input[placeholder="姓名 / 昵称"]'); await L.type(name, '示范 · 小周', 30); await L.click(L.btn('开始做'), 2500);
    const rows = [...document.querySelectorAll('table tr')]; const pick = { '间距': '1500', '吊重': '12.5', '牌号': 'Q355B · 160', '截面': '200×100×6', '吊耳': '12 / 18', '总高': '1800 / 125' };
    for (const r of rows) { const k = Object.keys(pick).find(k => r.innerText.includes(k)); const el = r.querySelector('input'); if (k && el) { await L.type(el, pick[k], 20); await L.sleep(200); } }
    const svg = document.querySelector('svg'); svg.scrollIntoView({ block: 'center', behavior: 'smooth' }); await L.sleep(800); const rc = svg.getBoundingClientRect();
    const click = (x, y, dbl) => svg.dispatchEvent(new MouseEvent(dbl ? 'dblclick' : 'click', { bubbles: true, clientX: rc.left + x, clientY: rc.top + y }));
    const label = document.querySelector('input[placeholder^="这条线标什么"]'); if (label) L.setv(label, '吊梁外轮廓');
    for (const [x, y] of [[120, 220], [120, 90], [640, 90], [640, 220]]) { click(x, y); await L.sleep(500); } click(640, 220, true); await L.sleep(600);
    if (label) L.setv(label, '吊点孔 Ø18'); for (const [x, y] of [[200, 150], [230, 120], [260, 150], [230, 180], [200, 150]]) { click(x, y); await L.sleep(350); } click(200, 150, true); return 'sketch';`), timeout: 90 },
  { hold: 3 },
  { go: `${BASE}/work/${T.doc}`, wait: 4500 },
  { note: 'doc' }, { hold: .5 },
  { eval: run(`await L.scrollBy(500, 20, 30); const name = document.querySelector('input[placeholder="姓名 / 昵称"]'); await L.type(name, '示范 · 小周', 30); await L.click(L.btn('开始做'), 2500); const items = [...document.querySelectorAll('aside > div')].filter(d => /m\\d ·/.test(d.innerText)); if (items[0]) { items[0].click(); await L.sleep(1800); } const ta = [...document.querySelectorAll('main textarea')][0]; await L.type(ta, '## 一页纸方案\\n\\n给海外合作伙伴的口径：先统一产品名与适应症表述，所有数字只引用最新一版材料；两份材料里的销售额口径不一致（含税 / 不含税），以财务版为准，并在脚注注明。\\n', 28); return 'typed';`), timeout: 60 },
  { hold: 2 },

  // ── 管理：真活空间看做题情况与评分 ──
  { go: `${BASE}/work/${T.sheet}/owner?k=${OWNER}`, wait: 5000 },
  { eval: run(`L.zoom(1.3); await L.sleep(600); return 'zoom';`) },
  { note: 'manage' }, { hold: 2 },
  { eval: run(`const tab = [...document.querySelectorAll('.ant-tabs-tab')].find(t => t.innerText.includes('做题情况')); if (tab) { tab.click(); await L.sleep(1500); } const b = L.btn('看报告'); if (b) { await L.click(b, 2500); const dr = document.querySelector('.ant-drawer-body'); if (dr) { for (let i = 0; i < 40; i++) { dr.scrollTop += 24; await L.sleep(60); } } } return 'report-drawer';`), timeout: 40 },
  { hold: 3 },
  { note: 'end' }, { hold: 9 },
];
