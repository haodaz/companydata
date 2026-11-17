'use client';

/** 翻护照：左右滑动 / 点箭头 / 键盘 ←→；上一页绕书脊转过去，底下露出新的一页。 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface BookPage { key: string; tab: string; color: string; sealed?: boolean; render: (go: (i: number) => void) => React.ReactNode }

export function Book({ pages, index, onIndex, keys = true, chrome = 200 }: { pages: BookPage[]; index: number; onIndex: (i: number) => void; keys?: boolean; chrome?: number }) {
  const [leaf, setLeaf] = useState<{ page: number; dir: 'fwd' | 'back'; to: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [quiet, setQuiet] = useState(false);   // 往回翻落定后，底下那页不再重放落章动画
  const start = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const chipsRef = useRef<HTMLDivElement>(null);
  const n = pages.length;

  const flip = useCallback((to: number) => {
    if (leaf || to < 0 || to >= n || to === index) return;
    if (to > index) { setQuiet(false); setLeaf({ page: index, dir: 'fwd', to }); onIndex(to); }
    else setLeaf({ page: to, dir: 'back', to });
  }, [leaf, n, index, onIndex]);
  const done = () => { if (leaf?.dir === 'back') { setQuiet(true); onIndex(leaf.to); } setLeaf(null); };

  useEffect(() => {
    if (!keys) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === 'ArrowRight') flip(index + 1);
      if (e.key === 'ArrowLeft') flip(index - 1);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [keys, flip, index]);

  // 目录条跟着当前页滚到可见
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);

  const onDown = (e: React.PointerEvent) => { if (e.button !== 0) return; suppress.current = false; start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }; };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current; if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { s.moved = true; try { (e.currentTarget as HTMLElement).setPointerCapture(s.id); } catch { /* ignore */ } }
    if (s.moved) setDrag(Math.max(-60, Math.min(60, dx * 0.35)));
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current; start.current = null; if (!s) return;
    const dx = e.clientX - s.x;
    if (s.moved) { suppress.current = true; setDrag(0); if (dx < -40) flip(index + 1); else if (dx > 40) flip(index - 1); }
  };
  const onClickCapture = (e: React.MouseEvent) => { if (suppress.current) { suppress.current = false; e.stopPropagation(); e.preventDefault(); } };

  return (
    <div className="tp-stage" style={{ ['--chrome' as string]: `${chrome}px` }}>
      <div className="tp-book">
        <div className="tp-book-in" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { start.current = null; setDrag(0); }} onClickCapture={onClickCapture}>
          <div className="tp-book-edge" />
          <div key={pages[index].key} className={`tp-base${quiet ? '' : ' tp-anim'}${drag ? ' drag' : ''}`} style={drag ? { transform: `translateX(${drag}px) rotateY(${-drag * 0.08}deg)` } : undefined}>
            {pages[index].render(flip)}
          </div>
          {leaf && (
            <div key={`leaf-${leaf.page}-${leaf.dir}`} className={`tp-leaf ${leaf.dir}`} onAnimationEnd={e => { if (e.target === e.currentTarget) done(); }}>
              {pages[leaf.page].render(flip)}
            </div>
          )}
        </div>
      </div>
      <div className="tp-nav">
        <button type="button" className="tp-arrow" aria-label="上一页" disabled={index === 0} onClick={() => flip(index - 1)}>‹</button>
        <div className="tp-pgno"><b>{pages[index].tab}</b> · {index + 1} / {n}</div>
        <button type="button" className="tp-arrow" aria-label="下一页" disabled={index === n - 1} onClick={() => flip(index + 1)}>›</button>
      </div>
      <div className="tp-chips" ref={chipsRef}>
        {pages.map((p, i) => (
          <button type="button" key={p.key} data-i={i} className={`${i === index ? 'on' : ''}${p.sealed ? ' sealed' : ''}`} style={{ ['--c' as string]: p.color }} onClick={() => flip(i)}>
            {p.sealed ? <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden><rect x="1" y="5" width="9" height="6.5" rx="1.4" fill="currentColor" /><path d="M3 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg> : <i />}{p.tab}
          </button>
        ))}
      </div>
    </div>
  );
}
