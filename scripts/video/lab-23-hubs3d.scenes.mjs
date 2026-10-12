/** 补录几个有了 3D 场景的主页段（主页晃一下 → 走进 3D 看一圈），段名 <k>_hub，用 splice.py 换进 lab-23 的成片。HUBS 环境变量选哪几个（逗号分隔） */
import { run } from './lab-surgeon.scenes.mjs';
import { PROS } from './lab-23.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const want = (process.env.HUBS || 'sandtable,paving,greenhouse').split(',');

const HUB_WIGGLE = run(`
  await L.until(() => document.querySelector('section.hub') || document.body, 15000); await L.sleep(800);
  const hub = document.querySelector('section.hub') || document.body; const r = hub.getBoundingClientRect();
  for (let i = 0; i <= 50; i++) { const a = i / 50 * Math.PI * 2; const x = r.left + r.width * (0.5 + 0.38 * Math.sin(a)), y = r.top + Math.min(r.height, window.innerHeight) * (0.45 + 0.22 * Math.sin(a * 1.6));
    hub.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'wiggle';`);
const CLICK_3D = run(`const el = [...document.querySelectorAll('a, button')].find(x => /走进/.test(x.innerText)); if (!el) throw new Error('没有 3D 入口'); el.style.outline = '3px solid #fff'; await L.sleep(700); el.click(); return 'click';`);
// 高斯是渐进加载的：「LOADING 3D」消失后再等一会儿，别录到半加载的画面
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); await L.sleep(16000); return '3d ready';`);
const SWEEP = run(`
  const W = window.innerWidth, H = window.innerHeight, N = 170;
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + 0.44 * Math.sin(a)), y = H * (0.5 + 0.24 * Math.sin(a * 2));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'sweep';`);

const scenes = [];
for (const k of want) {
  const p = PROS.find(x => x.k === k); if (!p) continue;
  scenes.push(
    { go: `${BASE}/lab/${p.space}`, wait: 6000 },
    { note: `${k}_hub` }, { eval: HUB_WIGGLE, timeout: 30 },
    { pause: true }, { eval: CLICK_3D }, { eval: WAIT3D, timeout: 90 }, { resume: true },
    { eval: SWEEP, timeout: 60 },
    { note: `${k}_hub_end` }, { hold: 0.5 },
  );
}
export default scenes;
