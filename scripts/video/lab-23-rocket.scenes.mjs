/** 只补录火箭那一段（主页 → 走进 3D 发动机段看一圈 → 试车台），用 splice.py 按段名换进 lab-23 的成片 */
import { run } from './lab-surgeon.scenes.mjs';
import { PROS } from './lab-23.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const p = PROS.find(x => x.k === 'rocket');

const HUB_WIGGLE = run(`
  await L.until(() => document.querySelector('section.hub') || document.body, 15000); await L.sleep(800);
  const hub = document.querySelector('section.hub') || document.body; const r = hub.getBoundingClientRect();
  for (let i = 0; i <= 50; i++) { const a = i / 50 * Math.PI * 2; const x = r.left + r.width * (0.5 + 0.38 * Math.sin(a)), y = r.top + Math.min(r.height, window.innerHeight) * (0.45 + 0.22 * Math.sin(a * 1.6));
    hub.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'wiggle';`);
const CLICK_3D = run(`const el = [...document.querySelectorAll('a, button')].find(x => /走进/.test(x.innerText)); if (!el) throw new Error('没有 3D 入口'); el.style.outline = '3px solid #fff'; await L.sleep(700); el.click(); return 'click';`);
// 高斯是渐进加载的：「LOADING 3D」消失后还要再等几秒，不然录到一半的迷幻画面
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); await L.sleep(16000); return '3d ready';`);
const SWEEP = run(`
  const W = window.innerWidth, H = window.innerHeight, N = 200;
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + 0.44 * Math.sin(a)), y = H * (0.5 + 0.24 * Math.sin(a * 2));
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

export default [
  { go: `${BASE}/lab/${p.space}`, wait: 6000 },
  { note: 'rocket_hub' }, { eval: HUB_WIGGLE, timeout: 30 },
  { pause: true }, { eval: CLICK_3D }, { eval: WAIT3D, timeout: 90 }, { resume: true },
  { eval: SWEEP, timeout: 60 },
  { go: `${BASE}/lab/${p.space}?m=teach&ch=${p.ch}`, wait: 5000 },
  { pause: true }, { eval: TO_BENCH, timeout: 120 }, { resume: true },
  { note: 'rocket_bench' }, { hold: p.hold },
  { note: 'rocket_end' }, { hold: 1 },
];
