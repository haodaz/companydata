'use client';

/** 圆环占比图：进入视口后按顺序把每段画出来，右侧是图例与金额。 */
import React from 'react';
import { useInView } from './primitives';

export interface DonutItem { label: string; value: number; display?: string; color?: string }

const PALETTE = ['#6055f5', '#8b5cf6', '#0891b2', '#16a34a', '#d97706', '#64748b', '#94a3b8', '#c084fc'];

export function Donut({ items, size = 210, thickness = 30, centerTop, centerBottom }: {
  items: DonutItem[]; size?: number; thickness?: number; centerTop?: string; centerBottom?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;

  let acc = 0;
  const segs = items.map((it, i) => {
    const frac = it.value / total;
    const seg = { ...it, frac, offset: acc, color: it.color || PALETTE[i % PALETTE.length] };
    acc += frac;
    return seg;
  });

  return (
    <div ref={ref} style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--rp-line-soft)" strokeWidth={thickness} />
          {segs.map((s, i) => (
            <circle
              key={s.label}
              cx={c} cy={c} r={r} fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${inView ? s.frac * circ - 2 : 0} ${circ}`}
              strokeDashoffset={-s.offset * circ}
              strokeLinecap="butt"
              style={{ transition: `stroke-dasharray .9s cubic-bezier(.2,.7,.3,1) ${i * 110}ms` }}
            />
          ))}
        </svg>
        {(centerTop || centerBottom) && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
            {centerTop ? <div style={{ fontSize: 26, fontWeight: 730, letterSpacing: '-.02em', color: 'var(--rp-ink)' }}>{centerTop}</div> : null}
            {centerBottom ? <div style={{ fontSize: 12, color: 'var(--rp-ink3)', marginTop: 2 }}>{centerBottom}</div> : null}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 210 }}>
        {segs.map(s => (
          <div key={s.label} style={{
            display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 10, alignItems: 'center',
            padding: '7px 0', borderBottom: '1px solid var(--rp-line-soft)', fontSize: 13.5,
          }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
            <span style={{ color: 'var(--rp-ink2)' }}>{s.label}</span>
            <span style={{ fontWeight: 650, color: 'var(--rp-ink)', fontVariantNumeric: 'tabular-nums' }}>{s.display ?? s.value}</span>
            <span style={{ color: 'var(--rp-ink3)', fontVariantNumeric: 'tabular-nums', width: 44, textAlign: 'right' }}>
              {(s.frac * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
