/**
 * 百业大学介绍片第三版 · 快闪补录：讲到每个要点时，一串真东西一闪而过（每个一两秒），要「全、多、广」的感觉；主线还是跟着故事走。
 *   become  → 一排不同行当的职人主页
 *   day     → 几个不同岗位的「一天」（数据分析师打头）
 *   room3d  → 几个岗位的 3D 现场（数据分析工位打头）
 *   （四种真活的任务书快闪放在 college-intro-work 的开头）
 * 用 splice.py 换回主片的同名段。3D 先晃 ~110 秒等加载完（不录），再录 2 秒左右。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <补录目录> scripts/video/college-intro-flash.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SLOW = 3;
const LAB_LOCAL = { 'lab:visitor': 'v:demo-college', 'lab:rookie': { name: '体验者', note: '', location: '' }, 'lab:rookie:asked': '1' };

const H = `(() => {
  if (window.__cf) return window.__cf;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  // 职人主页上的平台统计数字录的时候遮掉
  const hideStats = () => {
    const tile = [...document.querySelectorAll('div')].find(d => /^\\d+\\s*人次\\s*服务$/.test((d.innerText || '').replace(/\\s+/g, ' ').trim()));
    if (tile && tile.parentElement) tile.parentElement.style.visibility = 'hidden';
    for (const el of document.querySelectorAll('*')) { if (el.children.length) continue; const t = el.textContent || '';
      if (/\\d+\\s*人考过/.test(t)) el.textContent = '换你上手'; else if (/^解过\\s*\\d+\\s*次$/.test(t.trim())) el.textContent = '带着问题来'; else if (/已吸收\\s*\\d+\\s*轮专家经验/.test(t)) el.textContent = '好老师的经验与判断规则'; }
  };
  return (window.__cf = { sleep, until, kill, hideStats });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;

const PEOPLE = ['a7f8f2e7-f82d-4092-8057-283ec533c27d', '19fd15d1-3787-4e65-a3a6-883a013ae59c', 'fde330a0-5f71-4a1f-b843-5571339b09c9', '392bcbeb-3cd9-43ae-8645-d5268ecfb465', '61f1f7fb-9b56-4e32-8a13-dac7c66fdddf', 'd571b482-4f94-488a-ba21-224b099a32b9', 'c5467cbd-623a-44c4-a528-902ba2ba6cd9', '7dd9393d-992c-4c50-afd8-0af8f2352add'];
const DAYS = ['a35a662d-2be8-4cc1-a255-4c3f8ad29139', '640f3bc6-6ce1-4c32-82dd-6491344ab86f', 'c9783880-561f-49fe-95ad-2a7b2de68d01', '0cfe3233-acd9-4e4c-b910-3d9350f18eff', '92bf01bf-5e05-45c7-bc92-fba403de63a2'];
const ROOMS = ['office', 'or', 'rocket', 'reef', 'command'];
const WORKS = ['T712yYY1swI', 'rjob47BbXrM', '2ebPYYMKopQ', '7qcJtWqngHs'];

// 一个页面：暂停里打开、等好，再录 sec 秒
const shot = (url, ready, sec, note) => [
  { pause: true },
  { go: url, wait: 6000 },
  { eval: run(ready), timeout: 200 },
  { resume: true },
  ...(note ? [{ note }] : []),
  { hold: sec },
];
const HUB = `await L.until(() => document.querySelector('img'), 20000); L.hideStats(); await L.sleep(800); return 1;`;
const DAY = `await L.until(() => document.querySelector('.dayv-tl'), 30000); scrollTo(0, 0); await L.sleep(800); return 1;`;
const ROOM = `await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000);
  for (let i = 0; i < 2400; i++) { const a = i / 200 * Math.PI * 2; window.dispatchEvent(new PointerEvent('pointermove', { clientX: innerWidth * (0.5 + 0.3 * Math.sin(a)), clientY: innerHeight * 0.5, bubbles: true })); await L.sleep(45); }
  return '3d ready';`;
// 3D 录的时候也让视角慢慢动（按 SLOW 倍录，后面加速回来）
const SWAY = sec => ({ eval: run(`const N = Math.round(${sec} * ${SLOW} * 22); for (let i = 0; i <= N; i++) { const a = i / N * Math.PI; window.dispatchEvent(new PointerEvent('pointermove', { clientX: innerWidth * (0.3 + 0.4 * i / N), clientY: innerHeight * (0.5 + 0.08 * Math.sin(a)), bubbles: true })); await L.sleep(45); } return 1;`), timeout: 60 });
const WORK = `await L.until(() => document.body.innerText.includes('任务书'), 20000); scrollTo(0, 0); await L.sleep(800); return 1;`;

export default [
  { pause: true },
  { go: `${BASE}/lab/gallery`, wait: 4000 },
  { local: LAB_LOCAL, wait: 3000 },
  // 一排不同行当的职人
  ...PEOPLE.flatMap((id, i) => shot(`${BASE}/lab/${id}`, HUB, 1.2, i === 0 ? 'become' : null)),
  // 几个岗位的一天
  ...DAYS.flatMap((id, i) => shot(`${BASE}/lab/${id}?m=teach`, DAY, i === 0 ? 2.5 : 1.4, i === 0 ? 'day' : null)),
  // 几个岗位的 3D 现场（按 SLOW 倍录）
  ...ROOMS.flatMap((k, i) => [...shot(`${BASE}/lab/beta/3d/${k}`, ROOM, 0, i === 0 ? 'room3d' : null), SWAY(i === 0 ? 2.5 : 1.6)]),
  { note: 'flash_end' },
  { hold: 1 },
];
