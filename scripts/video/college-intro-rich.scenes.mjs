/**
 * 百业大学介绍片第三版 · 用真东西替换片子里剩下的静态网页（网页是给没视频的人看的；片子要用更生动的东西讲每一块的意思）：
 *   about    → 三段空镜全屏轮播（好教材 / 好老师 / 干真活），public/video/loop.html
 *   become   → 百业里真实的职人空间列表一张张划过
 *   beliefs  → 几个岗位的 3D 现场快闪（珊瑚礁潜导 / 婴儿房月嫂 / 电池材料手套箱间）
 * 用 splice.py 换回去。3D 等 45 秒稳了再录。
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

const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); for (let i = 0; i < 2400; i++) { const a = i / 200 * Math.PI * 2; window.dispatchEvent(new PointerEvent('pointermove', { clientX: innerWidth * (0.5 + 0.3 * Math.sin(a)), clientY: innerHeight * 0.5, bubbles: true })); await L.sleep(45); } return '3d ready';`);
const SWEEP = (sec, amp = 0.4) => run(`
  const W = innerWidth, Hh = innerHeight, N = Math.round(${sec} * ${SLOW} * 22);
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + ${amp} * Math.sin(a)), y = Hh * (0.5 + ${amp} * 0.55 * Math.sin(a * 2));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'sweep';`);
const LAB_LOCAL = { 'lab:visitor': 'v:demo-college', 'lab:rookie': { name: '体验者', note: '', location: '' }, 'lab:rookie:asked': '1' };
const flash = (key, first) => [
  { pause: true },
  { go: `${BASE}/lab/beta/3d/${key}`, wait: 8000 },
  { eval: WAIT3D, timeout: 120 },
  ...(first ? [{ eval: run(`L.card('WHAT WE BELIEVE', '人 · 求真 · 心智世界', null); await L.sleep(800); return 1;`) }] : []),
  { resume: true },
  ...(first ? [{ note: 'beliefs' }] : []),
  { eval: SWEEP(3.2), timeout: 80 },
];

export default [
  // 关于：好教材 / 好老师 / 干真活
  { pause: true },
  { go: `${BASE}/video/loop.html?v=book,hands,work&t=${encodeURIComponent('好教材|好老师|干真活')}&e=${encodeURIComponent('Curriculum|Faculty|Real Work')}&d=4`, wait: 3000 },
  { eval: `async () => { for (let i = 0; i < 60 && !window.__ready; i++) await new Promise(r => setTimeout(r, 300)); return !!window.__ready; }`, timeout: 30 },
  { resume: true },
  { note: 'about' },
  { hold: 12 },
  // 化成万千数字职人：百业里真实的职人空间
  { pause: true },
  { go: `${BASE}/lab/gallery`, wait: 4000 },
  { local: LAB_LOCAL, wait: 6000 },
  { eval: run(`await L.until(() => document.querySelectorAll('img').length > 12, 30000); scrollTo(0, 0); await L.sleep(1500); return document.querySelectorAll('img').length;`), timeout: 40 },
  { resume: true },
  { note: 'become' },
  { eval: run(`await L.sleep(1200); await L.glide(700, 2500); await L.glide(2400, 4500); await L.sleep(800); return 1;`), timeout: 20 },
  // 人 · 求真 · 心智世界：几个岗位的 3D 快闪
  ...flash('reef', true),
  ...flash('nursery', false),
  ...flash('glovebox', false),
  { note: 'rich_end' },
  { hold: 1 },
];
