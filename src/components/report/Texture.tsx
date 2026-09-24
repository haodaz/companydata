/**
 * 报告页 banner 的矢量纹理：
 * SVG 现画，透明底、可随主题着色，只铺在 banner 背后（章节插画走生成的位图）。
 */
import React from 'react';

/** 「数据编织」纹理：网格点 + 斜向织线 + 星座式节点，铺在 banner 背后 */
export function WeaveTexture({ id = 'weave', opacity = 1 }: { id?: string; opacity?: number }) {
  // 规则网格 + 确定性抖动：密而细，读起来是「纹理」而不是「插图」
  const COLS = 11, ROWS = 6, W = 1440, H = 620;
  const jitter = (i: number, k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const nodes: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      nodes.push([
        (c + 0.5) * (W / COLS) + (jitter(i, 1) - 0.5) * 52,
        (r + 0.5) * (H / ROWS) + (jitter(i, 2) - 0.5) * 44,
      ]);
    }
  }
  const links: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (c < COLS - 1 && jitter(i, 3) > 0.22) links.push([i, i + 1]);
      if (r < ROWS - 1 && jitter(i, 4) > 0.38) links.push([i, i + COLS]);
      if (c < COLS - 1 && r < ROWS - 1 && jitter(i, 5) > 0.76) links.push([i, i + COLS + 1]);
    }
  }

  return (
    <svg className="rp-texture" viewBox="0 0 1440 620" preserveAspectRatio="xMidYMid slice" aria-hidden style={{ opacity }}>
      <defs>
        <pattern id={`${id}-dots`} width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1.3" cy="1.3" r="1.3" fill="currentColor" opacity=".13" />
        </pattern>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6055f5" />
          <stop offset="55%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#f5b942" />
        </linearGradient>
        <radialGradient id={`${id}-fade`} cx="50%" cy="42%" r="72%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="62%" stopColor="#fff" stopOpacity=".55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <rect width="1440" height="620" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>

      <g mask={`url(#${id}-mask)`} color="#6055f5">
        <rect width="1440" height="620" fill={`url(#${id}-dots)`} />
        <g stroke={`url(#${id}-line)`} strokeWidth="0.7" fill="none" opacity=".18">
          {links.map(([a, b], i) => (
            <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />
          ))}
        </g>
        <g fill={`url(#${id}-line)`}>
          {nodes.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 9 === 0 ? 2.8 : i % 4 === 0 ? 2 : 1.4} opacity={i % 9 === 0 ? 0.42 : 0.24}>
              <animate attributeName="opacity"
                values={`${i % 9 === 0 ? 0.42 : 0.24};${i % 9 === 0 ? 0.14 : 0.08};${i % 9 === 0 ? 0.42 : 0.24}`}
                dur={`${6 + (i % 9)}s`} repeatCount="indefinite" begin={`${(i % 13) * 0.35}s`} />
            </circle>
          ))}
        </g>
      </g>
    </svg>
  );
}
