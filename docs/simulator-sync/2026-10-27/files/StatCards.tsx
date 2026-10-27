'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Skeleton } from 'antd';
import { BRAND } from '@/lib/theme';

/** 数字从 0 滚动到目标值 */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{shown.toLocaleString('zh-CN')}</>;
}

export interface StatItem {
  label: string;
  value: number | string | null | undefined;
  icon?: React.ReactNode;
  color?: string;
  hint?: React.ReactNode;
}

/** 页面顶部的一排统计卡片 */
export function StatCards({ items, loading }: { items: StatItem[]; loading?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`,
      gap: 12, marginBottom: 16,
    }}>
      {items.map(item => {
        const color = item.color || BRAND.primary;
        return (
          <div key={item.label} style={{
            background: BRAND.surface, borderRadius: BRAND.radiusLg,
            border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            {item.icon && (
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, ${color} 10%, white)`, color, fontSize: 17,
              }}>
                {item.icon}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: BRAND.ink3, marginBottom: 2 }}>{item.label}</div>
              {loading ? (
                <Skeleton.Button active size="small" style={{ width: 56, height: 22 }} />
              ) : (
                <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.ink, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                  {typeof item.value === 'number' ? <CountUp value={item.value} /> : (item.value ?? '—')}
                </div>
              )}
              {item.hint && <div style={{ fontSize: 11, color: BRAND.ink4, marginTop: 2 }}>{item.hint}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
