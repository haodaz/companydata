'use client';

/**
 * 界面截图画廊：缩略图点开全屏查看，带逐条说明、要点列表与左右切换。
 * 全屏里点图片可在「适应窗口 / 原始尺寸」之间切换，方便看清字段细节。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Reveal } from './primitives';

export interface ShotItem {
  src: string;
  url: string;
  title: string;
  caption: string;
  points?: string[];
}

export function ShotGallery({ items }: { items: ShotItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);

  const close = useCallback(() => { setOpen(null); setZoom(false); }, []);
  const move = useCallback((d: number) => {
    setOpen(v => (v === null ? v : (v + d + items.length) % items.length));
    setZoom(false);
  }, [items.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowLeft') move(-1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, close, move]);

  const cur = open === null ? null : items[open];

  return (
    <>
      <div className="rp-grid rp-grid-2">
        {items.map((it, i) => (
          <Reveal key={it.src} delay={(i % 2) * 80}>
            <figure style={{ margin: 0 }}>
              <button className="rp-shot rp-shot-btn" onClick={() => setOpen(i)} aria-label={`放大查看：${it.title}`}>
                <span className="rp-shot-bar">
                  <i className="rp-shot-dot" style={{ background: '#ff5f57' }} />
                  <i className="rp-shot-dot" style={{ background: '#febc2e' }} />
                  <i className="rp-shot-dot" style={{ background: '#28c840' }} />
                  <span className="rp-shot-url">{it.url}</span>
                  <span className="rp-shot-zoom">点击放大</span>
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.src} alt={it.title} loading="lazy" />
              </button>
              <figcaption className="rp-shot-cap">
                <b style={{ color: 'var(--rp-ink)' }}>{it.title}</b>　{it.caption}
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>

      {cur && (
        <div className="rp-lightbox" onClick={close} role="dialog" aria-modal="true" aria-label={cur.title}>
          <div className="rp-lightbox-top" onClick={e => e.stopPropagation()}>
            <div>
              <div className="rp-lightbox-title">{cur.title}</div>
              <div className="rp-lightbox-url">{cur.url}</div>
            </div>
            <div className="rp-lightbox-tools">
              <span className="rp-lightbox-count">{(open ?? 0) + 1} / {items.length}</span>
              <button onClick={() => setZoom(z => !z)}>{zoom ? '适应窗口' : '原始尺寸'}</button>
              <button onClick={close} aria-label="关闭">✕</button>
            </div>
          </div>

          <button className="rp-lightbox-arrow left" onClick={e => { e.stopPropagation(); move(-1); }} aria-label="上一张">‹</button>
          <button className="rp-lightbox-arrow right" onClick={e => { e.stopPropagation(); move(1); }} aria-label="下一张">›</button>

          <div className={`rp-lightbox-body ${zoom ? 'zoom' : ''}`} onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cur.src} alt={cur.title} onClick={() => setZoom(z => !z)} />
          </div>

          <div className="rp-lightbox-foot" onClick={e => e.stopPropagation()}>
            <p>{cur.caption}</p>
            {cur.points?.length ? (
              <ul>
                {cur.points.map(pt => <li key={pt}>{pt}</li>)}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
