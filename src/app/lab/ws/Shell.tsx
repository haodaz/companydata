'use client';

/**
 * 「AI 百业｜模拟」workspace 外壳（E，2026-11-06，照真活工作台）：左边侧栏，内容区直接复用已有的页面（百业工厂、工作室、体验馆、素材库、对话）。
 * 侧栏：首页 / ＋新对话 / 百业工厂 / 模拟空间 / 使用记录 / 素材管理 / 用户管理（管理员、百业管理员）+ 最近对话 + 账号菜单（切换到经典版、退出登录）。
 * LabShell 在 /lab/ws 下不画顶栏、不套 lab-wrap；配色沿用 .lab 的变量。手机上侧栏收成左边抽屉。
 * 和对话页之间用 window 事件：lws-threads（刷新列表）/ lws-thread（当前对话 id）/ lws-open（打开某段或新对话）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Boxes, Factory, FolderOpen, House, Menu, SquarePen, Users, X, ChevronsUpDown, type LucideIcon } from 'lucide-react';
import { useUser } from '@/lib/user-context';
import { canManageBaiye } from '@/lib/roles';

const HOME = '/lab/ws', CHAT = '/lab/ws/chat';
const NAV: { ic: LucideIcon; href: string; t: string; on: (p: string) => boolean; admin?: boolean }[] = [
  { ic: House, href: HOME, t: '首页', on: p => p === HOME },
  { ic: Factory, href: `${HOME}/factory`, t: '百业工厂', on: p => p.startsWith(`${HOME}/factory`) || p.startsWith(`${HOME}/space`) || p.startsWith(`${HOME}/new`) },
  { ic: Boxes, href: `${HOME}/spaces`, t: '模拟空间', on: p => p.startsWith(`${HOME}/spaces`) },
  { ic: BarChart3, href: `${HOME}/usage`, t: '使用记录', on: p => p.startsWith(`${HOME}/usage`) },
  { ic: FolderOpen, href: `${HOME}/assets`, t: '素材管理', on: p => p.startsWith(`${HOME}/assets`) },
  { ic: Users, href: `${HOME}/users`, t: '用户管理', on: p => p.startsWith(`${HOME}/users`), admin: true },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || ''; const router = useRouter();
  const { user } = useUser() as any;
  const [threads, setThreads] = useState<{ id: string; title?: string }[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [menu, setMenu] = useState(false); const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); setMenu(false); }, [path]);
  const load = useCallback(() => fetch('/api/lab/chat', { cache: 'no-store' }).then(r => { if (r.status === 401) location.href = `/lab/login?next=${encodeURIComponent(location.pathname)}`; return r.json(); }).then(j => j.ok && setThreads(j.data || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onList = () => load(); const onCur = (e: Event) => setCur((e as CustomEvent).detail || null);
    window.addEventListener('lws-threads', onList); window.addEventListener('lws-thread', onCur);
    return () => { window.removeEventListener('lws-threads', onList); window.removeEventListener('lws-thread', onCur); };
  }, [load]);
  useEffect(() => { if (path !== CHAT) setCur(null); }, [path]);
  const open = (id: string | null) => { setDrawer(false); if (path === CHAT) window.dispatchEvent(new CustomEvent('lws-open', { detail: id })); else router.push(id ? `${CHAT}?thread=${id}` : CHAT); };
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/lab/login'; };
  const who = user?.email || '';
  return (
    <div className="lws">
      <style>{CSS}</style>
      <header className="lws-mtop">
        <button className="lws-ham" aria-label="打开菜单" onClick={() => setDrawer(true)}><Menu size={21} strokeWidth={1.8} /></button>
        <Link href={HOME} className="lws-mbrand"><span className="mk">业</span><b>AI 百业｜模拟</b></Link>
        <button className="lws-ham" aria-label="新对话" onClick={() => open(null)}><SquarePen size={19} strokeWidth={1.8} /></button>
      </header>
      {drawer && <div className="lws-scrim" onClick={() => setDrawer(false)} />}
      <aside className={`lws-side${drawer ? ' open' : ''}`}>
        <button className="lws-ham lws-close" aria-label="关闭菜单" onClick={() => setDrawer(false)}><X size={20} strokeWidth={1.8} /></button>
        <Link href={HOME} className="lws-brand"><span className="mk">业</span><div><b>AI 百业｜模拟</b><small>SIMULATION · WORKSPACE</small></div></Link>
        <div className="lws-scroll">
          <button className={`lws-new${path === CHAT && !cur ? ' on' : ''}`} onClick={() => open(null)}><SquarePen size={16} strokeWidth={1.8} />新对话</button>
          <nav className="lws-nav">{NAV.filter(x => !x.admin || canManageBaiye(user?.role)).map(x => <Link key={x.href} href={x.href} className={x.on(path) ? 'on' : ''}><x.ic size={17} strokeWidth={1.7} />{x.t}</Link>)}</nav>
          <div className="lws-grp">最近对话</div>
          <div className="lws-list">
            {threads.slice(0, 40).map(t => <button key={t.id} className={`lws-item${cur === t.id ? ' on' : ''}`} title={t.title || '对话'} onClick={() => open(t.id)}>{t.title || '对话'}</button>)}
            {!threads.length && <div className="lws-empty">还没有对话</div>}
          </div>
        </div>
        <div className="lws-foot">
          {menu && <div className="lws-acct-m" onMouseLeave={() => setMenu(false)}>
            <a href="/lab/spaces">切换到经典版</a>
            <a href="/lab">百业首页</a>
            <hr />
            <button onClick={logout}>退出登录</button>
          </div>}
          <button className="lws-acct" onClick={() => setMenu(m => !m)} aria-expanded={menu}><span className="av">{(who || '我').slice(0, 1).toUpperCase()}</span><span className="who"><b>{who || '…'}</b><small>生成 · 管理 · 看使用</small></span><ChevronsUpDown size={15} strokeWidth={1.7} style={{ marginLeft: 'auto', color: 'var(--ink3)' }} /></button>
        </div>
      </aside>
      <main className="lws-main">{children}</main>
    </div>
  );
}

const CSS = `
.lws { display: flex; min-height: 100vh; position: relative; z-index: 1; }
.lws-side { width: 244px; flex-shrink: 0; position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; background: #fff; border-right: 1px solid var(--line); }
.lws-brand { display: flex; align-items: center; gap: 11px; padding: 20px 16px 14px; text-decoration: none; color: var(--ink); }
.lws-brand .mk, .lws-mbrand .mk { width: 36px; height: 36px; border-radius: 10px; background: var(--v); color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 16px; flex-shrink: 0; }
.lws-brand b { display: block; font-size: 15.5px; font-weight: 800; } .lws-brand small { display: block; font-size: 10px; letter-spacing: .18em; color: var(--ink3); margin-top: 2px; }
.lws-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 10px 12px; }
.lws-new { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 12px; margin-bottom: 8px; border: 1px solid var(--line); background: #fff; border-radius: 12px; font: inherit; font-size: 14px; font-weight: 700; color: var(--ink); cursor: pointer; }
.lws-new:hover, .lws-new.on { border-color: var(--v); color: var(--v); }
.lws-nav { display: grid; gap: 1px; }
.lws-nav a { display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 10px; text-decoration: none; font-size: 14px; font-weight: 600; color: var(--ink2); }
.lws-nav a svg { color: var(--v); flex-shrink: 0; }
.lws-nav a:hover { background: rgba(106,92,255,.06); color: var(--ink); } .lws-nav a.on { background: rgba(106,92,255,.1); color: var(--ink); font-weight: 800; }
.lws-grp { font-size: 11.5px; font-weight: 700; color: var(--ink3); padding: 16px 12px 6px; letter-spacing: .06em; }
.lws-list { display: grid; gap: 1px; }
.lws-item { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 7px 12px; border-radius: 8px; font: inherit; font-size: 13px; color: var(--ink2); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lws-item:hover { background: rgba(106,92,255,.06); } .lws-item.on { background: rgba(106,92,255,.1); color: var(--ink); font-weight: 700; }
.lws-empty { padding: 6px 12px; font-size: 13px; color: var(--ink3); }
.lws-foot { position: relative; border-top: 1px solid var(--line); padding: 8px; }
.lws-acct { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 8px; border: 0; background: transparent; border-radius: 10px; cursor: pointer; font: inherit; text-align: left; color: var(--ink); }
.lws-acct:hover { background: rgba(106,92,255,.06); }
.lws-acct .av { width: 30px; height: 30px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.lws-acct .who { min-width: 0; } .lws-acct b { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .lws-acct small { display: block; font-size: 11px; color: var(--ink3); }
.lws-acct-m { position: absolute; left: 8px; right: 8px; bottom: calc(100% - 2px); background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 6px; box-shadow: 0 10px 30px rgba(23,26,46,.14); z-index: 5; }
.lws-acct-m a, .lws-acct-m button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 8px; font: inherit; font-size: 13.5px; color: var(--ink); cursor: pointer; text-decoration: none; }
.lws-acct-m a:hover, .lws-acct-m button:hover { background: rgba(106,92,255,.08); } .lws-acct-m hr { border: 0; border-top: 1px solid var(--line); margin: 4px 6px; }
.lws-main { flex: 1; min-width: 0; padding: 22px clamp(16px, 2.6vw, 36px) 60px; }
.lws-mtop, .lws-close { display: none; }
@media (max-width: 860px) {
  .lws { flex-direction: column; }
  .lws-mtop { display: flex; align-items: center; gap: 6px; position: sticky; top: 0; z-index: 30; height: 52px; padding: 0 8px; background: rgba(255,255,255,.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--line); }
  .lws-ham { width: 40px; height: 40px; border: 0; background: transparent; border-radius: 10px; display: grid; place-items: center; color: var(--ink); cursor: pointer; flex-shrink: 0; }
  .lws-mbrand { display: flex; align-items: center; gap: 8px; text-decoration: none; color: var(--ink); margin-right: auto; } .lws-mbrand .mk { width: 28px; height: 28px; border-radius: 9px; font-size: 13px; } .lws-mbrand b { font-size: 15px; }
  .lws-side { position: fixed; left: 0; top: 0; bottom: 0; height: 100%; width: min(84vw, 300px); z-index: 50; transform: translateX(-104%); transition: transform .22s ease; background: #fff; box-shadow: 8px 0 30px rgba(23,26,46,.16); }
  .lws-side.open { transform: none; } .lws-close { display: grid; position: absolute; right: 8px; top: 14px; }
  .lws-scrim { position: fixed; inset: 0; background: rgba(23,26,46,.3); z-index: 45; }
  .lws-main { padding: 16px 12px 40px; }
}
`;
