/**
 * 补录片一的 10:20 阻抗谱一章（主分镜里 c3_intro … c3_report 那几段），之后 splice.py 换进成片。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <补录目录> scripts/video/lab-research-lxm-fix1020.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 */
import all from './lab-research-lxm.scenes.mjs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SPACE = 'c8c986e6-6452-4834-bac4-1ce2a360c9cc';
const i0 = all.findIndex(s => s.note === 'c3_intro'), i1 = all.findIndex(s => s.note === 'tour');
export default [
  { pause: true },
  { go: `${BASE}/lab/${SPACE}`, wait: 4000 },
  { local: { 'lab:visitor': 'v:demo-lxm-research', 'lab:rookie': { name: '林小满', note: '材料科学与工程 · 大一', location: '长沙' }, 'lab:rookie:asked': '1' }, wait: 5000 },
  { go: `${BASE}/lab/${SPACE}?m=test`, wait: 7000 },
  { resume: true },
  ...all.slice(i0, i1),
];
