'use client';

/**
 * 母版 E（hands）的主体插件 latte-cup：俯视的咖啡杯 + 按实际落点堆出来的奶泡图案。登记在 HandsStage 的 SUBJECTS。
 * 画法和沉积规则是从 BenchRunner 的 cup 层 / drop() 原样搬出来的（CupView、depositFoam），代码版以后也可以改成从这里 import。
 *   每个落点：level（0–1，配置里 track.mark 表达式在落下那一刻的值）< 0.02 不留白（高位细流，奶沉到咖啡下面）；
 *   否则留一个半径 11 + level × 100 的白斑，并把附近已经有的白斑顺着走向往前推——「晃出一个圆再往前推，圆就成了心」。
 * params：r 杯口半径（默认 240）；落点来自 subjects[].trail 指的那个轨迹手势。
 */
import React, { useRef } from 'react';
import type { HandsSubjectProps, TrailPt } from '@/components/lab/masters/HandsStage';

export interface FoamDeposit { x: number; y: number; r: number; a: number }

/** 白斑最多这么多（和代码版一样，超过就不再长） */
export const FOAM_MAX = 520;

/** 落下一个点（prev = 上一个记下的落点，不管它留没留白）。和 BenchRunner.drop 间隔检查之后的部分一致 */
export function depositFoam(list: FoamDeposit[], prev: { x: number; y: number } | null, px: number, py: number, level: number) {
  if (list.length > FOAM_MAX) return;
  const moved = prev ? Math.hypot(px - prev.x, py - prev.y) : 99;
  const lv = Math.min(1, Math.max(0, level));
  if (lv < 0.02) return;
  const r = 11 + lv * 100;
  // 奶流还会把液面上已经有的图案往前推，越近推得越多
  if (prev && moved < 220) {
    const ux = (px - prev.x) / moved, uy = (py - prev.y) / moved;
    const reach = r * 2.4, force = Math.min(moved, 26) * lv * 0.95;
    for (const d of list) {
      const dd = Math.hypot(d.x - px, d.y - py);
      if (dd < reach) { const f = (1 - dd / reach) * force; d.x += ux * f; d.y += uy * f; }
    }
  }
  list.push({ x: px, y: py, r, a: prev ? Math.atan2(py - prev.y, px - prev.x) * 180 / Math.PI : 0 });
}

/** 咖啡杯俯视：crema 底色 + 奶泡（后落的盖在先落的上面，郁金香的层次就是这么来的）。用到场景 svg 里的 bench-blur / latte-soft 滤镜 */
export function CupView({ id, cx, cy, r, deposits }: { id: string; cx: number; cy: number; r: number; deposits: FoamDeposit[] }) {
  return (
    <g pointerEvents="none">
      <defs>
        <radialGradient id={`crema-${id}`} cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#c08a52" /><stop offset="48%" stopColor="#92602f" /><stop offset="100%" stopColor="#4e2d14" />
        </radialGradient>
        <clipPath id={`cupclip-${id}`}><circle cx={cx} cy={cy} r={r * 0.97} /></clipPath>
      </defs>
      <ellipse cx={cx} cy={cy + r * 0.12} rx={r * 1.2} ry={r * 1.2} fill="rgba(0,0,0,.45)" filter="url(#bench-blur)" />
      <circle cx={cx} cy={cy} r={r * 1.14} fill="#f2efe8" stroke="rgba(60,45,30,.35)" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={r * 1.05} fill="#ded9cf" />
      <circle cx={cx} cy={cy} r={r} fill={`url(#crema-${id})`} />
      <g clipPath={`url(#cupclip-${id})`} filter="url(#latte-soft)">
        {deposits.map((p, i) => <ellipse key={i} cx={p.x} cy={p.y} rx={p.r * 1.18} ry={p.r * 0.84} transform={`rotate(${p.a} ${p.x} ${p.y})`} fill="#fffaf0" opacity={0.96} />)}
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(40,25,12,.45)" strokeWidth={4} />
      <circle cx={cx} cy={cy} r={r * 1.1} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={5} />
    </g>
  );
}

/** 落点列表 → 白斑：只处理新加的（列表换了 / 变短了就从头算） */
export function LatteCupSubject({ x, y, P, trail, uid }: HandsSubjectProps) {
  const memo = useRef<{ src?: TrailPt[]; n: number; deps: FoamDeposit[] }>({ n: 0, deps: [] });
  const tr = trail || [];
  const m = memo.current;
  if (m.src !== tr || tr.length < m.n) { m.src = tr; m.n = 0; m.deps = []; }
  for (; m.n < tr.length; m.n++) { const p = tr[m.n]; depositFoam(m.deps, m.n ? tr[m.n - 1] : null, p.x, p.y, p.v); }
  return <CupView id={uid} cx={x} cy={y} r={P('r', 240)} deposits={m.deps} />;
}
