'use client';

/**
 * 第一次进来的引导（候选人页 / 出题人空间 / 工作台共用）：遮罩 + 高亮框 + 小卡片，一步一个区域。锚点用 data-tour="key"。
 * 11-05 修：
 * - 高亮框每一帧跟着目标走（页面滚动、数据加载后布局变了都不漂）；每一步先把目标滚到视野中间。
 * - 遮罩挡住整页点击：点页面别处不会退出（以前一点就关、而且记成看过，再也不出）；只有「跳过」「完成」和 Esc 能关。
 * - 遮罩用高亮框四周四块半透明（9999px box-shadow 挖洞在有的浏览器只画出一角）。
 * - 左边侧栏里的项、高的竖条：卡片放右边，不挡下一项。
 */
import React, { useEffect, useRef, useState } from 'react';
import { useL } from '@/lib/work/i18n';

const DIM = 'rgba(20,22,40,.28)';
// 可视区域：用 clientWidth / clientHeight（手机上页面被撑宽时 innerWidth 会跟着变大，卡片就放歪了）
const vw0 = () => document.documentElement.clientWidth || window.innerWidth;
const vh0 = () => document.documentElement.clientHeight || window.innerHeight;
export type TourStep = { key: string; title: string; text: string };
type Rect = { x: number; y: number; w: number; h: number };

export function Tour({ step, steps, onStep, onDone, doneLabel: doneLabel0 }: { step: number; steps: TourStep[]; onStep: (n: number) => void; onDone: () => void; doneLabel?: string }) {
  const L = useL(); const doneLabel = doneLabel0 ?? L('开始做题', 'Start the task');
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ w: 1200, h: 800 });
  const last = useRef('');
  const cur = steps[Math.min(step, steps.length - 1)];
  // 换步：把目标滚到视野里
  useEffect(() => {
    const el = document.querySelector(`[data-tour="${cur.key}"]`) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > vh0() - 220) el.scrollIntoView({ block: r.height > vh0() * 0.6 ? 'start' : 'center', behavior: 'smooth' });
  }, [cur.key]);
  // 每一帧量一次目标位置，有变化才更新
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = document.querySelector(`[data-tour="${cur.key}"]`) as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 ? { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 } : null;
      const sig = next ? `${Math.round(next.x)},${Math.round(next.y)},${Math.round(next.w)},${Math.round(next.h)},${vw0()},${vh0()}` : 'none';
      if (sig !== last.current) { last.current = sig; setRect(next); setVp({ w: vw0(), h: vh0() }); }
      raf = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(raf);
  }, [cur.key]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); if (e.key === 'Enter' || e.key === 'ArrowRight') (step >= steps.length - 1 ? onDone() : onStep(step + 1)); if (e.key === 'ArrowLeft' && step > 0) onStep(step - 1); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [step, steps.length, onStep, onDone]);
  const { w: vw, h: vh } = vp;
  const W = Math.min(320, vw - 32), CH = 190; let cx = 16, cy = 80;
  if (rect) {
    const below = rect.y + rect.h + 14;
    cx = Math.min(vw - W - 16, Math.max(16, rect.x + rect.w / 2 - W / 2));
    cy = below + CH < vh ? below : rect.y - CH - 8 > 16 ? rect.y - CH - 8 : Math.max(16, vh - CH - 16);
    if ((rect.w < vw * 0.6 && rect.h > vh * 0.5) || (rect.x + rect.w < Math.min(340, vw * 0.3) && vw > 700)) {   // 高的竖条、或左边侧栏里的一项：卡片放右边
      cx = rect.x + rect.w + 14 <= vw - W - 16 ? rect.x + rect.w + 14 : Math.max(16, rect.x - W - 14);
      cy = Math.max(16, Math.min(vh - CH - 16, rect.y));
    }
  }
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); };
  return <div role="dialog" aria-modal="true" aria-label={cur.title} style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={stop} onMouseDown={stop}>
    {rect ? <>
      {[{ left: 0, top: 0, width: '100%', height: Math.max(0, rect.y) }, { left: 0, top: rect.y + rect.h, width: '100%', bottom: 0 }, { left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.h }, { left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h }].map((st, i) => <div key={i} style={{ position: 'absolute', background: DIM, ...st }} />)}
      <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: 12, boxShadow: '0 0 0 2px #6055f5, 0 0 0 6px rgba(96,85,245,.18)' }} />
    </> : <div style={{ position: 'absolute', inset: 0, background: DIM }} />}
    <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', left: cx, top: cy, width: W, background: '#fff', color: '#1a1a2e', borderRadius: 14, padding: '14px 16px 12px', boxShadow: '0 12px 40px rgba(10,10,40,.25)', fontSize: 13.5, lineHeight: 1.65, transition: 'left .2s ease, top .2s ease' }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#6055f5', fontWeight: 700, marginBottom: 4 }}>{L('界面说明', 'Quick tour')} · {step + 1} / {steps.length}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{cur.title}</div>
      <div style={{ color: '#444' }}>{cur.text}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>{steps.map((_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 99, background: i === step ? '#6055f5' : '#d9dbe6' }} />)}</div>
        <button onClick={onDone} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#888', cursor: 'pointer', font: 'inherit', fontSize: 12.5 }}>{L('跳过', 'Skip')}</button>
        {step > 0 && <button onClick={() => onStep(step - 1)} style={{ border: '1px solid #e0e0ee', background: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', font: 'inherit', fontSize: 12.5 }}>{L('上一步', 'Back')}</button>}
        <button onClick={() => (step >= steps.length - 1 ? onDone() : onStep(step + 1))} style={{ border: 0, background: '#6055f5', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 700 }}>{step >= steps.length - 1 ? doneLabel : L('下一步', 'Next')}</button>
      </div>
    </div>
  </div>;
}
