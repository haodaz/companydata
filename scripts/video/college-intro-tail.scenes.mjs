/**
 * 百业大学介绍片第三版 · 补录后半截：四个客户案例 + 供血 + 会自己长大，不放静态页，换成真东西——
 * 真活工作台（文档台 / 代码台）和几个岗位的 3D 现场，左下角压一张字幕卡写「这家客户要哪几位数字职人」。用 splice.py 换回去。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <补录目录> scripts/video/college-intro-tail.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 工作台要「开始做」才进得去：名字填 NOVA，会建演示答题记录（work_sessions），日志里打出编号，录完删掉；不交卷。
 * 3D 刚加载会拉丝：等 45 秒稳了再录（15 秒不够）；3D 抓帧慢，按 SLOW 倍时长晃，autospeed 再加速回来。
 */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SLOW = 3;

const H = `(() => {
  if (window.__ct) return window.__ct;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  const btn = t => [...document.querySelectorAll('button, a')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const setv = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, cps = 16) { el.focus(); let cur = ''; for (const ch of text) { cur += ch; setv(el, cur); await sleep(1000 / cps); } await sleep(250); }
  async function scrollBy(px, steps = 30, ms = 40) { const y0 = scrollY; for (let i = 1; i <= steps; i++) { scrollTo(0, y0 + px * i / steps); await sleep(ms); } }
  // 左下角字幕卡：大学的配色（深蓝底、金色小标题、衬线大字）
  function card(kicker, title, roles) {
    document.getElementById('__card')?.remove();
    const c = document.createElement('div'); c.id = '__card';
    c.innerHTML = '<div style="font:700 12px Georgia,serif;letter-spacing:.22em;color:#d9b878;text-transform:uppercase">' + kicker + '</div>'
      + '<div style="font:900 26px \\'Songti SC\\',\\'STSong\\',serif;margin:6px 0 10px;color:#fff">' + title + '</div>'
      + (roles ? '<div style="display:flex;gap:8px;flex-wrap:wrap">' + roles.map(r => '<span style="padding:5px 12px;background:rgba(217,184,120,.18);border:1px solid rgba(217,184,120,.6);color:#f3dfae;font-size:14px;font-family:PingFang SC,sans-serif">' + r + '</span>').join('') + '</div>' : '');
    Object.assign(c.style, { position: 'fixed', left: '48px', bottom: '64px', zIndex: 99998, maxWidth: '720px', padding: '18px 22px', background: 'rgba(15,22,56,.88)', borderLeft: '3px solid #d9b878', boxShadow: '0 20px 50px rgba(0,0,0,.35)', backdropFilter: 'blur(6px)', opacity: '0', transform: 'translateY(12px)', transition: 'all .6s ease' });
    document.body.appendChild(c); requestAnimationFrame(() => { c.style.opacity = '1'; c.style.transform = 'none'; });
  }
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  // 职人主页上的平台统计数字录的时候遮掉
  const hideStats = () => {
    const tile = [...document.querySelectorAll('div')].find(d => /^\\d+\\s*人次\\s*服务$/.test((d.innerText || '').replace(/\\s+/g, ' ').trim()));
    if (tile && tile.parentElement) tile.parentElement.style.visibility = 'hidden';
    for (const el of document.querySelectorAll('*')) { if (el.children.length) continue; const t = el.textContent || '';
      if (/\\d+\\s*人考过/.test(t)) el.textContent = '换你上手'; else if (/^解过\\s*\\d+\\s*次$/.test(t.trim())) el.textContent = '带着问题来'; else if (/已吸收\\s*\\d+\\s*轮专家经验/.test(t)) el.textContent = '好老师的经验与判断规则'; }
  };
  function glide(y, ms = 1800) { return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
    const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  return (window.__ct = { sleep, vis, until, btn, setv, type, scrollBy, card, kill, hideStats, glide, top });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;

// 3D：等稳了；鼠标画横 8 字（SLOW 倍时长）
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); for (let i = 0; i < 2400; i++) { const a = i / 200 * Math.PI * 2; window.dispatchEvent(new PointerEvent('pointermove', { clientX: innerWidth * (0.5 + 0.3 * Math.sin(a)), clientY: innerHeight * 0.5, bubbles: true })); await L.sleep(45); } return '3d ready';`);
const SWEEP = (sec, amp = 0.4) => run(`
  const W = innerWidth, Hh = innerHeight, N = Math.round(${sec} * ${SLOW} * 22);
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + ${amp} * Math.sin(a)), y = Hh * (0.5 + ${amp} * 0.55 * Math.sin(a * 2));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'sweep';`);
const scene3d = (key, note, kicker, title, roles, sec) => [
  { pause: true },
  { go: `${BASE}/lab/beta/3d/${key}`, wait: 8000 },
  { eval: WAIT3D, timeout: 120 },
  { eval: run(`L.card(${JSON.stringify(kicker)}, ${JSON.stringify(title)}, ${JSON.stringify(roles)}); await L.sleep(800); return 1;`) },
  { resume: true },
  { note },
  { eval: SWEEP(sec), timeout: 120 },
];
// 真活工作台：进题 → 名字 NOVA 开始做 → 翻两份材料
const bench = (token, note, kicker, title, roles) => [
  { pause: true },
  { eval: `() => { try { localStorage.removeItem('work:${token}'); } catch {} return 1; }` },
  { go: `${BASE}/work/${token}`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('input[placeholder="姓名 / 昵称"]'), 20000); const n = document.querySelector('input[placeholder="姓名 / 昵称"]'); n.scrollIntoView({ block: 'center' }); L.setv(n, 'NOVA'); await L.sleep(400); L.btn('开始做').click(); await L.sleep(3500); return localStorage.getItem('work:${token}');`), timeout: 40 },
  { eval: run(`L.card(${JSON.stringify(kicker)}, ${JSON.stringify(title)}, ${JSON.stringify(roles)}); await L.sleep(800); return 1;`) },
  { resume: true },
  { note },
  { eval: run(`await L.sleep(1500); const items = [...document.querySelectorAll('aside > div')].filter(d => /m\\d ·/.test(d.innerText)); for (const m of items.slice(0, 2)) { m.click(); await L.sleep(2600); } await L.sleep(2000); return items.length;`), timeout: 40 },
];

const ids = { mkt: 'f7179883-07fb-4ac8-9663-362b20ed29b4', mech: '065fd7f4-67e9-4e1a-a7c9-61de38a3b09c' };   // NOVA-02 市场营销管培生、NOVA-68 机械设计工程师
const LAB_LOCAL = { 'lab:visitor': 'v:demo-college', 'lab:rookie': { name: '体验者', note: '', location: '' }, 'lab:rookie:asked': '1' };
const hub = id => [
  { pause: true },
  { go: `${BASE}/lab/${id}`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('img'), 20000); L.hideStats(); await L.sleep(1000); return 1;`), timeout: 30 },
  { resume: true },
  { eval: run(`L.hideStats(); await L.sleep(3500); return 1;`), timeout: 15 },
];
// 快闪一位职人：1.2 秒
const hubFast = id => [
  { pause: true },
  { go: `${BASE}/lab/${id}`, wait: 6000 },
  { eval: run(`await L.until(() => document.querySelector('img'), 20000); L.hideStats(); await L.sleep(800); return 1;`), timeout: 30 },
  { resume: true },
  { hold: 1.2 },
];
// 页面上某一块 + 左下角字卡，停 sec 秒
const block = (url, sel, off, card, sec) => [
  { pause: true },
  { go: url, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector(${JSON.stringify(sel)}), 20000); scrollTo(0, L.top(document.querySelector(${JSON.stringify(sel)}), ${off})); await L.sleep(1200); L.card(${JSON.stringify(card[0])}, ${JSON.stringify(card[1])}, ${JSON.stringify(card[2] || null)}); await L.sleep(800); return 1;`), timeout: 40 },
  { resume: true },
  { hold: sec },
];
const MORE = ['a7f8f2e7-f82d-4092-8057-283ec533c27d', 'fde330a0-5f71-4a1f-b843-5571339b09c9', '392bcbeb-3cd9-43ae-8645-d5268ecfb465', '61f1f7fb-9b56-4e32-8a13-dac7c66fdddf', 'd571b482-4f94-488a-ba21-224b099a32b9'];

export default [
  { pause: true },
  { go: `${BASE}/lab/gallery`, wait: 4000 },
  { local: LAB_LOCAL, wait: 3000 },
  // ══ 毕业证书（AI 毕业生专用的正文）：封皮 → 翻开 ══
  { go: `${BASE}/college/g/a35a662d-2be8-4cc1-a255-4c3f8ad29139/diploma`, wait: 12000 },
  { eval: run(`await L.until(() => document.querySelector('.folio-wrap'), 40000); scrollTo(0, L.top(document.querySelector('.folio-wrap'), 110)); await L.sleep(1500); return 1;`), timeout: 60 },
  { resume: true },
  { note: 'diploma' },
  { eval: run(`await L.sleep(2200); const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); el && el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await L.sleep(3200);
      await L.glide(L.top(document.querySelector('.folio-wrap'), 90), 1500); await L.sleep(4500); return 1;`), timeout: 40 },
  // ══ 毕业生：名录 → 几位不同行当的毕业生（不只数据分析师） ══
  { pause: true },
  { go: `${BASE}/college/graduates`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelectorAll('.cg-card').length > 10, 30000); scrollTo(0, L.top(document.querySelector('#graduates'), 60)); await L.sleep(1200); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'graduates' },
  { eval: run(`const g = document.querySelector('.cg-grid'); const y0 = L.top(g, 120); await L.glide(y0, 1200); await L.glide(y0 + 900, 3200); return 1;`), timeout: 20 },
  ...hub(ids.mkt),
  ...hub(ids.mech),
  ...MORE.flatMap(hubFast),
  // 档案：机械设计工程师（能去哪些公司）
  { pause: true },
  { go: `${BASE}/college/g/${ids.mech}`, wait: 9000 },
  { eval: run(`await L.until(() => document.querySelector('.gp-hero h1') && document.querySelector('.gp-grid'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'profile' },
  { eval: run(`await L.sleep(1500); await L.glide(L.top(document.querySelector('.gp-grid'), 90), 1800); await L.sleep(2500); const j = document.querySelector('.gp-wide'); if (j) { await L.glide(L.top(j, 120), 2000); await L.sleep(3000); } return 1;`), timeout: 30 },
  // ══ 两个客户案例 ══
  ...bench('7qcJtWqngHs', 'case1', '客户案例 · 出海团队', '要去海外，先配一支出海小队', ['出海市场分析师', '跨境合规专员', '多语种本地化编辑', '多语种海外客服']),
  ...block(`${BASE}/college/cases#overseas`, '#overseas .cs-team', 120, ['客户案例 · 出海团队', '团队里怎么配 AI'], 4),
  ...scene3d('rocket', 'case2', '客户案例 · 车间数据', '攒了两年数据，先想清楚该采什么', ['场景数据工程师', '工业数据采集工程师', '数据质检员'], 7),
  // ══ 供血 / 会自己长大 ══
  // OPC：一个人加一队数字职人；AI Native：按环节配好人和 AI（替代 / 增强 / 协同）；最后落到 3D 指挥大厅
  ...block(`${BASE}/college#industries`, '.cu-supply', 160, ['OPC · 一个人的公司', '一个人，加一队数字职人，就是一家公司'], 5).map((x, i) => (i === 3 ? [x, { note: 'supply' }] : [x])).flat(),
  ...block(`${BASE}/college/cases#startup`, '#startup .cs-team', 120, ['AI NATIVE 组织', '按环节配好人和 AI', ['替代', '增强', '协同']], 6),
  ...scene3d('command', null, 'AI NATIVE · 供血', '这所大学，给它们供血', null, 5),
  ...bench('2ebPYYMKopQ', 'flywheel', '会自己长大的大学', '好老师越多，课越多；干过的活越多，教材越厚', null),
  { note: 'tail_end' },
  { hold: 1 },
];
