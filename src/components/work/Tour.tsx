'use client';

/** 第一次进来的引导（候选人页 / 出题人空间共用）：遮罩 + 高亮框（box-shadow 挖洞）+ 小卡片，一步一个区域。锚点用 data-tour="key"。 */
import React, { useEffect, useState } from 'react';
export type TourStep = { key: string; title: string; text: string };
export function Tour({ step, steps, onStep, onDone, doneLabel = '开始做题' }: { step: number; steps: TourStep[]; onStep: (n: number) => void; onDone: () => void; doneLabel?: string }) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cur = steps[Math.min(step, steps.length - 1)];
  useEffect(() => {
    const find = () => { const el = document.querySelector(`[data-tour="${cur.key}"]`) as HTMLElement | null; if (!el) { setRect(null); return; } const r = el.getBoundingClientRect(); setRect({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 }); };
    find(); const t = setTimeout(find, 300); window.addEventListener('resize', find); return () => { clearTimeout(t); window.removeEventListener('resize', find); };
  }, [cur.key]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); if (e.key === 'Enter' || e.key === 'ArrowRight') (step >= steps.length - 1 ? onDone() : onStep(step + 1)); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [step, steps.length, onStep, onDone]);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200, vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const W = 320; let cx = 24, cy = 80;
  if (rect) { const below = rect.y + rect.h + 14; cx = Math.min(vw - W - 16, Math.max(16, rect.x + rect.w / 2 - W / 2)); cy = below + 190 < vh ? below : Math.max(16, rect.y - 190); if (rect.w < vw * 0.6 && rect.h > vh * 0.5) { cx = rect.x + rect.w + 14 <= vw - W - 16 ? rect.x + rect.w + 14 : Math.max(16, rect.x - W - 14); cy = Math.max(16, Math.min(vh - 200, rect.y + 24)); } }
  return <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={onDone}>
    {rect ? <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: 12, boxShadow: '0 0 0 9999px rgba(20,22,40,.28), 0 0 0 2px #6055f5', pointerEvents: 'none', transition: 'all .25s ease' }} /> : <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,22,40,.28)' }} />}
    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: cx, top: cy, width: W, background: '#fff', color: '#1a1a2e', borderRadius: 14, padding: '14px 16px 12px', boxShadow: '0 12px 40px rgba(10,10,40,.25)', fontSize: 13.5, lineHeight: 1.65 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#6055f5', fontWeight: 700, marginBottom: 4 }}>界面说明 · {step + 1} / {steps.length}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{cur.title}</div>
      <div style={{ color: '#444' }}>{cur.text}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>{steps.map((_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 99, background: i === step ? '#6055f5' : '#d9dbe6' }} />)}</div>
        <button onClick={onDone} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#888', cursor: 'pointer', font: 'inherit', fontSize: 12.5 }}>跳过</button>
        {step > 0 && <button onClick={() => onStep(step - 1)} style={{ border: '1px solid #e0e0ee', background: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', font: 'inherit', fontSize: 12.5 }}>上一步</button>}
        <button onClick={() => (step >= steps.length - 1 ? onDone() : onStep(step + 1))} style={{ border: 0, background: '#6055f5', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 700 }}>{step >= steps.length - 1 ? doneLabel : '下一步'}</button>
      </div>
    </div>
  </div>;
}

