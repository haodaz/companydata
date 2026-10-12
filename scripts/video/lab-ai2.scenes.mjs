/**
 * 分镜：平方智能 · 怎么给一个 AI 升维构建空间（第二版，用户 2026-10-11 定：只讲升维构建，不讲数据飞轮采集；讲开放合作）。
 *   LAB_TOKEN_FILE=<token> CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/lab-ai2.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080 --fps=15
 * 五层升维：身份 → 环境（3D）→ 人（素材库）→ 物（设备 / 数采点）→ 时间（一天）；然后向下教考、向上学、平行干活；最后开放合作、规模化。
 * a1_spaces（选 JD 真实构建的 loading）不重录，用 splice.py 从 vai-fix 换进来。
 */
import fs from 'fs';
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.LAB_TOKEN_FILE, 'utf8').trim();
const OR = '681b5f1c-5115-4c32-82ea-69c085b21868';
const ROCKET = '640f3bc6-6ce1-4c32-82dd-6491344ab86f';
const CONVERTER = '71a6cbf5-1977-4139-8299-1f66b83f9e03', CONVERTER_CH = 'a15c896f-7e5b-45f4-95f0-a245f57e5767';
const PAVING = '0cfe3233-acd9-4e4c-b910-3d9350f18eff', PAVING_CH = 'a033f8d2-0df8-440c-a9b9-529b28beeeeb';
const GREENHOUSE = '7dd9393d-992c-4c50-afd8-0af8f2352add', GREENHOUSE_CH = 'e87d082f-bd1b-4d21-ab8e-d58f1f2d0313';
const DESK = 'a35a662d-2be8-4cc1-a255-4c3f8ad29139';

