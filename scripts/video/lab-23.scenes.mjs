/**
 * 分镜：百业长版（第二批之后）——按一产 → 二产 → 三产 → 应急的顺序，每个职业「亮相（行业 + 人物 + 空间）→ 操作」。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/lab-23.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080 --fps=15
 * 要登录的页没有；3D 主页（手术室 / 吧台 / 婴儿房 / 办公室 / 珊瑚礁 / 火箭发动机段）晃鼠标出景深。
 * 用户 2026-10-11 定：9–10 分钟全量版，每段 20–25 秒，旁白开头点明一二三产 / 应急。
 */
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SLOW = 1;

export const PROS = [
  // 一产
  { k: 'greenhouse', name: '温室管理员', space: '7dd9393d-992c-4c50-afd8-0af8f2352add', ch: 'e87d082f-bd1b-4d21-ab8e-d58f1f2d0313', hold: 70 },
  // 二产
  { k: 'converter', name: '转炉炼钢操作工', space: '71a6cbf5-1977-4139-8299-1f66b83f9e03', ch: 'a15c896f-7e5b-45f4-95f0-a245f57e5767', hold: 240 },
  { k: 'foundry', name: '精铸熔炼工程师', space: 'd9daaaf1-3c87-4679-8c09-92b75a070b41', ch: '29dcc92a-5e95-4dce-8300-fdfc787f2177', hold: 60 },
  { k: 'paving', name: '沥青摊铺施工员', space: '0cfe3233-acd9-4e4c-b910-3d9350f18eff', ch: 'a033f8d2-0df8-440c-a9b9-529b28beeeeb', hold: 200 },
  { k: 'switching', name: '变电站运维值班员', space: 'd571b482-4f94-488a-ba21-224b099a32b9', ch: 'af6ae903-c073-467c-bf4c-6ffd46f06c1c', hold: 42 },
  { k: 'cad', name: '机械设计工程师', space: '065fd7f4-67e9-4e1a-a7c9-61de38a3b09c', ch: '8a8d51f6-d9c2-4c30-ad1f-bc81cbe15bce', hold: 68 },
  { k: 'chip', name: '数字芯片设计工程师', space: '392bcbeb-3cd9-43ae-8645-d5268ecfb465', ch: 'e52656a3-5452-4e07-b105-2a845ef77e7c', hold: 64 },
  { k: 'rocket', name: '火箭总装工程师', space: '640f3bc6-6ce1-4c32-82dd-6491344ab86f', ch: '1ebe2edd-dd97-44de-bbc0-9be974ac215d', hold: 58 },
  // 三产
  { k: 'latte', name: '咖啡师', space: '155db8f9-b0b3-4f08-a842-df1e94c381f4', ch: '6326d2ab-c9e3-47a3-a345-c7f6a307d381', hold: 60 },
  { k: 'chef', name: '中餐厨师', space: '09ae7c66-36fe-438a-9c79-656936babf3b', ch: '2332c8a7-49df-4bf0-8d1c-a8902d7aa5f5', hold: 42 },
  { k: 'yuesao', name: '月嫂', space: '19fd15d1-3787-4e65-a3a6-883a013ae59c', ch: '8e0a51ca-fe97-4568-8fd8-02651079faea', hold: 48 },
  { k: 'kinder', name: '幼儿园老师', space: 'dc121c80-d037-4838-8540-c01dd166ed52', ch: 'c7be10d1-d045-4198-ba8e-0029c1e6e28d', hold: 70 },
  { k: 'complaint', name: '客服主管', space: 'd1b7b17d-4aac-429c-9cca-23ca30cdb993', ch: 'db4e2224-a015-48cc-ac55-20378c95a3c7', hold: 32 },
  { k: 'live', name: '直播中控', space: '92bf01bf-5e05-45c7-bc92-fba403de63a2', ch: '08729212-a8a6-4dae-a3a5-977368202cc0', hold: 60 },
  { k: 'audit', name: '审计助理', space: 'fde330a0-5f71-4a1f-b843-5571339b09c9', ch: 'd9b2bce7-9b2f-4f05-b3b1-ee4079de5e98', hold: 60 },
  { k: 'desk', name: '数据分析师', space: 'a35a662d-2be8-4cc1-a255-4c3f8ad29139', ch: 'fb20ef8a-c94c-4eb4-b56b-8c4eb30984cf', hold: 52 },
  { k: 'guji', name: '古籍修复师', space: '61f1f7fb-9b56-4e32-8a13-dac7c66fdddf', ch: '3653d14c-8b2e-43f0-bf9f-4d73addb3e9a', hold: 42 },
  { k: 'garden', name: '园艺师', space: '15f91634-9244-4691-9d7d-7eb7c420f092', ch: '71161b2d-6a12-40dc-8780-1e5d7d64a403', hold: 50 },
  { k: 'dive', name: '潜水教练', space: '387fcc19-bd56-453e-a983-b3a1b4da5704', ch: 'ef6106e2-4a7a-4ec1-b074-e569c6794134', hold: 78 },
  { k: 'triage', name: '急诊护士', space: 'c9783880-561f-49fe-95ad-2a7b2de68d01', ch: '062fefff-f3dd-4970-b6a5-ddeb991d5a5d', hold: 80 },
  { k: 'or', name: '外科医生', space: '681b5f1c-5115-4c32-82ea-69c085b21868', ch: 'f0f8cd1b-7c16-4797-b58c-d4dfd1d3c4a7', hold: 40 },
  // 应急
  { k: 'sandtable', name: '应急指挥调度员', space: 'adcf442a-fe29-4f82-9bd0-4a82f82f72fc', ch: 'a903cc03-2378-4000-b78b-cc5e4c9073b7', hold: 160 },
  // 河堤一线（levee）用户觉得堆砌、没手感，这版先不录
];

