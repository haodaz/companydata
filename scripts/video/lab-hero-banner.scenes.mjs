/**
 * /lab 首页 banner 背景：我们自己的三个空间各录一段（有景深的 3D / 实拍 360°），串成无缝循环。
 *   LAB_TOKEN_FILE=.preview-token CHROME_GPU=1 node scripts/video/drive.mjs out/hero-banner scripts/video/lab-hero-banner.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080 --fps=15
 * 3D 帧率有限：镜头放慢 3 倍录（每段约 33 秒），后期 setpts=PTS/3 加速成 ~11 秒。录的时候把页面上的字和按钮都藏掉，只留画面。
 *   火箭总装（3D 高斯，鼠标视差）→ 锅炉房（实拍 360°，方向键平移）→ 咖啡吧台（3D 高斯，鼠标视差）
 */
import fs from 'fs';
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.LAB_TOKEN_FILE, 'utf8').trim();
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); await L.sleep(9000); return '3d ready';`);
// 只留画布：字、按钮、标记全藏（visibility 子元素可以单独放出来）
const CLEAN = run(`const s = document.createElement('style'); s.textContent = 'body * { visibility: hidden !important; cursor: none !important } canvas { visibility: visible !important }'; document.head.appendChild(s); await L.sleep(800); return 'clean';`);
// 3D：鼠标沿一条慢慢的 ∞ 字走，场景跟着视差（33 秒，后期 3 倍速）
const SWEEP = run(`
  const W = window.innerWidth, H = window.innerHeight, N = 660;
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + 0.40 * Math.sin(a)), y = H * (0.5 + 0.16 * Math.sin(a * 2));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); document.querySelector('canvas')?.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(50); }
  return 'sweep';`);
// 360° 实拍：按住右方向键慢慢转（33 秒）
const PAN = run(`
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await L.sleep(33000);
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })); return 'pan';`);

export default [
  { go: `${BASE}/login`, wait: 1500 },
  { eval: `async () => { document.cookie = 'auth_token=${TOKEN}; path=/'; return 'cookie'; }` },
  { go: `${BASE}/lab/beta/3d/rocket`, wait: 3000 }, { pause: true }, { eval: WAIT3D, timeout: 90 }, { eval: CLEAN, timeout: 10 }, { resume: true },
  { note: 'rocket' }, { eval: SWEEP, timeout: 60 },
  { pause: true }, { go: `${BASE}/lab/beta/3d/boiler`, wait: 3000 }, { eval: WAIT3D, timeout: 90 }, { eval: CLEAN, timeout: 10 }, { resume: true },
  { note: 'boiler' }, { eval: PAN, timeout: 60 },
  { pause: true }, { go: `${BASE}/lab/beta/3d/cafe`, wait: 3000 }, { eval: WAIT3D, timeout: 90 }, { eval: CLEAN, timeout: 10 }, { resume: true },
  { note: 'cafe' }, { eval: SWEEP, timeout: 60 },
  { note: 'end' },
];
