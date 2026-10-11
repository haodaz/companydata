/**
 * 手部稳定层的模拟测试（没有摄像头也能验证）：npx tsx scripts/hand-filter-test.mts
 * 造一只假手：手腕、中指根决定手掌大小，拇指尖 / 食指尖的间距决定捏合程度，叠上高斯噪声模拟识别抖动。
 */
import { HandStabilizer, pinchRatio, type Lm } from '../src/lib/hand-filter';

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

/** cx, cy：手的位置（原始画面坐标）；palm：手掌大小；gap：拇指—食指间距 ÷ 手掌；noise：识别抖动 */
function hand(cx: number, cy: number, palm: number, gap: number, noise = 0): Lm[] {
  const lm: Lm[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  lm[0] = { x: cx, y: cy + palm, z: 0 };                 // 手腕
  lm[9] = { x: cx, y: cy, z: 0 };                        // 中指根
  lm[4] = { x: cx - gap * palm / 2, y: cy - palm * 0.3 }; // 拇指尖
  lm[8] = { x: cx + gap * palm / 2, y: cy - palm * 0.3 }; // 食指尖
  return lm.map(p => ({ x: p.x + gauss() * noise, y: p.y + gauss() * noise, z: 0 }));
}
const oldPinch = (lm: Lm[]) => Math.hypot(lm[8].x - lm[4].x, lm[8].y - lm[4].y) < 0.06;   // 原来的判断：画面绝对距离
const std = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
let fails = 0;
const check = (name: string, ok: boolean, detail: string) => { console.log(`${ok ? '✓' : '✗'} ${name}：${detail}`); if (!ok) fails++; };

// ① 远近不影响：同样「半捏」（间距 = 手掌 0.25），手大手小判断一致；原来的固定阈值会两样
{
  const far = hand(0.5, 0.5, 0.08, 0.25), near = hand(0.5, 0.5, 0.30, 0.25);
  const a = new HandStabilizer(), b = new HandStabilizer();
  const nf = a.update(far, 0)!.pinch, nn = b.update(near, 0)!.pinch;
  check('远近一致', nf === nn && nf === true, `新：远 ${nf} / 近 ${nn}；原来：远 ${oldPinch(far)} / 近 ${oldPinch(near)}`);
  const open = hand(0.5, 0.5, 0.08, 0.6);
  check('远处张开不算捏', !new HandStabilizer().update(open, 0)!.pinch && true, `原来会判成捏住：${oldPinch(open)}`);
}

// ② 门槛附近不来回闪：捏合程度在 0.30–0.50 之间抖 60 帧
{
  const s = new HandStabilizer(); let flipsNew = 0, flipsOld = 0, pn: boolean | null = null, po: boolean | null = null;
  s.update(hand(0.5, 0.5, 0.2, 0.1), 0);   // 先捏住
  for (let i = 1; i <= 60; i++) {
    const g = 0.4 + 0.1 * Math.sin(i * 1.7);
    const lm = hand(0.5, 0.5, 0.2, g, 0.002);
    const n = s.update(lm, i * 33)!.pinch, o = oldPinch(lm);
    if (pn !== null && n !== pn) flipsNew++; if (po !== null && o !== po) flipsOld++; pn = n; po = o;
  }
  check('不来回闪', flipsNew <= 1, `新 ${flipsNew} 次切换，原来 ${flipsOld} 次`);
}

// ③ 手不动时的抖动：识别噪声 σ = 0.006
{
  const s = new HandStabilizer(); const raw: number[] = [], out: number[] = [];
  for (let i = 0; i < 120; i++) { const lm = hand(0.5, 0.5, 0.2, 0.8, 0.006); raw.push(1 - (lm[4].x + lm[8].x) / 2); out.push(s.update(lm, i * 33)!.x); }
  const r = std(raw.slice(20)) / 0.7, o = std(out.slice(20));   // raw 换算到同一映射尺度
  check('静止不抖（至少减半）', o < r / 2, `抖动 原始 ${(r * 1000).toFixed(1)}‰ → 滤波后 ${(o * 1000).toFixed(1)}‰`);
}

// ④ 快速移动不拖：1 秒内从左划到右，看滤波后落后多少
{
  const s = new HandStabilizer(); let maxLag = 0;
  for (let i = 0; i <= 30; i++) {
    const cx = 0.25 + 0.5 * i / 30, lm = hand(cx, 0.5, 0.2, 0.8, 0.002);
    const want = Math.min(1, Math.max(0, (1 - cx - 0.15) / 0.7)), got = s.update(lm, i * 33)!.x;
    if (i > 5) maxLag = Math.max(maxLag, Math.abs(want - got));
  }
  check('快划不拖', maxLag < 0.08, `最大落后 ${(maxLag * 100).toFixed(1)}% 屏宽`);
}

// ⑤ 丢帧宽限：丢 100 毫秒照样握着；丢 400 毫秒才算松手
{
  const s = new HandStabilizer();
  s.update(hand(0.5, 0.5, 0.2, 0.1), 0);
  const a = s.update(null, 100), b = s.update(null, 400);
  check('丢帧宽限', !!a?.pinch && b === null, `丢 100ms：${a ? (a.pinch ? '还握着' : '松了') : '没了'}；丢 400ms：${b ? '还在' : '松手'}`);
}

// ⑥ 捏下去那一下位置不跳：间距从张开到捏住，看位置变化（原来取食指尖）
{
  const s = new HandStabilizer(); let jumpNew = 0, jumpOld = 0, ln = 0, lo = 0;
  for (let i = 0; i <= 10; i++) {
    const lm = hand(0.5, 0.5, 0.2, 0.8 - 0.07 * i);
    const n = s.update(lm, i * 33)!.x, o = 1 - lm[8].x;
    if (i) { jumpNew += Math.abs(n - ln); jumpOld += Math.abs(o - lo); } ln = n; lo = o;
  }
  check('捏下去不跳', jumpNew < jumpOld / 3, `位置漂移 新 ${(jumpNew * 100).toFixed(1)}% / 原来 ${(jumpOld * 100).toFixed(1)}%`);
}

console.log(fails ? `\n${fails} 项没过` : '\n全部通过');
process.exit(fails ? 1 : 0);
void pinchRatio;
