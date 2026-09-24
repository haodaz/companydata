'use client';

/**
 * 实例走马灯：每个实例独占一幅舞台，左右切换。
 * 支持方向键、触摸滑动、自动轮播（鼠标移入或手动操作后停止）。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface Slide {
  key: string;
  kicker: string;
  title: string;
  body: React.ReactNode;
}

export function CaseCarousel({ slides, autoplayMs = 11000 }: { slides: Slide[]; autoplayMs?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = slides.length;

  const go = useCallback((next: number, manual = false) => {
    setI(((next % n) + n) % n);
    if (manual) setPaused(true);
  }, [n]);

  useEffect(() => {
    if (paused || autoplayMs <= 0) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setI(v => (v + 1) % n), autoplayMs);
    return () => clearTimeout(t);
  }, [i, paused, n, autoplayMs]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1, true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1, true); }
  };

  return (
    <div
      className="rp-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={onKey}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="真实实例"
    >
      <div className="rp-carousel-head">
        <div className="rp-carousel-tabs">
          {slides.map((s, idx) => (
            <button
              key={s.key}
              className={`rp-carousel-tab ${idx === i ? 'on' : ''}`}
              onClick={() => go(idx, true)}
              aria-current={idx === i}
            >
              <span className="rp-carousel-tab-n">{String(idx + 1).padStart(2, '0')}</span>
              {s.kicker}
            </button>
          ))}
        </div>
        <div className="rp-carousel-arrows">
          <button onClick={() => go(i - 1, true)} aria-label="上一个实例">‹</button>
          <span className="rp-carousel-count">{i + 1} / {n}</span>
          <button onClick={() => go(i + 1, true)} aria-label="下一个实例">›</button>
        </div>
      </div>

      <div
        className="rp-carousel-viewport"
        onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          if (!touch.current) return;
          const dx = e.changedTouches[0].clientX - touch.current.x;
          const dy = e.changedTouches[0].clientY - touch.current.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) go(i + (dx < 0 ? 1 : -1), true);
          touch.current = null;
        }}
      >
        <div className="rp-carousel-track" style={{ transform: `translate3d(-${i * 100}%, 0, 0)` }}>
          {slides.map((s, idx) => (
            <div className="rp-carousel-slide" key={s.key} aria-hidden={idx !== i}>
              <div className="rp-carousel-stage">
                <div className="rp-carousel-kicker">{s.kicker}</div>
                <h3 className="rp-carousel-title">{s.title}</h3>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rp-carousel-progress" aria-hidden>
        {slides.map((s, idx) => (
          <span key={s.key} className={idx === i ? 'on' : ''} onClick={() => go(idx, true)} />
        ))}
      </div>
    </div>
  );
}
