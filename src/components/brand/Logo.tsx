/**
 * 「智能企业数据工厂」品牌标识：锯齿屋顶厂房（工厂）+ 厂房里递增的数据柱（数据）+ 金色四角星（智能）。
 * 与 src/app/icon.svg（网站图标）保持同一造型。
 */
import React from 'react';

export const BRAND_NAME = '智能企业数据工厂';
export const BRAND_TAGLINE = '企业 · 校招 · 实习';

export function Logo({ size = 40, animated = false, style }: { size?: number; animated?: boolean; style?: React.CSSProperties }) {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block', flexShrink: 0, ...style }} aria-label={BRAND_NAME}>
      <defs>
        <linearGradient id={`lg-bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7b6dff" />
          <stop offset="100%" stopColor="#4c41d9" />
        </linearGradient>
      </defs>
      {animated && (
        <style>{`
          @keyframes lg-spark-${uid} { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.72); opacity: 0.7; } }
          .lg-spark-${uid} { transform-box: fill-box; transform-origin: center; animation: lg-spark-${uid} 2.4s ease-in-out infinite; }
        `}</style>
      )}
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#lg-bg-${uid})`} />
      {/* 厂房：锯齿屋顶 */}
      <path d="M12 50 V31 L23 23 V31 L34 23 V31 L45 23 V50 Z" fill="#fff" fillOpacity="0.14" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      {/* 数据柱 */}
      <g fill="#fff">
        <rect x="17.5" y="41" width="5" height="6.5" rx="1.5" />
        <rect x="26" y="37" width="5" height="10.5" rx="1.5" />
        <rect x="34.5" y="33" width="5" height="14.5" rx="1.5" />
      </g>
      {/* 智能：四角星 */}
      <g className={animated ? `lg-spark-${uid}` : undefined}>
        <path d="M50 8 L52.4 15.6 L60 18 L52.4 20.4 L50 28 L47.6 20.4 L40 18 L47.6 15.6 Z" fill="#ffc53d" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
