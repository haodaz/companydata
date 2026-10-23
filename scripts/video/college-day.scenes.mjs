/**
 * 《校长的一天》分镜（2026-10-23）：好大壮院长一天里对学院秘书说的话，秘书真办的事。和《AI 上学记》相反——整个教务平台的框架都露：
 * 侧栏、总览、线索、课程、学籍、毕业生，加上和秘书的对话（回放 scripts/college-day.mts 真跑出来的线程）。
 *   TOKEN_FILE=<登录 token> node scripts/video/drive.mjs out/college-day scripts/video/college-day.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 */
import fs from 'node:fs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const ST = JSON.parse(fs.readFileSync('scripts/.college-demo.json', 'utf8'));
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const T = ST.day_threads || {};
const th = (k) => Object.entries(T).find(([n]) => n.includes(k))?.[1];

const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  function glideEl(el, y, ms = 1800) {
    return new Promise(res => { const y0 = el.scrollTop, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
      const step = now => { const t = Math.min(1, (now - t0) / ms); el.scrollTop = y0 + (y - y0) * ease(t); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }
  function glide(y, ms = 1800) { return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  // 对话区：按用户的每一句往下走，每句停一会
  async function walkThread(perMs = 3200) { const box = document.querySelector('.cc-thread'); if (!box) return 0; const users = [...box.querySelectorAll('.cc-user')]; for (const u of users) { const y = u.offsetTop - 40; await glideEl(box, y, 1400); await sleep(perMs); } await glideEl(box, box.scrollHeight, 1600); await sleep(2500); return users.length; }
  const flash = async (el, ms = 900) => { if (!el) return; const o = el.style.boxShadow; el.style.transition = 'box-shadow .3s'; el.style.boxShadow = '0 0 0 3px #b08d57'; await sleep(ms); el.style.boxShadow = o; };
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  return (window.__ck = { sleep, until, glide, glideEl, top, walkThread, flash, kill });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
const CHAT = (id) => `${BASE}/college/admin/chat?thread=${id}`;
const WAIT_CHAT = run(`await L.until(() => document.querySelectorAll('.cc-user').length > 0, 30000); const box = document.querySelector('.cc-thread'); if (box) box.scrollTop = 0; await L.sleep(1500); return 1;`);

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  // ══ 封面 ══
  { pause: true }, { go: `${BASE}/video/cover-day.html`, wait: 2500 }, { resume: true },
  { note: 'cover' }, { hold: 7 },

  // ══ 早上：总览 → 和秘书的第一段对话 ══
  { pause: true }, { go: `${BASE}/college/admin`, wait: 7000 },
  { eval: run(`await L.until(() => document.querySelector('.ca-stat'), 20000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 30 }, { resume: true },
  { note: 'overview' }, { hold: 8 },
  { pause: true }, { go: CHAT(th('早上')), wait: 7000 }, { eval: WAIT_CHAT, timeout: 40 }, { resume: true },
  { note: 'morning' }, { eval: run(`await L.walkThread(3400); return 1;`), timeout: 90 },

  // ══ 上午：新线索 → 造课 → 开学籍 → 培养 ══
  { pause: true }, { go: `${BASE}/college/admin/applications?kind=hire`, wait: 6000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('储能'), 20000); const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('储能')); tr && tr.click(); await L.sleep(1000); return 1;`), timeout: 30 }, { resume: true },
  { note: 'lead' }, { eval: run(`const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('储能')); await L.flash(tr, 1500); await L.sleep(5000); return 1;`), timeout: 20 },
  { pause: true }, { go: CHAT(th('上午')), wait: 7000 }, { eval: WAIT_CHAT, timeout: 40 }, { resume: true },
  { note: 'build' }, { eval: run(`await L.walkThread(3600); return 1;`), timeout: 120 },
  { pause: true }, { go: `${BASE}/college/admin/courses`, wait: 6000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('出海'), 20000); const tr = [...document.querySelectorAll('tr')].find(t => t.innerText.includes('出海')); if (tr) await L.glide(L.top(tr, 240), 1500); return 1;`), timeout: 30 }, { resume: true },
  { note: 'course' }, { eval: run(`const tr = [...document.querySelectorAll('tr')].find(t => t.innerText.includes('出海')); await L.flash(tr, 1800); await L.sleep(4000); return 1;`), timeout: 20 },
  { pause: true }, { go: `${BASE}/college/admin/training`, wait: 6000 },
  { eval: run(`await L.until(() => document.querySelectorAll('tr.click').length > 0, 20000); const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('出海')); if (tr) await L.flash(tr, 1200); return 1;`), timeout: 30 }, { resume: true },
  { note: 'training' }, { eval: run(`const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('出海')); await L.flash(tr, 1500); await L.sleep(2000); tr && tr.click(); await L.until(() => document.querySelector('.ca-hero'), 20000); await L.sleep(5000); return 1;`), timeout: 40 },

  // ══ 中午：差距 → 去向 ══
  { pause: true }, { go: CHAT(th('中午')), wait: 7000 }, { eval: WAIT_CHAT, timeout: 40 }, { resume: true },
  { note: 'gap' }, { eval: run(`await L.walkThread(3600); return 1;`), timeout: 90 },
  { pause: true }, { go: `${BASE}/college/admin/graduates`, wait: 6000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('具身智能'), 20000); const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('具身智能')); tr && tr.click(); await L.sleep(1000); return 1;`), timeout: 30 }, { resume: true },
  { note: 'graduates' }, { eval: run(`const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('具身智能')); await L.flash(tr, 1500); await L.sleep(5000); return 1;`), timeout: 20 },

  // ══ 下午：研究员补课 ══
  { pause: true }, { go: CHAT(th('下午')), wait: 7000 }, { eval: WAIT_CHAT, timeout: 40 }, { resume: true },
  { note: 'bio' }, { eval: run(`await L.walkThread(3400); return 1;`), timeout: 90 },

  // ══ 傍晚：交付说明 → 总结 ══
  { pause: true }, { go: CHAT(th('傍晚')), wait: 7000 }, { eval: WAIT_CHAT, timeout: 40 }, { resume: true },
  { note: 'evening' }, { eval: run(`await L.walkThread(3800); return 1;`), timeout: 120 },

  // ══ 片尾 ══
  { pause: true }, { go: `${BASE}/video/end-college.html`, wait: 2000 }, { resume: true },
  { note: 'end' }, { hold: 10 },
];
