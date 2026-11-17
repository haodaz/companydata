'use client';

/**
 * 翻护照：纸页跟着手指绕书脊转，松手过半就翻过去、不过半就弹回；也能点箭头 / 键盘 ←→。
 * immersive：沉浸模式（分享出去的那本）——深色桌面、书放大占满屏、只留一条很淡的页码条。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface BookPage { key: string; tab: string; color: string; sealed?: boolean; render: (go: (i: number) => void) => React.ReactNode }

const END = -100;   // 翻过去的角度：过了 -90° 背面朝人，backface 隐藏后自然消失
const EASE = 'cubic-bezier(.3, .1, .25, 1)';
type Turn = { dir: 'fwd' | 'back'; leaf: number; base: number; target: number; angle: number; anim: boolean; commit: boolean };

export function Book({ pages, index, onIndex, keys = true, chrome = 200, immersive = false }: { pages: BookPage[]; index: number; onIndex: (i: number) => void; keys?: boolean; chrome?: number; immersive?: boolean }) {
  const [turn, setTurn] = useState<Turn | null>(null);
  const [quiet, setQuiet] = useState(false);   // 底下那页要不要重放落章动画（往回翻 / 弹回时不重放）
  const [rub, setRub] = useState(0);           // 第一页 / 最后一页再拖：橡皮筋
  const turnRef = useRef<Turn | null>(null);
  const start = useRef<{ x: number; y: number; id: number; moved: boolean; t: number } | null>(null);
  const suppress = useRef(false);
  const inRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const n = pages.length;

  const put = useCallback((t: Turn | null) => { turnRef.current = t; setTurn(t); }, []);

  const finish = useCallback(() => {
    const t = turnRef.current; if (!t || !t.anim) return;
    setQuiet(t.commit ? t.dir === 'back' : true);
    if (t.commit) onIndex(t.target);
    put(null);
  }, [onIndex, put]);

  const begin = useCallback((t: Turn) => { if (t.dir === 'fwd') setQuiet(false); put(t); }, [put]);

  const flip = useCallback((to: number) => {
    if (turnRef.current || to < 0 || to >= n || to === index) return;
    const t: Turn = to > index
      ? { dir: 'fwd', leaf: index, base: to, target: to, angle: 0, anim: false, commit: true }
      : { dir: 'back', leaf: to, base: index, target: to, angle: END, anim: false, commit: true };
    begin(t);
    requestAnimationFrame(() => requestAnimationFrame(() => { const c = turnRef.current; if (c) put({ ...c, anim: true, angle: c.dir === 'fwd' ? END : 0 }); }));
  }, [n, index, begin, put]);

  // 兜底：transitionend 偶尔不来（切后台、动画被打断），到点也收尾
  useEffect(() => {
    if (!turn?.anim) return;
    const id = window.setTimeout(finish, 800);
    return () => window.clearTimeout(id);
  }, [turn?.anim, finish]);

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

  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);

  const width = () => inRef.current?.getBoundingClientRect().width || 360;
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || turnRef.current) return;
    suppress.current = false; start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, t: performance.now() };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current; if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      s.moved = true; try { (e.currentTarget as HTMLElement).setPointerCapture(s.id); } catch { /* ignore */ }
      if (dx < 0 && index < n - 1) begin({ dir: 'fwd', leaf: index, base: index + 1, target: index + 1, angle: 0, anim: false, commit: false });
      else if (dx > 0 && index > 0) begin({ dir: 'back', leaf: index - 1, base: index, target: index - 1, angle: END, anim: false, commit: false });
    }
    const t = turnRef.current;
    if (!t) { setRub(Math.max(-40, Math.min(40, dx * .25))); return; }
    if (t.anim) return;
    const p = dx / width(), span = -END * 1.15;
    const angle = t.dir === 'fwd' ? Math.max(END, Math.min(0, p * span)) : Math.max(END, Math.min(0, END + p * span));
    put({ ...t, angle });
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current; start.current = null; if (!s || !s.moved) return;
    suppress.current = true; setRub(0); window.setTimeout(() => { suppress.current = false; }, 400);   // 拖完浏览器不一定再发 click，别让这个标记吞掉下一次点按
    const t = turnRef.current; if (!t || t.anim) return;
    const v = (e.clientX - s.x) / Math.max(1, performance.now() - s.t);   // px/ms
    const prog = t.dir === 'fwd' ? t.angle / END : 1 - t.angle / END;
    const commit = prog > .32 || (t.dir === 'fwd' ? v < -.45 : v > .45);
    const angle = commit ? (t.dir === 'fwd' ? END : 0) : (t.dir === 'fwd' ? 0 : END);
    put({ ...t, commit, anim: true, angle });
    if (angle === t.angle) window.setTimeout(finish, 0);
  };
  const onCancel = () => {
    start.current = null; setRub(0);
    const t = turnRef.current; if (t && !t.anim) { put({ ...t, commit: false, anim: true, angle: t.dir === 'fwd' ? 0 : END }); window.setTimeout(finish, 600); }
  };
  const onClickCapture = (e: React.MouseEvent) => { if (suppress.current) { suppress.current = false; e.stopPropagation(); e.preventDefault(); } };

  const baseIdx = turn ? turn.base : index;
  const tr = turn?.anim ? `transform .52s ${EASE}, opacity .52s ${EASE}` : 'none';
  const lift = turn ? Math.min(1, -turn.angle / 90) : 0;   // 0 = 平躺，1 = 立起来
  const shown = turn ? turn.target : index;

  return (
    <div className={`tp-stage${immersive ? ' imm' : ''}`} style={{ ['--chrome' as string]: `${chrome}px` }}>
      <div className="tp-book">
        <div className="tp-book-in" ref={inRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onClickCapture={onClickCapture}>
          <div className="tp-book-edge" />
          <div key={pages[baseIdx].key} className={`tp-base${quiet ? '' : ' tp-anim'}`} style={rub ? { transform: `translateX(${rub}px)`, transition: 'none' } : undefined}>
            {/* eslint-disable-next-line react-hooks/refs -- flip 只在点击 / 按键里调用，不在渲染时读 ref */}
            {pages[baseIdx].render(flip)}
            {turn && <div className="tp-cast" style={{ opacity: (1 - lift) * .55, transition: tr }} />}
          </div>
          {turn && (
            <div key={`leaf-${pages[turn.leaf].key}`} className="tp-leaf" style={{ transform: `rotateY(${turn.angle}deg)`, transition: tr }}
              onTransitionEnd={e => { if (e.target === e.currentTarget && e.propertyName === 'transform') finish(); }}>
              {/* eslint-disable-next-line react-hooks/refs -- flip 只在点击 / 按键里调用，不在渲染时读 ref */}
              {pages[turn.leaf].render(flip)}
              <div className="tp-leaf-shade" style={{ opacity: lift * .9, transition: tr }} />
              <div className="tp-leaf-gloss" style={{ opacity: Math.sin(lift * Math.PI) * .8, transition: tr }} />
            </div>
          )}
        </div>
      </div>
      {immersive ? (
        <div className="tp-imm-foot">
          <button type="button" className="tp-arrow" aria-label="上一页" disabled={shown === 0} onClick={() => flip(index - 1)}>‹</button>
          <div className="tp-imm-mid">
            <div className="tp-imm-tab">{pages[shown].tab}<span>{shown + 1} / {n}</span></div>
            <div className="tp-imm-dots">{pages.map((p, i) => <button type="button" aria-label={p.tab} key={p.key} className={`${i === shown ? 'on' : ''}${p.sealed ? ' sealed' : ''}`} style={{ ['--c' as string]: p.color }} onClick={() => flip(i)} />)}</div>
          </div>
          <button type="button" className="tp-arrow" aria-label="下一页" disabled={shown === n - 1} onClick={() => flip(index + 1)}>›</button>
        </div>
      ) : (
        <>
          <div className="tp-nav">
            <button type="button" className="tp-arrow" aria-label="上一页" disabled={index === 0} onClick={() => flip(index - 1)}>‹</button>
            <div className="tp-pgno"><b>{pages[shown].tab}</b> · {shown + 1} / {n}</div>
            <button type="button" className="tp-arrow" aria-label="下一页" disabled={index === n - 1} onClick={() => flip(index + 1)}>›</button>
          </div>
          <div className="tp-chips" ref={chipsRef}>
            {pages.map((p, i) => (
              <button type="button" key={p.key} data-i={i} className={`${i === shown ? 'on' : ''}${p.sealed ? ' sealed' : ''}`} style={{ ['--c' as string]: p.color }} onClick={() => flip(i)}>
                {p.sealed ? <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden><rect x="1" y="5" width="9" height="6.5" rx="1.4" fill="currentColor" /><path d="M3 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg> : <i />}{p.tab}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
