'use client';

/** 工作台各页共用的小件：页首（英文眉题 + 衬线中文大标题 + 斜体英文副题 + 引言 + 右侧动作）、空状态、下拉菜单。样式在 Shell 的 CSS */
import React, { useEffect, useRef, useState } from 'react';
import { Tour, type TourStep } from '@/components/work/Tour';

export function Head({ eyebrow, zh, en, lead, acts }: { eyebrow: string; zh: React.ReactNode; en: string; lead?: React.ReactNode; acts?: React.ReactNode }) {
  return (
    <div className="wws-head">
      <div><div className="wws-eyebrow">{eyebrow}</div><h1>{zh}<span>{en}</span></h1>{lead && <p>{lead}</p>}</div>
      {acts && <div className="acts">{acts}</div>}
    </div>
  );
}

export function Rule({ zh, en }: { zh: string; en?: string }) {
  return <div className="wws-rule"><i /><h2 className="wws-h2">{zh}{en && <small>{en}</small>}</h2><i /></div>;
}

export function Empty({ children }: { children: React.ReactNode }) { return <div className="wws-empty-box">{children}</div>; }

/** 按钮 + 下拉（点外面收起） */
export function Menu({ label, className = 'wws-btn p', children }: { label: React.ReactNode; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const on = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', on); return () => document.removeEventListener('mousedown', on); }, [open]);
  return <div className="wws-menu" ref={ref}><button className={className} onClick={() => setOpen(o => !o)} aria-expanded={open}>{label}</button>{open && <div className="wws-menu-m" onClick={() => setOpen(false)}>{children}</div>}</div>;
}

/**
 * 第一次进来的引导（2026-11-05）：复用真活的 Tour（遮罩挖洞高亮 + 小卡片），锚点 data-tour="key"。
 * 看过记在本机 localStorage（wws-tour-<id>）；地址带 ?tour=1 强制再看一遍（账号菜单「新手引导」）。页面上找不到 / 看不见的步骤（如手机上收起的侧栏）自动跳过。
 */
export const TOUR_IDS = ['home', 'chat'];
export function WsTour({ id, steps }: { id: string; steps: TourStep[] }) {
  const [list, setList] = useState<TourStep[] | null>(null); const [step, setStep] = useState(0);
  useEffect(() => {
    const force = new URLSearchParams(location.search).get('tour') === '1';
    let seen = false; try { seen = localStorage.getItem(`wws-tour-${id}`) === '1'; } catch {}
    if (seen && !force) return;
    const t = setTimeout(() => {
      const vis = steps.filter(s => { const el = document.querySelector(`[data-tour="${s.key}"]`) as HTMLElement | null; return !!el && el.offsetWidth > 0 && el.offsetHeight > 0; });
      if (vis.length) { setStep(0); setList(vis); }
    }, 900);
    return () => clearTimeout(t);
  }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return null;
  const done = () => {
    setList(null); try { localStorage.setItem(`wws-tour-${id}`, '1'); } catch {}
    if (location.search.includes('tour=1')) history.replaceState(null, '', location.pathname);
  };
  return <Tour step={step} steps={list} onStep={setStep} onDone={done} doneLabel="开始用" />;
}
