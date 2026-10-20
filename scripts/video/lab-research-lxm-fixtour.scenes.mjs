/** 补录片一的 tour 段（12:00 场景图换过之后），splice.py 换进成片 */
import all from './lab-research-lxm.scenes.mjs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SPACE = 'c8c986e6-6452-4834-bac4-1ce2a360c9cc';
const i = all.findIndex(s => s.note === 'tour');
export default [
  { pause: true },
  { go: `${BASE}/lab/${SPACE}`, wait: 4000 },
  { local: { 'lab:visitor': 'v:demo-lxm-research', 'lab:rookie': { name: '林小满', note: '材料科学与工程 · 大一', location: '长沙' }, 'lab:rookie:asked': '1' }, wait: 5000 },
  { go: `${BASE}/lab/${SPACE}?m=test`, wait: 7000 },
  { eval: `async () => { const b = [...document.querySelectorAll('.dayv-tl button')].find(b => b.innerText.includes('10:20')); b && b.click(); await new Promise(r => setTimeout(r, 1500)); window.scrollTo({ top: 0 }); return 1; }` },
  { resume: true },
  all[i], all[i + 1],
  { note: 'tour_end' }, { hold: 1 },
];
