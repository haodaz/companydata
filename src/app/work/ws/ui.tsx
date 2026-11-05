'use client';

/** 工作台各页共用的小件：页首（英文眉题 + 衬线中文大标题 + 斜体英文副题 + 引言 + 右侧动作）、空状态、下拉菜单。样式在 Shell 的 CSS */
import React, { useEffect, useRef, useState } from 'react';

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
