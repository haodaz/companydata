/**
 * 《聊着出题怎么用》分镜（2026-10-24）：封面 → 填表出题（新参考资料栏）→ 切到聊着出题 → 回放真实线程（追问 / 参考资料 / 确认 / 出好 / 修订）→ 收尾。
 *   TOKEN_FILE=<登录 token> node scripts/video/drive.mjs out/chat-howto scripts/video/chat-howto.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const THREAD = '9437fbce-7f5d-4e4e-b59d-109da6b18b23';

const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  function glideEl(el, y, ms = 1800) { return new Promise(res => { const y0 = el.scrollTop, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); el.scrollTop = y0 + (y - y0) * ease(t); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  function glide(y, ms = 1800) { return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); }); }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  // 对话区：走到第 n 条用户消息（0 起）停住
  async function toUser(n, ms = 1400) { const box = document.querySelector('.wc-thread'); if (!box) return; const users = [...box.querySelectorAll('.wc-user')]; const u = users[Math.min(n, users.length - 1)]; if (u) await glideEl(box, Math.max(0, u.offsetTop - 60), ms); }
  async function toBottom(ms = 1600) { const box = document.querySelector('.wc-thread'); if (box) await glideEl(box, box.scrollHeight, ms); }
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  const flash = async (el, ms = 900) => { if (!el) return; const o = el.style.boxShadow; el.style.transition = 'box-shadow .3s'; el.style.boxShadow = '0 0 0 3px #6055f5'; await sleep(ms); el.style.boxShadow = o; };
  return (window.__ck = { sleep, until, glide, glideEl, top, toUser, toBottom, kill, flash });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
const cover = (line, sub) => `${BASE}/video/cover-work.html?line=${encodeURIComponent(line)}&sub=${encodeURIComponent(sub)}`;

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('出一道真活，|聊着出'), wait: 2500 }, { resume: true },
  { note: 'cover' }, { hold: 7 },

  // 填表出题：滚到第五栏参考资料
  { pause: true }, { go: `${BASE}/work/new`, wait: 6000 }, { eval: run(`await L.until(() => document.querySelector('h1'), 20000); scrollTo(0, 0); await L.sleep(800); return 1;`), timeout: 30 }, { resume: true },
  { note: 'form' }, { eval: run(`await L.sleep(3500); const h = [...document.querySelectorAll('span')].find(x => x.textContent === '参考资料（选填）'); if (h) { await L.glide(L.top(h, 160), 2200); await L.flash(h.parentElement.parentElement, 1600); } await L.sleep(4000); return 1;`), timeout: 40 },

  // 切到聊着出题
  { pause: true }, { go: `${BASE}/work/new/chat`, wait: 6000 }, { eval: run(`await L.until(() => document.querySelector('.wc-hero'), 20000); await L.sleep(600); return 1;`), timeout: 30 }, { resume: true },
  { note: 'switch' }, { eval: run(`const m = document.querySelector('.wc-mode'); await L.flash(m, 1500); await L.sleep(3500); return 1;`), timeout: 20 },

  // 回放线程：一段一段走
  { pause: true }, { go: `${BASE}/work/new/chat?thread=${THREAD}`, wait: 7000 }, { eval: run(`await L.until(() => document.querySelectorAll('.wc-user').length > 0, 30000); const box = document.querySelector('.wc-thread'); if (box) box.scrollTop = 0; await L.sleep(1200); return 1;`), timeout: 40 }, { resume: true },
  { note: 'ask1' }, { eval: run(`await L.toUser(0, 1000); await L.sleep(7000); return 1;`), timeout: 30 },
  { note: 'ask2' }, { eval: run(`await L.toUser(1, 1600); await L.sleep(6000); return 1;`), timeout: 30 },
  { note: 'confirm' }, { eval: run(`await L.toUser(2, 1600); await L.sleep(6000); return 1;`), timeout: 30 },
  { note: 'done' }, { eval: run(`await L.toUser(3, 1600); await L.sleep(3000); const box = document.querySelector('.wc-thread'); const u = [...box.querySelectorAll('.wc-user')][3]; if (u) await L.glideEl(box, u.offsetTop + 420, 2600); await L.sleep(7000); return 1;`), timeout: 40 },
  { note: 'revise' }, { eval: run(`await L.toUser(4, 1600); await L.sleep(4000); await L.toBottom(2200); await L.sleep(5000); return 1;`), timeout: 40 },

  { pause: true }, { go: `${BASE}/work/mine`, wait: 6000 }, { eval: run(`await L.until(() => document.body.innerText.includes('真活'), 20000); await L.sleep(600); return 1;`), timeout: 30 }, { resume: true },
  { note: 'end' }, { hold: 8 },
];
