'use client';
/**
 * 产业投资地图的工作台外壳：侧栏（首页 / 新对话 / 功能页 / 最近）可收成图标栏，对话在 /invest/chat，功能页全屏。
 * 所有登录用户可用。和对话页之间用 window 事件：iv-threads（刷新列表）/ iv-thread（当前对话）/ iv-open（打开某段或新对话）/ iv-side（收起侧栏）。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, GitBranch, House, Landmark, Menu, PanelLeft, SquarePen, X } from 'lucide-react';
import { isBaiyeOnly } from '@/lib/roles';
import { ActCtx, CompanyDetail, type Act } from './ui';

const CHAT = '/invest/chat';
const NAV = [
  { ic: House, href: '/invest', t: '首页', on: (p: string) => p === '/invest' },
  { ic: GitBranch, href: '/invest/chain', t: '产业链', on: (p: string) => p.startsWith('/invest/chain') },
  { ic: Landmark, href: '/invest/investors', t: '投资机构', on: (p: string) => p.startsWith('/invest/investors') },
  { ic: Building2, href: '/invest/projects', t: '项目库', on: (p: string) => p.startsWith('/invest/projects') },
];
const ChainCtx = createContext<{ chain: string; setChain: (c: string) => void }>({ chain: 'all', setChain() {} });
export const useChain = () => useContext(ChainCtx);

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '', router = useRouter();
  const [chain, setChain] = useState('all'), [mini, setMini] = useState(false), [drawer, setDrawer] = useState(false), [open, setOpen] = useState<number | null>(null);
  const [threads, setThreads] = useState<{ id: string; title?: string }[]>([]), [cur, setCur] = useState<string | null>(null), [role, setRole] = useState<string | null>(null);
  useEffect(() => { try { setMini(localStorage.getItem('iv-mini') === '1'); } catch {} fetch('/api/auth/me').then(r => r.json()).then(j => setRole(j.user?.role || j.role || null)).catch(() => {}); }, []);
  const toggle = () => setMini(m => { try { localStorage.setItem('iv-mini', m ? '0' : '1'); } catch {} return !m; });
  const load = useCallback(() => fetch('/api/invest/chat', { cache: 'no-store' }).then(r => r.json()).then(j => j.ok && setThreads(j.threads || [])).catch(() => {}), []);
  useEffect(() => {
    load();
    const onList = () => load(), onCur = (e: Event) => setCur((e as CustomEvent).detail || null), onSide = () => setMini(true);
    window.addEventListener('iv-threads', onList); window.addEventListener('iv-thread', onCur); window.addEventListener('iv-side', onSide);
    return () => { window.removeEventListener('iv-threads', onList); window.removeEventListener('iv-thread', onCur); window.removeEventListener('iv-side', onSide); };
  }, [load]);
  useEffect(() => { setDrawer(false); setOpen(null); if (path !== CHAT) setCur(null); }, [path]);
  const openThread = (id: string | null) => { setDrawer(false); if (path === CHAT) window.dispatchEvent(new CustomEvent('iv-open', { detail: id })); else router.push(id ? `${CHAT}?thread=${id}` : CHAT); };
  const del = async (id: string) => { if (!confirm('删除这段对话？删除后找不回来。')) return; await fetch(`/api/invest/chat?id=${id}`, { method: 'DELETE' }); load(); if (cur === id) openThread(null); };
  const act = useMemo<Act>(() => ({ company: id => setOpen(id), investor: n => { setOpen(null); router.push(`/invest/investors?name=${encodeURIComponent(n)}`); }, place: p => router.push(`/invest/projects?place=${encodeURIComponent(p)}`), canAdmin: !!role && !isBaiyeOnly(role) }), [role, router]);
  const closeOpen = useCallback(() => setOpen(null), []);
  useEffect(() => { if (open === null) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && closeOpen(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, closeOpen]);
  const m = mini && !drawer;
  return <div className="iv">
    <header className="iv-mtop"><button className="iv-ic" aria-label="打开菜单" onClick={() => setDrawer(true)}><Menu size={20} /></button><b>产业投资地图</b><button className="iv-ic" aria-label="新对话" onClick={() => openThread(null)}><SquarePen size={18} /></button></header>
    <div className={`iv-scrim${drawer ? ' open' : ''}`} onClick={() => setDrawer(false)} />
    <aside className={`iv-side${m ? ' mini' : ''}${drawer ? ' open' : ''}`}>
      <div className="iv-side-top"><button className="iv-ic" aria-label={m ? '展开侧栏' : '收起侧栏'} onClick={drawer ? () => setDrawer(false) : toggle}>{drawer ? <X size={18} /> : <PanelLeft size={18} />}</button>{!m && <b>产业投资地图</b>}</div>
      <nav className="iv-nav">
        <button className={path === CHAT && !cur ? 'on' : ''} title="新对话" onClick={() => openThread(null)}><SquarePen size={17} />{!m && '新对话'}</button>
        {NAV.map(x => <Link key={x.href} href={x.href} title={x.t} className={x.on(path) ? 'on' : ''}><x.ic size={17} />{!m && x.t}</Link>)}
      </nav>
      {!m && <div className="iv-recent"><h4>最近</h4>{threads.map(t => <div key={t.id} className={`iv-thr${cur === t.id ? ' on' : ''}`}><button title={t.title || '对话'} onClick={() => openThread(t.id)}>{t.title || '对话'}</button><button className="x" aria-label="删除这段对话" onClick={() => del(t.id)}>×</button></div>)}{!threads.length && <div style={{ padding: '2px 7px', fontSize: 12.5, color: 'var(--ink3)' }}>还没有对话</div>}</div>}
      {!m && <p className="iv-side-note">样本是库内企业和公开披露的融资事件，用来看结构和相对强弱，不等于全市场。</p>}
    </aside>
    <main className="iv-main">
      <ChainCtx.Provider value={{ chain, setChain }}><ActCtx.Provider value={act}>
        {children}
        {open !== null && <><div className="iv-drawer-bg" onClick={closeOpen} /><aside className="iv-drawer" role="dialog" aria-label="企业详情"><button className="iv-ic iv-x" onClick={closeOpen} aria-label="关闭"><X size={18} /></button><CompanyDetail id={open} /></aside></>}
      </ActCtx.Provider></ChainCtx.Provider>
    </main>
  </div>;
}
