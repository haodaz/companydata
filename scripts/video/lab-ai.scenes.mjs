/**
 * 分镜：平方智能 · AI 职人与虚拟职业空间（讲 AI 本身，不是体验者）。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/lab-ai.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080 --fps=15
 * 三幕：先看能做到什么 → 老师傅做完操作接着深访 → 最后讲为什么能（vsbp 的数据飞轮 / 知识编织 / 给人升维，file:// 直接录）。
 */
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const VSBP = 'file:///Users/aisandbox/Documents/vsbp';
const OR = '681b5f1c-5115-4c32-82ea-69c085b21868', OR_CH = 'f0f8cd1b-7c16-4797-b58c-d4dfd1d3c4a7';
const NURSE = 'c9783880-561f-49fe-95ad-2a7b2de68d01';
const DIVE = '387fcc19-bd56-453e-a983-b3a1b4da5704', DIVE_CH = 'ef6106e2-4a7a-4ec1-b074-e569c6794134';

const HUB_WIGGLE = run(`
  await L.until(() => document.querySelector('section.hub') || document.body, 15000); await L.sleep(800);
  const hub = document.querySelector('section.hub') || document.body; const r = hub.getBoundingClientRect();
  for (let i = 0; i <= 70; i++) { const a = i / 70 * Math.PI * 2; const x = r.left + r.width * (0.5 + 0.38 * Math.sin(a)), y = r.top + Math.min(r.height, window.innerHeight) * (0.45 + 0.22 * Math.sin(a * 1.6));
    hub.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'wiggle';`);
const CLICK_TEXT = (t, sel = 'a, button') => run(`const el = await L.until(() => [...document.querySelectorAll('${sel}')].find(x => x.innerText.includes(${JSON.stringify(t)}))); if (!el) throw new Error('没找到 ' + ${JSON.stringify(t)}); el.style.outline = '3px solid #fff'; await L.sleep(700); el.click(); return 'click';`);
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); await L.sleep(3500); return '3d ready';`);
const SWEEP = (sec = 7, amp = 0.42) => run(`
  const W = window.innerWidth, H = window.innerHeight, N = Math.round(${sec} * 22);
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + ${amp} * Math.sin(a)), y = H * (0.5 + ${amp} * 0.55 * Math.sin(a * 2));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'sweep';`);
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
// 缓缓往下滚 px（页面）
const SCROLL = (px, secs) => run(`const y0 = window.scrollY, n = Math.round(${secs} * 20); for (let i = 0; i <= n; i++) { window.scrollTo(0, y0 + ${px} * i / n); await L.sleep(50); } return 'scrolled';`);
// vsbp 竖版画布：放大到铺满宽度，再从 y0 缓缓平移到 y1
const VSBP_PAN = (zoom, y0, y1, secs) => run(`
  document.body.style.zoom = '${zoom}'; await L.sleep(600);
  const n = Math.round(${secs} * 20); for (let i = 0; i <= n; i++) { window.scrollTo(0, ${y0} + (${y1} - ${y0}) * i / n); await L.sleep(50); } return 'pan';`);

export default [
  { go: `${BASE}/video/cover-ai.html`, wait: 2500 }, { note: 'cover' }, { hold: 4 },
  { go: `${BASE}/lab`, wait: 5000 },
  { local: { 'lab:visitor': 'v:showcase', 'lab:rookie': { name: '好大壮', note: '', location: '' }, 'lab:rookie:asked': '1' }, wait: 4000 },
  { note: 'a1_landing' }, { hold: 4 },
  // 一、能做到什么
  { go: `${BASE}/lab/spaces`, wait: 6000 }, { note: 'a1_spaces' }, { eval: SCROLL(300, 5), timeout: 20 },
  { go: `${BASE}/lab/studio/${NURSE}`, wait: 7000 }, { note: 'a1_studio' }, { eval: SCROLL(500, 8), timeout: 25 },
  { go: `${BASE}/lab/${OR}`, wait: 6000 }, { note: 'a1_hub' }, { eval: HUB_WIGGLE, timeout: 30 },
  { eval: CLICK_TEXT('走进手术室') }, { pause: true }, { eval: WAIT3D, timeout: 90 }, { resume: true },
  { note: 'a1_or3d' }, { eval: SWEEP(7, 0.45), timeout: 60 },
  { go: `${BASE}/lab/${OR}?m=teach&ch=${OR_CH}`, wait: 5000 }, { pause: true }, { eval: TO_BENCH, timeout: 120 }, { resume: true },
  { note: 'a1_teach' }, { hold: 30 },
  { go: `${BASE}/lab/me`, wait: 6000 }, { note: 'a1_certs' }, { eval: SCROLL(400, 6), timeout: 20 },
  { go: `${BASE}/lab/${OR}?m=solve`, wait: 6000 }, { note: 'a1_solve' }, { eval: SCROLL(300, 6), timeout: 20 },
  { go: `${BASE}/lab/${OR}?m=ledger`, wait: 6000 }, { note: 'a1_ledger' }, { eval: SCROLL(300, 6), timeout: 20 },
  // 二、老师傅
  { go: `${BASE}/lab/${OR}?m=learn`, wait: 6000 }, { note: 'a2_learn' }, { eval: SCROLL(200, 6), timeout: 20 },
  { go: `${BASE}/lab/${DIVE}?m=teach&ch=${DIVE_CH}`, wait: 5000 }, { pause: true }, { eval: TO_BENCH, timeout: 120 }, { resume: true },
  { note: 'a2_expert' }, { hold: 40 },
  { go: `${BASE}/lab/${OR}?m=learn`, wait: 6000 }, { note: 'a2_interview' }, { eval: SCROLL(900, 10), timeout: 30 },
  { go: `${BASE}/lab/studio/${OR}`, wait: 7000 }, { note: 'a2_version' }, { eval: SCROLL(700, 8), timeout: 25 },
  // 三、为什么能
  { go: `${VSBP}/dataspace.html`, wait: 5000 }, { note: 'a3_dataspace' }, { eval: VSBP_PAN(1.7, 0, 700, 12), timeout: 40 },
  { go: `${VSBP}/ai-native.html`, wait: 5000 }, { note: 'a3_ainative' }, { eval: VSBP_PAN(1.7, 0, 500, 10), timeout: 40 },
  { go: `${VSBP}/upscale.html`, wait: 5000 }, { note: 'a3_upscale' }, { eval: VSBP_PAN(1.7, 0, 900, 13), timeout: 40 },
  { go: `${BASE}/lab/assets`, wait: 7000 }, { note: 'a3_assets' }, { eval: SCROLL(500, 6), timeout: 20 },
  { go: `${BASE}/lab/beta/3d/or`, wait: 3000 }, { pause: true }, { eval: WAIT3D, timeout: 90 }, { resume: true },
  { note: 'a3_tags' }, { eval: SWEEP(8, 0.3), timeout: 60 },
  { go: `${BASE}/video/end-ai.html`, wait: 3000 }, { note: 'end' }, { hold: 11 },
];
