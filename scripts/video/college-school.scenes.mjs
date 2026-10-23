/**
 * 《AI 上学记》分镜 · 第二版（2026-10-23，用户：AI 视角不带任何管理框架，只露学生能看到的）：
 * 一个通用大模型（通义千问 Plus）在百业学院入学、拜师、被这一行的尺子量出差距、反思补考、做真活、毕业、派去武岳峰资本。
 * 镜头只有：封面 → 学院官网两眼 → 这门课的一天 → 学生端 /college/s/<学籍>（祂自己的章节卡、规则、真活、去向）→ 档案 → 毕业证书 → 同学的学生端 → 片尾。
 * 教务处的页面一个不露，留给第二部《校长的一天》。
 *   TOKEN_FILE=<登录 token 文件> node scripts/video/drive.mjs out/college-school scripts/video/college-school.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
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
  const sec = label => [...document.querySelectorAll('.sv-sec')].find(s => (s.innerText || '').toUpperCase().includes(label));
  const toSec = (label, off = 60, ms = 1800) => { const s = sec(label); return s ? glide(top(s, off), ms) : sleep(10); };
  const flash = async (el, ms = 900) => { if (!el) return; const o = el.style.boxShadow; el.style.transition = 'box-shadow .3s'; el.style.boxShadow = '0 0 0 3px #b08d57'; await sleep(ms); el.style.boxShadow = o; };
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  return (window.__ck = { sleep, vis, until, glide, top, sec, toSec, flash, kill });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
const SV = (id) => `${BASE}/college/s/${id}`;

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  // ══ 封面 ══
  { pause: true },
  { go: `${BASE}/video/cover-school.html`, wait: 2500 },
  { resume: true },
  { note: 'cover' },
  { hold: 7 },

  // ══ 学院：只看两眼（祂走进校门）══
  { pause: true },
  { go: `${BASE}/college`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelectorAll('.cu-one').length > 10, 30000); scrollTo(0, 0); await L.sleep(1200); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'hero' },
  { hold: 6 },
  { eval: run(`await L.glide(L.top(document.querySelector('#about'), 40), 2600); await L.sleep(4500); return 1;`), timeout: 20 },

  // ══ 这门课的一天（学生看到的课表）══
  { pause: true },
  { go: `${BASE}/lab/${SPACE}?m=teach`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('.dayv-tl'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'day' },
  { eval: run(`const bs = [...document.querySelectorAll('.dayv-tl button')]; for (const b of bs.slice(0, 8)) { b.style.transition = 'background .3s'; b.style.background = 'rgba(176,141,87,.22)'; await L.sleep(750); b.style.background = ''; } await L.sleep(1500); return bs.length;`), timeout: 30 },

  // ══ 学生端：我自己的这门课 ══
  { pause: true },
  { go: SV(INVEST), wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('.sv-head') && document.querySelectorAll('.sv-card').length > 3, 30000); scrollTo(0, 0); await L.sleep(1200); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'student' },     // 立绘 + 我是谁 + 入学考 / 毕业考几个数
  { hold: 9 },
  { note: 'entrance' },    // 第一排章节卡：入学考那一列（反差）
  { eval: run(`await L.toSec('MY DAY', 50, 1800); const cards = [...document.querySelectorAll('.sv-card')].slice(0, 3); for (const c of cards) await L.flash(c.querySelector('.sv-scores'), 1200); await L.sleep(3000); return 1;`), timeout: 30 },
  { note: 'teachers' },    // 上课：卡里「上课记下的要点」
  { eval: run(`const c = [...document.querySelectorAll('.sv-card')].find(x => x.querySelector('.sv-notes')); if (c) { await L.glide(L.top(c, 120), 1600); await L.flash(c.querySelector('.sv-notes'), 1800); } await L.sleep(5000); return !!c;`), timeout: 30 },
  { note: 'chapters' },    // 整排卡：毕业考，哪章没过
  { eval: run(`const bad = [...document.querySelectorAll('.sv-card.bad, .sv-card')].find(x => x.querySelector('.sv-missed')) || document.querySelectorAll('.sv-card')[3]; if (bad) { await L.glide(L.top(bad, 140), 1800); await L.flash(bad, 2200); } await L.sleep(4500); return !!bad;`), timeout: 30 },
  { note: 'notebook' },    // 我记住的规则
  { eval: run(`await L.toSec('RULES I LEARNED', 60, 1800); await L.sleep(8000); return 1;`), timeout: 30 },
  { note: 'work' },        // 真活：我的分 vs 基线
  { eval: run(`await L.toSec('REAL WORK', 60, 1800); const c = L.sec('REAL WORK'); if (c) await L.flash(c.querySelector('.sv-scores'), 2200); await L.sleep(5500); return 1;`), timeout: 30 },
  { note: 'placement' },   // 去向
  { eval: run(`await L.toSec('WHERE I GO', 120, 1600); await L.sleep(5000); return 1;`), timeout: 30 },

  // ══ 档案与证书：写给要用我的人看 ══
  { pause: true },
  { go: `${BASE}/college/g/${SPACE}`, wait: 9000 },
  { eval: run(`await L.until(() => document.querySelector('.gp-hero'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'profile' },
  { eval: run(`await L.sleep(3000); await L.glide(700, 2600); await L.sleep(3500); return 1;`), timeout: 20 },
  { pause: true },
  { go: `${BASE}/college/g/${SPACE}/diploma`, wait: 9000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('DIPLOMA') || document.body.innerText.includes('毕业证书'), 30000); await L.sleep(1500); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'diploma' },
  { eval: run(`await L.sleep(2500); const c = document.querySelector('.cover'); c && c.click(); await L.sleep(7500); return !!c;`), timeout: 20 },

  // ══ 同学：实验室的研究员 ══
  { pause: true },
  { go: SV(BIO), wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('.sv-head') && document.querySelectorAll('.sv-card').length > 3, 30000); scrollTo(0, 0); await L.sleep(1200); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'bio' },
  { eval: run(`await L.sleep(4000); await L.toSec('MY DAY', 50, 2000); await L.sleep(5000); return 1;`), timeout: 30 },

  // ══ 片尾 ══
  { pause: true },
  { go: `${BASE}/video/end-college.html`, wait: 2000 },
  { resume: true },
  { note: 'end' },
  { hold: 10 },
];
