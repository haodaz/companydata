/**
 * 摄像头手部追踪的稳定层（2026-10-11 优化「手部识别、拿道具的精度」）：
 *   - OneEuro 滤波：手慢时多平滑（不抖），手快时少平滑（不拖）
 *   - 捏合按手掌大小折算（离摄像头远近不影响），进 / 出两个门槛 + 松开要连续几帧（不在门槛上来回闪）
 *   - 位置取拇指尖和食指尖的中点（捏合那一下指尖会缩，取指尖会让手柄被拽偏）
 *   - 画面中间一圈映射到整个场景（手不用伸到画面边上，边上最容易识别丢）
 *   - 识别丢一两帧不当松手（宽限 0.2 秒）
 *   - 2026-10-28 第三轮：握着走用「手掌点」（手腕 + 食指根 + 中指根 + 小指根的平均）算位移——捏住后手指还在收，
 *     指尖中点会跟着漂，工具一拿起就被拽偏；手掌在捏的时候几乎不动。手掌大小取长、宽里稳的那个（手侧过去时长度会被压短）
 * 纯函数 / 小状态机，不碰 DOM，脚本里能直接喂模拟数据测（scripts/hand-filter-test.mts）。
 */

export interface Lm { x: number; y: number; z?: number }

/** OneEuro 滤波（Casiez 2012）：minCutoff 越小越稳，beta 越大跟手越快 */
export class OneEuro {
  private x: number | null = null; private dx = 0; private t: number | null = null;
  constructor(private minCutoff = 1.2, private beta = 0.02, private dCutoff = 1.0) {}
  private alpha(cutoff: number, dt: number) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(v: number, tMs: number): number {
    if (this.x === null || this.t === null) { this.x = v; this.t = tMs; return v; }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000); this.t = tMs;
    const dv = (v - this.x) / dt;
    this.dx += this.alpha(this.dCutoff, dt) * (dv - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += this.alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
  reset() { this.x = null; this.t = null; this.dx = 0; }
}

const dist = (a: Lm, b: Lm) => Math.hypot(a.x - b.x, a.y - b.y, ((a.z || 0) - (b.z || 0)) * 0.5);
/** 手掌大小：手腕到中指根的长度，和食指根到小指根的宽度（×1.45 折成长度）取大的——手侧过去或前后倾时，总有一个不被压短 */
export function palmSize(lm: Lm[]): number {
  const len = dist(lm[0], lm[9]), wid = lm[5] && lm[17] ? dist(lm[5], lm[17]) * 1.45 : 0;
  return Math.max(len, wid) || 1e-3;
}
/** 捏合程度：拇指尖–食指尖距离 ÷ 手掌大小。0 = 贴住，~1 = 张开 */
export function pinchRatio(lm: Lm[]): number {
  return dist(lm[4], lm[8]) / palmSize(lm);
}
/** 手掌点：手腕 + 食指根 + 中指根 + 小指根的平均（捏合时几乎不动），原始画面坐标 */
export function palmPoint(lm: Lm[]): { x: number; y: number } {
  const ids = [0, 5, 9, 17].filter(i => lm[i]);
  return { x: ids.reduce((s, i) => s + lm[i].x, 0) / ids.length, y: ids.reduce((s, i) => s + lm[i].y, 0) / ids.length };
}

/** 画面中间一圈（margin 是四周各留多少）映射到 0–1，超出的夹在边上 */
export function reachMap(v: number, margin = 0.15): number {
  return Math.min(1, Math.max(0, (v - margin) / (1 - 2 * margin)));
}

/** x / y：指尖中点（悬停、指东西用）；gx / gy：手掌点（握着走时算位移用），都已镜像、映射到 0–1 */
export interface StablePose { x: number; y: number; gx: number; gy: number; pinch: boolean; ratio: number; lost: boolean }

export class HandStabilizer {
  // 参数用模拟数据调过：识别噪声 8.6‰ → 3.4‰，1 秒划过大半屏只落后 1.9%（scripts/hand-filter-test.mts）
  private fx = new OneEuro(0.5, 6); private fy = new OneEuro(0.5, 6);
  private gxf = new OneEuro(0.5, 6); private gyf = new OneEuro(0.5, 6);
  private pinched = false; private releaseFrames = 0; private lastSeen = -1;
  private last: StablePose | null = null;
  constructor(private o = { enter: 0.32, exit: 0.48, releaseAfter: 3, graceMs: 200, margin: 0.15 }) {}

  /** 喂一帧：lm 是 MediaPipe 21 个关节（原始坐标，未镜像），没识别到手传 null。返回已镜像、映射到 0–1 场景坐标的稳定姿态 */
  update(lm: Lm[] | null, tMs: number): StablePose | null {
    if (!lm) {
      // 宽限：丢一两帧照旧，超时才算手离开
      if (this.last && this.lastSeen >= 0 && tMs - this.lastSeen <= this.o.graceMs) return { ...this.last, lost: true };
      this.fx.reset(); this.fy.reset(); this.gxf.reset(); this.gyf.reset(); this.pinched = false; this.releaseFrames = 0; this.last = null;
      return null;
    }
    this.lastSeen = tMs;
    const r = pinchRatio(lm);
    if (!this.pinched && r < this.o.enter) { this.pinched = true; this.releaseFrames = 0; }
    else if (this.pinched) {
      if (r > this.o.exit) { if (++this.releaseFrames >= this.o.releaseAfter) { this.pinched = false; this.releaseFrames = 0; } }
      else this.releaseFrames = 0;
    }
    // 拇指尖和食指尖的中点；画面是自拍镜像，x 取反
    const mx = 1 - (lm[4].x + lm[8].x) / 2, my = (lm[4].y + lm[8].y) / 2;
    const x = this.fx.filter(reachMap(mx, this.o.margin), tMs), y = this.fy.filter(reachMap(my, this.o.margin), tMs);
    const pp = palmPoint(lm);
    const gx = this.gxf.filter(reachMap(1 - pp.x, this.o.margin), tMs), gy = this.gyf.filter(reachMap(pp.y, this.o.margin), tMs);
    this.last = { x, y, gx, gy, pinch: this.pinched, ratio: r, lost: false };
    return this.last;
  }
}