const HUB_WIGGLE = run(`
  await L.until(() => document.querySelector('section.hub') || document.body, 15000); await L.sleep(800);
  const hub = document.querySelector('section.hub') || document.body; const r = hub.getBoundingClientRect();
  for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; const x = r.left + r.width * (0.5 + 0.38 * Math.sin(a)), y = r.top + Math.min(r.height, window.innerHeight) * (0.45 + 0.22 * Math.sin(a * 1.6));
    hub.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'wiggle';`);
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); await L.sleep(9000); return '3d ready';`);
const SWEEP_TAG = run(`
  const W = window.innerWidth, H = window.innerHeight, N = 160;
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + 0.42 * Math.sin(a)), y = H * (0.5 + 0.22 * Math.sin(a * 2));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  const tag = [...document.querySelectorAll('button, div, span')].find(x => (x.innerText || '').trim() === '发动机喷管' && x.getClientRects().length);
  if (tag) { tag.click(); await L.sleep(4500); }
  return 'sweep+tag';`);
const TO_BENCH = run(`
  await L.sleep(1500);
  const w = [...document.querySelectorAll('button')].find(x => /走一遍/.test(x.innerText) && !x.disabled); if (w) { await L.click(w, 2000); }
  const go = L.btn('走这一段'); if (go) await L.click(go, 2000);
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('.bench-hud')) break;
    const d = document.querySelector('.lab-game-dialogue'); if (d && d.getClientRects().length) { d.click(); await L.sleep(600); continue; }
    let acted = false; for (const t of ['开始操作', '下一步', '操作完毕']) { const b = L.btn(t); if (b && !b.disabled) { await L.click(b, 1200); acted = true; break; } }
    if (!acted) await L.sleep(600);
  }
  await L.sleep(800); return document.querySelector('.bench-hud') ? 'bench' : 'no bench';`);
const SCROLL = (px, secs) => run(`const y0 = window.scrollY, n = Math.round(${secs} * 20); for (let i = 0; i <= n; i++) { window.scrollTo(0, y0 + ${px} * i / n); await L.sleep(50); } return 'scrolled';`);
const GALLERY_SCROLL = (secs, px = 480) => run(`
  const first = [...document.querySelectorAll('button')].find(b => /开始体验/.test(b.innerText));
  const card = first ? (first.closest('article') || first.parentElement?.parentElement || first) : null;
  const y0 = card ? card.getBoundingClientRect().top + window.scrollY - 24 : 160;
  const n = Math.round(${secs} * 20); for (let i = 0; i <= n; i++) { window.scrollTo(0, y0 + ${px} * i / n); await L.sleep(50); } return 'scrolled';`);

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { go: `${BASE}/video/cover-ai.html?big=1&tint=wine`, wait: 2500 }, { note: 'cover' }, { hold: 4 },
  { go: `${BASE}/lab`, wait: 5000 },
  { local: { 'lab:visitor': 'v:showcase', 'lab:rookie': { name: '好大壮', note: '', location: '' }, 'lab:rookie:asked': '1' }, wait: 4000 },
  { note: 'a_landing' }, { hold: 5 },
  // 选 JD 真实构建：占个位，后面从 vai-fix 换 a1_spaces 进来
  { go: `${BASE}/lab/spaces`, wait: 6000 }, { note: 'a1_spaces' }, { hold: 3 },
  // 五层升维
  { go: `${BASE}/lab/${ROCKET}`, wait: 6000 }, { note: 'a_hub' }, { eval: HUB_WIGGLE, timeout: 30 },
  { go: `${BASE}/lab/beta/3d/rocket`, wait: 3000 }, { pause: true }, { eval: WAIT3D, timeout: 90 }, { resume: true },
  { note: 'a_3d' }, { eval: SWEEP_TAG, timeout: 60 },
  { go: `${BASE}/lab/assets`, wait: 7000 }, { note: 'a_cast' }, { eval: SCROLL(600, 8), timeout: 25 },
  { go: `${BASE}/lab/${PAVING}?m=teach&ch=${PAVING_CH}`, wait: 5000 }, { pause: true }, { eval: TO_BENCH, timeout: 120 }, { resume: true },
  { note: 'a_things' }, { hold: 24 },
  { go: `${BASE}/lab/${ROCKET}?m=teach`, wait: 6000 }, { note: 'a_day' }, { eval: SCROLL(500, 7), timeout: 25 },
  // 向下 / 向上 / 平行
  { go: `${BASE}/lab/${CONVERTER}?m=teach&ch=${CONVERTER_CH}`, wait: 5000 }, { pause: true }, { eval: TO_BENCH, timeout: 120 }, { resume: true },
  { note: 'b_teach' }, { hold: 70 },
  { go: `${BASE}/lab/me`, wait: 6000 }, { note: 'b_certs' }, { eval: SCROLL(400, 6), timeout: 20 },
  { go: `${BASE}/lab/${OR}?m=learn`, wait: 6000 }, { note: 'b_learn' }, { eval: SCROLL(900, 11), timeout: 30 },
  { go: `${BASE}/lab/${DESK}?m=solve`, wait: 6000 }, { note: 'b_solve' }, { eval: SCROLL(500, 10), timeout: 30 },
  // 开放合作
  { go: `${BASE}/lab/${GREENHOUSE}?m=teach&ch=${GREENHOUSE_CH}`, wait: 5000 }, { pause: true }, { eval: TO_BENCH, timeout: 120 }, { resume: true },
  { note: 'c_open' }, { hold: 22 },
  { go: `${BASE}/lab/${OR}?m=test`, wait: 6000 }, { note: 'c_standard' }, { eval: SCROLL(300, 7), timeout: 25 },
  { go: `${BASE}/lab/${OR}?m=learn`, wait: 6000 }, { note: 'c_expert' }, { eval: SCROLL(200, 6), timeout: 20 },
  { go: `${BASE}/lab/gallery`, wait: 6000 }, { note: 'c_many' }, { eval: GALLERY_SCROLL(8), timeout: 30 },
  { go: `${BASE}/video/end-ai.html`, wait: 3000 }, { note: 'end' }, { hold: 10 },
];