const HUB_WIGGLE = run(`
  await L.until(() => document.querySelector('section.hub') || document.querySelector('.lab-hub') || document.body, 15000); await L.sleep(800);
  const hub = document.querySelector('section.hub') || document.body; const r = hub.getBoundingClientRect();
  for (let i = 0; i <= 70; i++) { const a = i / 70 * Math.PI * 2; const x = r.left + r.width * (0.5 + 0.38 * Math.sin(a)), y = r.top + Math.min(r.height, window.innerHeight) * (0.45 + 0.22 * Math.sin(a * 1.6));
    hub.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'wiggle';`);
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
const GALLERY_SCROLL = (secs, px = 480) => run(`
  const first = [...document.querySelectorAll('button')].find(b => /开始体验/.test(b.innerText));
  const card = first ? (first.closest('article') || first.parentElement?.parentElement || first) : null;
  const y0 = card ? card.getBoundingClientRect().top + window.scrollY - 24 : 160;
  const n = Math.round(${secs} * 20); for (let i = 0; i <= n; i++) { window.scrollTo(0, y0 + ${px} * i / n); await L.sleep(50); } return 'scrolled';`);
// 火箭主页：走进 3D 发动机段看一圈（有入口就点，没有就只晃主页）
const ROCKET_3D = run(`
  const b = [...document.querySelectorAll('a, button')].find(x => /走进|3D/.test(x.innerText)); if (!b) return 'no 3d';
  b.click(); await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); await L.sleep(3000);
  const W = window.innerWidth, H = window.innerHeight, N = 150;
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + 0.42 * Math.sin(a)), y = H * (0.5 + 0.22 * Math.sin(a * 2));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return '3d';`);

const scenes = [
  { go: `${BASE}/video/cover-15.html?sub=${encodeURIComponent('来百业：从千行百业沉浸大千世界')}`, wait: 2500 },
  { note: 'cover' }, { hold: 3.5 },
  { go: `${BASE}/lab`, wait: 5000 },
  { local: { 'lab:visitor': 'v:showcase', 'lab:rookie': { name: '好大壮', note: '', location: '' }, 'lab:rookie:asked': '1' }, wait: 4000 },
  { note: 'landing' }, { hold: 3 },
  { go: `${BASE}/lab/gallery`, wait: 6000 },
  { note: 'gallery' }, { eval: GALLERY_SCROLL(8), timeout: 30 },
];
for (const p of PROS) {
  if (!p.noHub) {
    scenes.push({ go: `${BASE}/lab/${p.space}`, wait: 6000 }, { note: `${p.k}_hub` }, { eval: HUB_WIGGLE, timeout: 30 });
    if (p.k === 'rocket') scenes.push({ eval: ROCKET_3D, timeout: 120 });
  } else {
    scenes.push({ go: `${BASE}/lab/${p.space}?m=teach`, wait: 5000 }, { note: `${p.k}_hub` }, { hold: 3 });
  }
  scenes.push(
    { go: `${BASE}/lab/${p.space}?m=teach&ch=${p.ch}`, wait: 5000 },
    { pause: true }, { eval: TO_BENCH, timeout: 120 }, { resume: true },
    { note: `${p.k}_bench` }, { hold: p.hold * SLOW },
  );
}
scenes.push(
  { go: `${BASE}/video/end-15.html`, wait: 3000 },
  { note: 'end' }, { hold: 13 },
);
export default scenes;
