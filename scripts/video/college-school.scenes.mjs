/**
 * 《AI 上学记》分镜（2026-10-23）：跟第一届的一位学生走——一个通用大模型（通义千问 Plus）在百业学院入学、拜师、考核、补训、做真活、毕业，
 * 被派去武岳峰资本做能看懂具身智能的分析师。全部是真页面、真成绩（scripts/college-demo-train.mts 跑出来的），旁白按录到的写。
 *   TOKEN_FILE=<登录 token 文件> node scripts/video/drive.mjs out/college-school scripts/video/college-school.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 画面顺序：封面 → 学院官网 → 线索（基金来要人）→ 课程目录 → 这门课的一天 → 学员（通义千问）→ 学籍：路径 / 章节成绩 / 笔记 / 真活 / 去向 → 毕业生 → 档案 → 毕业证书 → 第二位学生（研究员）→ 片尾校训。
 */
import fs from 'node:fs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const ST = JSON.parse(fs.readFileSync('scripts/.college-demo.json', 'utf8'));
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const INVEST = ST.invest_enrollment_id, BIO = ST.bio_enrollment_id, SPACE = ST.invest_space_id;

const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  function glide(y, ms = 1800) {
    return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
      const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  const card = label => [...document.querySelectorAll('.ca-card')].find(c => (c.innerText || '').toUpperCase().includes(label));
  const toCard = (label, off = 70, ms = 1800) => { const c = card(label); return c ? glide(top(c, off), ms) : sleep(10); };
  const btn = t => [...document.querySelectorAll('button, a, tr, div')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const flash = async (el, ms = 900) => { if (!el) return; const o = el.style.boxShadow; el.style.transition = 'box-shadow .3s'; el.style.boxShadow = 'inset 0 0 0 2px #b08d57'; await sleep(ms); el.style.boxShadow = o; };
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  return (window.__ck = { sleep, vis, until, glide, top, card, toCard, btn, flash, kill });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;

export default [
  // ══ 封面 ══
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true },
  { go: `${BASE}/video/cover-school.html`, wait: 2500 },
  { resume: true },
  { note: 'cover' },
  { hold: 6 },

  // ══ 一所 AI 的学院 ══
  { pause: true },
  { go: `${BASE}/college`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelectorAll('.cu-one').length > 10, 30000); scrollTo(0, 0); await L.sleep(1200); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'hero' },
  { hold: 7 },
  { eval: run(`await L.glide(L.top(document.querySelector('#about'), 40), 2600); await L.sleep(5000); return 1;`), timeout: 20 },

  // ══ 一家基金来要人（线索）══
  { pause: true },
  { go: `${BASE}/college/admin/applications?kind=hire`, wait: 6000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('武岳峰'), 20000); const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('武岳峰')); tr && tr.click(); await L.sleep(1000); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'lead' },
  { eval: run(`const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('武岳峰')); await L.flash(tr, 1500); await L.sleep(6000); return 1;`), timeout: 20 },

  // ══ 课程：教材早就有了 ══
  { pause: true },
  { go: `${BASE}/college/admin/courses`, wait: 6000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('具身智能'), 20000); const tr = [...document.querySelectorAll('tr')].find(t => t.innerText.includes('具身智能')); if (tr) await L.glide(L.top(tr, 240), 1500); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'course' },
  { eval: run(`const tr = [...document.querySelectorAll('tr')].find(t => t.innerText.includes('具身智能')); await L.flash(tr, 1800); await L.sleep(4500); return 1;`), timeout: 20 },
  // 这门课的一天
  { pause: true },
  { go: `${BASE}/lab/${SPACE}?m=teach`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('.dayv-tl'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'day' },
  { eval: run(`const bs = [...document.querySelectorAll('.dayv-tl button')]; for (const b of bs.slice(0, 8)) { b.style.transition = 'background .3s'; b.style.background = 'rgba(176,141,87,.22)'; await L.sleep(750); b.style.background = ''; } await L.sleep(1500); return bs.length;`), timeout: 30 },

  // ══ 学员：一个通用大模型 ══
  { pause: true },
  { go: `${BASE}/college/admin/students`, wait: 6000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('通义千问 Plus'), 20000); const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('通义千问 Plus（阿里云搜索）')); tr && tr.click(); await L.sleep(1500); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'student' },
  { hold: 7 },

  // ══ 学籍：这一门课，从入学到毕业 ══
  { pause: true },
  { go: `${BASE}/college/admin/training/${INVEST}`, wait: 7000 },
  { eval: run(`await L.until(() => document.querySelector('.ca-hero'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'record' },
  { hold: 8 },
  { note: 'path' },
  { eval: run(`await L.toCard('CURRICULUM PATH', 60, 1800); await L.sleep(6000); return 1;`), timeout: 20 },
  { note: 'chapters' },
  { eval: run(`await L.toCard('CHAPTERS', 60, 1800); const c = L.card('CHAPTERS'); const rows = [...c.querySelectorAll('tbody tr')]; for (const r of rows) { await L.flash(r, 900); } await L.sleep(2500); return rows.length;`), timeout: 40 },
  { note: 'notebook' },
  { eval: run(`await L.toCard("WHAT'S INSTALLED", 60, 1800); await L.sleep(9000); return 1;`), timeout: 20 },
  { note: 'work' },
  { eval: run(`const c = L.card('REAL WORK'); await L.glide(L.top(c, 60), 1600); await L.sleep(7000); return 1;`), timeout: 20 },
  { note: 'placement' },
  { eval: run(`await L.toCard('PLACEMENT', 120, 1600); await L.sleep(5000); return 1;`), timeout: 20 },

  // ══ 毕业生名册 → 档案 → 毕业证书 ══
  { pause: true },
  { go: `${BASE}/college/admin/graduates`, wait: 6000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('具身智能'), 20000); const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('具身智能')); tr && tr.click(); await L.sleep(1000); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'graduates' },
  { eval: run(`const tr = [...document.querySelectorAll('tr.click')].find(t => t.innerText.includes('具身智能')); await L.flash(tr, 1500); await L.sleep(5000); return 1;`), timeout: 20 },
  { pause: true },
  { go: `${BASE}/college/g/${SPACE}`, wait: 9000 },
  { eval: run(`await L.until(() => document.querySelector('.gp-hero'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'profile' },
  { eval: run(`await L.sleep(3500); await L.glide(700, 2600); await L.sleep(3500); return 1;`), timeout: 20 },
  { pause: true },
  { go: `${BASE}/college/g/${SPACE}/diploma`, wait: 9000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('DIPLOMA') || document.body.innerText.includes('毕业证书'), 30000); await L.sleep(1500); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'diploma' },
  // 证书夹：封皮停两秒再点开（翻页动画 1 秒），然后看证书页
  { eval: run(`await L.sleep(2500); const c = document.querySelector('.cover'); c && c.click(); await L.sleep(7500); return !!c;`), timeout: 20 },

  // ══ 第二位学生：实验室的研究员 ══
  { pause: true },
  { go: `${BASE}/college/admin/training/${BIO}`, wait: 7000 },
  { eval: run(`await L.until(() => document.querySelector('.ca-hero'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'bio' },
  { eval: run(`await L.sleep(4000); await L.toCard('CHAPTERS', 60, 2000); await L.sleep(5000); return 1;`), timeout: 20 },

  // ══ 片尾 ══
  { pause: true },
  { go: `${BASE}/video/end-college.html`, wait: 2000 },
  { resume: true },
  { note: 'end' },
  { hold: 10 },
];
