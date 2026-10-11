/**
 * 分镜：百花齐放——十五个职业，每个「亮相（行业 + 人物 + 空间）→ 操作」。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/lab-15.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080 --fps=15
 * 操作用「我教你」的示范脚本自己走（专家轨迹），录满 HOLD 秒后在 build.py 里按 lab-15.speed.json 压到 20–25 秒。
 * 3D 的空间（手术室 / 吧台 / 婴儿房 / 办公室 / 珊瑚礁）主页上晃一下鼠标就有景深；没 3D 的也晃，底图有视差。
 * 片头：封面 + /lab 宣传页一闪 + 体验馆列表滚动；片尾：体验馆列表缓缓滚动 + 字幕（end 页）。
 */
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SLOW = 1;

/** 顺序：手艺 / 办公桌 / 照护 / 现场交替，视觉节奏错开 */
export const PROS = [
  { k: 'or', name: '外科医生', space: '681b5f1c-5115-4c32-82ea-69c085b21868', ch: 'f0f8cd1b-7c16-4797-b58c-d4dfd1d3c4a7', hold: 40 },
  { k: 'latte', name: '咖啡师', space: '155db8f9-b0b3-4f08-a842-df1e94c381f4', ch: '6326d2ab-c9e3-47a3-a345-c7f6a307d381', hold: 60 },
  { k: 'desk', name: '数据分析师', space: 'a35a662d-2be8-4cc1-a255-4c3f8ad29139', ch: 'fb20ef8a-c94c-4eb4-b56b-8c4eb30984cf', hold: 52 },
  { k: 'yuesao', name: '月嫂', space: '19fd15d1-3787-4e65-a3a6-883a013ae59c', ch: '8e0a51ca-fe97-4568-8fd8-02651079faea', hold: 48 },
  { k: 'guji', name: '古籍修复师', space: '61f1f7fb-9b56-4e32-8a13-dac7c66fdddf', ch: '3653d14c-8b2e-43f0-bf9f-4d73addb3e9a', hold: 42 },
  { k: 'triage', name: '急诊护士', space: 'c9783880-561f-49fe-95ad-2a7b2de68d01', ch: '062fefff-f3dd-4970-b6a5-ddeb991d5a5d', hold: 80 },
  { k: 'chef', name: '中餐厨师', space: '09ae7c66-36fe-438a-9c79-656936babf3b', ch: '2332c8a7-49df-4bf0-8d1c-a8902d7aa5f5', hold: 42 },
  { k: 'audit', name: '审计师', space: 'fde330a0-5f71-4a1f-b843-5571339b09c9', ch: 'd9b2bce7-9b2f-4f05-b3b1-ee4079de5e98', hold: 60 },
  { k: 'dive', name: '潜导', space: '387fcc19-bd56-453e-a983-b3a1b4da5704', ch: 'ef6106e2-4a7a-4ec1-b074-e569c6794134', hold: 78 },
  { k: 'repair', name: '电气维修工', space: 'f9add4b9-8c79-40a7-ae8b-fd2b9eaad106', ch: 'f01d34d2-eba2-482b-b3d1-ebd61eb422f9', hold: 50 },
  { k: 'complaint', name: '客服主管', space: 'd1b7b17d-4aac-429c-9cca-23ca30cdb993', ch: 'db4e2224-a015-48cc-ac55-20378c95a3c7', hold: 32 },
  { k: 'garden', name: '园艺师', space: '15f91634-9244-4691-9d7d-7eb7c420f092', ch: '71161b2d-6a12-40dc-8780-1e5d7d64a403', hold: 50 },
  { k: 'live', name: '直播中控', space: '92bf01bf-5e05-45c7-bc92-fba403de63a2', ch: '08729212-a8a6-4dae-a3a5-977368202cc0', hold: 60 },
  { k: 'kinder', name: '幼儿园老师', space: 'dc121c80-d037-4838-8540-c01dd166ed52', ch: 'c7be10d1-d045-4198-ba8e-0029c1e6e28d', hold: 70 },
];

// 主页：晃鼠标看景深（3D 主页会跟着动；平面主页有视差）
const HUB_WIGGLE = run(`
  await L.until(() => document.querySelector('section.hub') || document.querySelector('.lab-hub') || document.body, 15000); await L.sleep(800);
  const hub = document.querySelector('section.hub') || document.body; const r = hub.getBoundingClientRect();
  for (let i = 0; i <= 70; i++) { const a = i / 70 * Math.PI * 2; const x = r.left + r.width * (0.5 + 0.38 * Math.sin(a)), y = r.top + Math.min(r.height, window.innerHeight) * (0.45 + 0.22 * Math.sin(a * 1.6));
    hub.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  return 'wiggle';`);
// 我教你：走一遍 → 走这一段 → 翻过对话和答题，停在工位上（示范自己开始走）
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
// 体验馆列表缓缓滚
const GALLERY_SCROLL = (secs) => run(`const n = Math.round(${secs} * 20); const total = document.body.scrollHeight - window.innerHeight; for (let i = 0; i <= n; i++) { window.scrollTo(0, total * i / n); await L.sleep(50); } return 'scrolled';`);

const scenes = [
  { go: `${BASE}/video/cover-15.html`, wait: 2500 },
  { note: 'cover' }, { hold: 3.5 },
  { go: `${BASE}/lab`, wait: 5000 },
  { local: { 'lab:visitor': 'v:showcase', 'lab:rookie': { name: '好大壮', note: '', location: '' }, 'lab:rookie:asked': '1' }, wait: 4000 },
  { note: 'landing' }, { hold: 3 },
  { go: `${BASE}/lab/gallery`, wait: 6000 },
  { note: 'gallery' }, { eval: GALLERY_SCROLL(7), timeout: 30 },
];
for (const p of PROS) {
  scenes.push(
    { go: `${BASE}/lab/${p.space}`, wait: 6000 },
    { note: `${p.k}_hub` }, { eval: HUB_WIGGLE, timeout: 30 },
    { go: `${BASE}/lab/${p.space}?m=teach&ch=${p.ch}`, wait: 5000 },
    { pause: true }, { eval: TO_BENCH, timeout: 120 }, { resume: true },
    { note: `${p.k}_bench` }, { hold: p.hold * SLOW },
  );
}
scenes.push(
  { go: `${BASE}/lab/gallery`, wait: 6000 },
  { note: 'gallery_end' }, { eval: GALLERY_SCROLL(12), timeout: 40 },
  { go: `${BASE}/video/end-15.html`, wait: 2500 },
  { note: 'end' }, { hold: 6 },
);
export default scenes;
