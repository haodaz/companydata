/** 真活台宣传页截图：四种操作台 + 报告 + 首页。node scripts/video/shot.mjs scripts/video/work.shots.mjs */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const T = { sheet: 'T712yYY1swI', code: 'rjob47BbXrM', design: '2ebPYYMKopQ', doc: '7qcJtWqngHs' };
const REPORT = `${BASE}/work/T712yYY1swI?s=b9dca9f4-9a99-4649-aaa2-a752a186ed81`;
// 留名字 → 开始 → 打开第一份材料（设计台顺手画两条线）
const enter = (extra = '') => `async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; d.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const name = document.querySelector('input[placeholder="姓名 / 昵称"]'); if (!name) return 'no-intro';
  set(name, '示范 · 小周'); await sleep(200);
  [...document.querySelectorAll('button')].find(b => b.innerText.includes('开始做')).click();
  await sleep(2500);
  const m = [...document.querySelectorAll('aside div')].find(d => /m1 ·/.test(d.innerText) && d.style.cursor === 'pointer') || [...document.querySelectorAll('aside > div')].find(d => d.innerText.includes('m1'));
  if (m) m.click(); await sleep(800);
  ${extra}
  return 'ok';
}`;
const DESIGN_EXTRA = `
  const svg = document.querySelector('svg'); const r = svg.getBoundingClientRect();
  const click = (x, y, dbl) => svg.dispatchEvent(new MouseEvent(dbl ? 'dblclick' : 'click', { bubbles: true, clientX: r.left + x, clientY: r.top + y }));
  const label = document.querySelector('input[placeholder^="这条线标什么"]'); if (label) set(label, '吊梁外轮廓');
  for (const [x, y] of [[120, 220], [120, 90], [640, 90], [640, 220]]) { click(x, y); await sleep(120); } click(640, 220, true); await sleep(300);
  if (label) set(label, '吊点孔 Ø18'); for (const [x, y] of [[200, 150], [230, 120], [260, 150], [230, 180], [200, 150]]) { click(x, y); await sleep(100); } click(200, 150, true); await sleep(300);
  const rows = [...document.querySelectorAll('table tr')]; const pick = { '间距': '1500', '吊重': '12.5', '牌号': 'Q355B · 160', '截面': '200×100×6', '吊耳': '12 / 18', '总高': '1800 / 125' };
  for (const r of rows) { const k = Object.keys(pick).find(k => r.innerText.includes(k)); const el = r.querySelector('input'); if (k && el) set(el, pick[k]); }`;
const CODE = "/**\n * 单体电压采样帧 → 保护事件（BMS 从控采样协议 v1.2）\n * 口径：小端；0xFFFF 为无效值；连续 N 次去抖；回差恢复。见说明 d3。\n */\nfunction solution(frames, cfg) {\n  const INVALID = 0xFFFF;\n  const deb = Math.max(1, cfg.debounce | 0);       // 防御：debounce<=0 时按 1 处理\n  const invLim = Math.max(1, cfg.invalidLimit | 0);\n  const st = new Map();                             // cell -> 状态\n  const out = [];\n  const ev = (t, cell, type, action) => out.push({ t, cell, type, action });\n\n  for (const fr of frames || []) {\n    if (!fr || !Number.isInteger(fr.id) || fr.id < 0x400 || fr.id > 0x40F) continue; // 非本协议帧\n    if (!Array.isArray(fr.data) || fr.data.length !== 8) continue;                    // 残帧\n    const g = fr.id - 0x400;\n    for (let i = 0; i < 4; i++) {                   // cell 升序\n      const v = (fr.data[2 * i] & 0xFF) | ((fr.data[2 * i + 1] & 0xFF) << 8);\n      const cell = g * 4 + i;\n      let s = st.get(cell);\n      if (!s) {\n        s = { ov: false, ovCnt: 0, uv: false, uvCnt: 0, sensor: false, invCnt: 0 };\n        st.set(cell, s);\n      }\n      // 1) SENSOR：无效采样不碰 OV/UV 计数\n      if (v === INVALID) {\n        if (s.invCnt < invLim) s.invCnt++;          // 饱和计数，防溢出\n        if (!s.sensor && s.invCnt >= invLim) { s.sensor = true; ev(fr.t, cell, 'SENSOR', 'SET'); }\n        continue;\n      }\n      s.invCnt = 0;\n      if (s.sensor) { s.sensor = false; ev(fr.t, cell, 'SENSOR', 'CLEAR'); }\n      // 2) OV：未激活看触发阈值，激活后看恢复阈值\n      const ovHit = s.ov ? v <= cfg.ovRecoverMv : v >= cfg.ovMv;\n      s.ovCnt = ovHit ? s.ovCnt + 1 : 0;\n      if (s.ovCnt >= deb) { s.ov = !s.ov; s.ovCnt = 0; ev(fr.t, cell, 'OV', s.ov ? 'SET' : 'CLEAR'); }\n      // 3) UV\n      const uvHit = s.uv ? v >= cfg.uvRecoverMv : v <= cfg.uvMv;\n      s.uvCnt = uvHit ? s.uvCnt + 1 : 0;\n      if (s.uvCnt >= deb) { s.uv = !s.uv; s.uvCnt = 0; ev(fr.t, cell, 'UV', s.uv ? 'SET' : 'CLEAR'); }\n    }\n  }\n  return out;\n}\nconst evaluateCellProtection = solution;\nif (typeof module !== 'undefined') { module.exports = solution; module.exports.solution = solution; }\n";
const CODE_EXTRA = `
  const ta = [...document.querySelectorAll('textarea')][0]; if (ta) set(ta, ${JSON.stringify(CODE)});
  const run = [...document.querySelectorAll('button')].find(b => b.innerText.includes('跑自测')); if (run) { run.click(); await sleep(1500); }`;
export default [
  { go: `${BASE}/work/${T.sheet}`, wait: 4500 }, { eval: enter(), hold: 1.5 }, { shot: 'public/work/shot-sheet.png' },
  { go: `${BASE}/work/${T.code}`, wait: 4500 }, { eval: enter(CODE_EXTRA), hold: 1.5 }, { shot: 'public/work/shot-code.png' },
  { go: `${BASE}/work/${T.design}`, wait: 4500 }, { eval: enter(DESIGN_EXTRA), hold: 1.5 }, { shot: 'public/work/shot-design.png' },
  { go: `${BASE}/work/${T.doc}`, wait: 4500 }, { eval: enter(), hold: 1.5 }, { shot: 'public/work/shot-doc.png' },
  { go: REPORT, wait: 5000 }, { hold: 1 }, { shot: 'public/work/shot-report.png' },
  { go: `${BASE}/work`, wait: 4000 }, { hold: 1 }, { shot: 'public/work/shot-landing.png' },
];
