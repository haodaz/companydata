/**
 * /lab 首页 banner 3D 段重录（火箭 / 手术室 / 指挥大厅…）：鼠标只走水平线（上下不动），从左到右缓缓移一趟（缓入缓出），推进在后期做平滑 zoom。
 *   LAB_TOKEN_FILE=.preview-token CHROME_GPU=1 node scripts/video/drive.mjs out/hero-rocket scripts/video/lab-hero-rocket.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080 --fps=15
 * 同样放慢 3 倍录（36 秒），后期 setpts=PTS/3。
 */
import fs from 'fs';
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.LAB_TOKEN_FILE, 'utf8').trim();
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); await L.sleep(9000); return '3d ready';`);
const CLEAN = run(`const s = document.createElement('style'); s.textContent = 'body * { visibility: hidden !important; cursor: none !important } canvas { visibility: visible !important }'; document.head.appendChild(s); await L.sleep(800); return 'clean';`);
const MOVE = (x) => `window.dispatchEvent(new PointerEvent('pointermove', { clientX: ${x}, clientY: window.innerHeight / 2, bubbles: true }));`;
// 先停在起点让缓动追上，再水平走一趟
const SWEEP = run(`
  const W = window.innerWidth, N = 720, X = i => W * (0.5 - 0.36 * Math.cos(i / N * Math.PI));
  ${MOVE('W * 0.14')} await L.sleep(3000);
  for (let i = 0; i <= N; i++) { const x = X(i); ${MOVE('x')} await L.sleep(50); }
  return 'sweep';`);

export default [
  { go: `${BASE}/login`, wait: 1500 },
  { eval: `async () => { document.cookie = 'auth_token=${TOKEN}; path=/'; return 'cookie'; }` },
  // HERO_SCENES=rocket,or,command：每个空间一段，段与段之间暂停录制
  ...(process.env.HERO_SCENES || 'rocket').split(',').flatMap(k => [
    { pause: true }, { go: `${BASE}/lab/beta/3d/${k}`, wait: 3000 }, { eval: WAIT3D, timeout: 90 }, { eval: CLEAN, timeout: 10 },
    { eval: run(`${MOVE('window.innerWidth * 0.14')} await L.sleep(3000); return 'start';`), timeout: 10 }, { resume: true },
    { note: k }, { eval: SWEEP, timeout: 90 },
  ]),
  { note: 'end' },
];
