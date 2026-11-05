'use client';

/**
 * 真活工作台 /work/ws（2026-11-05 起，新版单独一个入口，/work 原样不动）：出任务的人的 workspace。
 * 照 Claude 的 workspace（用户 11-05）：侧栏 = 首页 + ＋新对话 + 工具入口（管理真活 / 任务报告 / 任务库 / 填表）+ 所有「最近」对话 + 账号。
 * 聊着出任务只是新对话里的一种活；对话时右边是应用框架：看 AI 做出来的东西（题的空间、报告），也能自己打开别的应用。
 * 每件事也都有人工能点的页面；页面上「问助理」把这件事带进对话。页面被嵌在对话右边时不套侧栏，「问助理」交给外面的对话（postMessage wws-ask）。
 * 和对话页之间用 window 事件：wws-threads（刷新列表）/ wws-thread（当前对话 id）/ wws-open（打开某段或新对话）。
 * 样子（11-05 用户：第一批合作方是海归和名校老师，很文艺）：照百业学院的版式——纸色底、衬线中文标题配斜体英文、字距拉开的小英文眉题、细线；主色仍是真活的紫，不铺大色块。
 * 各页共用的版式类（wws-head / wws-card / wws-table / wws-btn …）都在这里的 CSS。
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { TOUR_IDS } from './ui';
import { BookOpen, ChevronsUpDown, ClipboardList, Database, House, Library, Menu, ShieldCheck, SquarePen, Users, X, type LucideIcon } from 'lucide-react';
import { canManageBaiye } from '@/lib/roles';

const HOME = '/work/ws', CHAT = '/work/ws/chat', LOGIN = '/work/ws/login';
const NAV = [
  { ic: House as LucideIcon, href: HOME, t: '首页', on: (p: string) => p === HOME },
  { ic: ClipboardList as LucideIcon, tour: 'nav-tasks', href: `${HOME}/tasks`, t: '管理真活', on: (p: string) => p.startsWith(`${HOME}/tasks`) },
  { ic: Database as LucideIcon, tour: 'nav-reports', href: `${HOME}/reports`, t: '任务报告', on: (p: string) => p.startsWith(`${HOME}/reports`) },
  { ic: Library as LucideIcon, tour: 'nav-kb', href: `${HOME}/kb`, t: '知识库', on: (p: string) => p.startsWith(`${HOME}/kb`) },
  { ic: BookOpen as LucideIcon, tour: 'nav-library', href: `${HOME}/library`, t: '任务库', on: (p: string) => p.startsWith(`${HOME}/library`) },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '';
  const router = useRouter();
  const [threads, setThreads] = useState<{ id: string; title?: string }[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [me, setMe] = useState<{ email?: string; name?: string; role?: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);   // 手机上：侧栏收成左边抽屉，顶栏汉堡打开
  useEffect(() => { setDrawer(false); setMenu(false); }, [path]);
  useEffect(() => { document.body.style.overflow = drawer ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [drawer]);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/work'; };
  const [embed, setEmbed] = useState(false);
  useEffect(() => { try { setEmbed(window.self !== window.top); } catch { setEmbed(true); } }, []);
  // 嵌在对话右边：点「问助理」不在小框里跳，交给外面的对话接着聊
  useEffect(() => {
    if (!embed) return;
    const on = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest?.('a'); const href = a?.getAttribute('href') || ''; if (!href.startsWith(CHAT)) return; e.preventDefault(); window.parent.postMessage({ type: 'wws-ask', href }, location.origin); };
    document.addEventListener('click', on, true); return () => document.removeEventListener('click', on, true);
  }, [embed]);
  const load = useCallback(() => fetch('/api/admin/work/chat', { cache: 'no-store' }).then(r => { if (r.status === 401 && location.pathname !== LOGIN) location.href = `/work?next=${encodeURIComponent(location.pathname + location.search)}`; return r.json(); }).then(j => j.ok && setThreads(j.data)).catch(() => {}), []);
  useEffect(() => { if (embed || path === LOGIN) return; load(); fetch('/api/auth/me').then(r => r.json()).then(j => setMe(j.user || j)).catch(() => {}); }, [load, embed, path === LOGIN]);
  useEffect(() => {
    const onList = () => load();
    const onCur = (e: Event) => setCur((e as CustomEvent).detail || null);
    window.addEventListener('wws-threads', onList); window.addEventListener('wws-thread', onCur);
    return () => { window.removeEventListener('wws-threads', onList); window.removeEventListener('wws-thread', onCur); };
  }, [load]);
  useEffect(() => { if (path !== CHAT) setCur(null); }, [path]);
  const open = (id: string | null) => {
    setDrawer(false);
    if (path === CHAT) window.dispatchEvent(new CustomEvent('wws-open', { detail: id }));
    else router.push(id ? `${CHAT}?thread=${id}` : CHAT);
  };
  const who = me?.name || me?.email || '';
  if (embed) return <div className="wws embed"><style>{CSS}</style><main className="wws-main">{children}</main></div>;
  if (path === LOGIN) return <div className="wws"><style>{CSS}</style>{children}</div>;   // 登录页自己一整屏，不套侧栏
  return (
    <div className="wws">
      <style>{CSS}</style>
      <header className="wws-mtop">
        <button className="wws-ham" data-tour="ham" aria-label="打开菜单" aria-expanded={drawer} onClick={() => setDrawer(true)}><Menu size={21} strokeWidth={1.8} /></button>
        <Link href="/work/ws" className="wws-mbrand"><span className="mk">真</span><b>百业AI｜真活</b></Link>
        <button className="wws-ham" aria-label="新对话" onClick={() => open(null)}><SquarePen size={19} strokeWidth={1.8} /></button>
      </header>
      {drawer && <div className="wws-scrim" onClick={() => setDrawer(false)} />}
      <aside className={`wws-side${drawer ? ' open' : ''}`}>
        <button className="wws-ham wws-close" aria-label="关闭菜单" onClick={() => setDrawer(false)}><X size={20} strokeWidth={1.8} /></button>
        <Link href="/work/ws" className="wws-brand"><span className="mk">真</span><div><b>百业AI｜真活</b><small>TRUE WORK · DESK</small></div></Link>
        <div className="wws-scroll">
          <button data-tour="nav-new" className={`wws-new${path === CHAT && !cur ? ' on' : ''}`} onClick={() => open(null)}><Ic I={SquarePen} />新对话</button>
          <nav className="wws-nav">{NAV.map(x => <Link key={x.href} href={x.href} data-tour={(x as { tour?: string }).tour} className={x.on(path) ? 'on' : ''}><Ic I={x.ic} />{x.t}</Link>)}</nav>
          {canManageBaiye(me?.role) && <nav className="wws-nav wws-admin">
            <Link href={`${HOME}/users`} className={path.startsWith(`${HOME}/users`) ? 'on' : ''}><Ic I={Users} />用户管理</Link>
            {me?.role === 'admin' && <Link href={`${HOME}/admin`} className={path.startsWith(`${HOME}/admin`) ? 'on' : ''}><Ic I={ShieldCheck} />全站管理</Link>}
          </nav>}
          <div className="wws-grp">RECENT<span>最近</span></div>
          <div className="wws-list" data-tour="recent">
            {threads.slice(0, 40).map(t => <button key={t.id} className={`wws-item${cur === t.id ? ' on' : ''}`} title={t.title || '对话'} onClick={() => open(t.id)}>{t.title || '对话'}</button>)}
            {!threads.length && <div className="wws-empty">还没有对话</div>}
          </div>
        </div>
        <div className="wws-foot">
          {menu && <div className="wws-acct-m" onMouseLeave={() => setMenu(false)}>
            <Link href={`${HOME}/settings`} onClick={() => setMenu(false)}>设置</Link>
            <button onClick={() => { for (const k of TOUR_IDS) try { localStorage.removeItem(`wws-tour-${k}`); } catch {} location.href = `${HOME}?tour=1`; }}>新手引导</button>
            <a href="/work-guide-v2/" target="_blank" rel="noreferrer">使用教程 ↗</a>
            <a href="/work/about">关于真活</a>
            <Link href="/work/classic">切换到传统版</Link>
            <hr />
            <button onClick={logout}>退出登录</button>
          </div>}
          <button data-tour="account" className="wws-acct" onClick={() => setMenu(m => !m)} aria-expanded={menu}><span className="av">{(who || '我').slice(0, 1).toUpperCase()}</span><span className="who"><b>{who || '出任务的人'}</b><small>出任务 · 看答卷 · 定人</small></span><ChevronsUpDown className="chev" size={15} strokeWidth={1.7} /></button>
        </div>
      </aside>
      <main className="wws-main">{children}</main>
    </div>
  );
}

function Ic({ I }: { I: LucideIcon }) { return <span className="ic"><I size={17} strokeWidth={1.7} /></span>; }

const CSS = `
.wws { --bg: #f7f5f0; --paper: #fffefb; --ink: #1b1d36; --ink2: #575b75; --ink3: #9497ab; --line: #e7e3d9; --line2: #efece4;
  --acc: #5148d6; --acc2: #6055f5; --acc-soft: #f0eefe; --brass: #a88b5c;
  --serif: "Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif; --en: var(--font-en-serif), "Source Serif 4", Georgia, serif;
  display: flex; min-height: 100vh; color: var(--ink); font-size: 14.5px;
  background: var(--bg) radial-gradient(1100px 520px at 100% -8%, rgba(96,85,245,.07), transparent 62%); font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }
.wws a { color: inherit; }
/* 侧栏：纸色，细线分隔 */
.wws-side { width: 248px; flex-shrink: 0; position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; background: var(--paper); border-right: 1px solid var(--line); }
.wws-brand { display: flex; align-items: center; gap: 12px; padding: 22px 18px 16px; text-decoration: none; border-bottom: 1px solid var(--line2); }
.wws-brand .mk { width: 40px; height: 40px; border-radius: 50%; background: var(--acc); color: #fff; display: grid; place-items: center; font: 900 19px var(--serif); box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px rgba(81,72,214,.35); flex-shrink: 0; }
.wws-brand b { display: block; font: 900 17px/1.25 var(--serif); letter-spacing: .05em; }
.wws-brand small { display: block; font: 600 10.5px/1.4 var(--en); letter-spacing: .22em; color: var(--brass); margin-top: 3px; }
.wws-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 10px 14px; }
.wws-new { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; margin-bottom: 8px; border: 1px solid var(--line); background: #fff; border-radius: 10px; font: inherit; font-size: 14.5px; font-weight: 700; color: var(--ink); cursor: pointer; box-shadow: 0 1px 0 rgba(27,29,54,.03); }
.wws-new:hover, .wws-new.on { border-color: var(--acc); color: var(--acc); }
.wws-nav { display: grid; gap: 1px; }
.wws-nav a { display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 9px; text-decoration: none; font-size: 14.5px; font-weight: 600; color: var(--ink2); }
.wws-nav a:hover { background: rgba(27,29,54,.04); color: var(--ink); }
.wws-nav a.on { background: var(--acc-soft); color: var(--ink); font-weight: 800; box-shadow: inset 3px 0 0 var(--acc); }
.wws-nav .ic, .wws-new .ic, .wws-classic .ic { width: 22px; display: grid; place-items: center; color: var(--acc); flex-shrink: 0; }
.wws-admin { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--line); }
.wws-grp { font: 600 10.5px var(--en); letter-spacing: .26em; color: var(--ink3); padding: 18px 12px 6px; }
.wws-grp span { font: 600 11px "PingFang SC", sans-serif; letter-spacing: .1em; margin-left: 8px; }
.wws-list { display: grid; gap: 1px; }
.wws-item { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 7px 12px; border-radius: 8px; font: inherit; font-size: 13.5px; color: var(--ink2); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wws-item:hover { background: rgba(27,29,54,.04); color: var(--ink); } .wws-item.on { background: var(--acc-soft); color: var(--ink); font-weight: 700; }
.wws-empty { padding: 6px 12px; font-size: 13px; color: var(--ink3); }
.wws-foot { border-top: 1px solid var(--line2); padding: 10px; display: grid; gap: 2px; }
.wws-foot { position: relative; }
.wws-acct { display: flex; align-items: center; gap: 10px; padding: 6px 8px; width: 100%; border: 0; background: transparent; border-radius: 10px; cursor: pointer; font: inherit; text-align: left; color: var(--ink); }
.wws-acct:hover, .wws-acct[aria-expanded="true"] { background: rgba(27,29,54,.04); }
.wws-acct .chev { margin-left: auto; color: var(--ink3); flex-shrink: 0; }
.wws-acct-m { position: absolute; left: 10px; right: 10px; bottom: calc(100% - 4px); background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 6px; box-shadow: 0 10px 30px rgba(27,29,54,.14); z-index: 5; }
.wws-acct-m hr { border: 0; border-top: 1px solid var(--line2); margin: 4px 6px; }
.wws-acct-m a, .wws-acct-m button { display: block; text-decoration: none; width: 100%; text-align: left; border: 0; background: transparent; padding: 9px 10px; border-radius: 8px; font: inherit; font-size: 13.5px; color: var(--ink); cursor: pointer; } .wws-acct-m a:hover, .wws-acct-m button:hover { background: var(--acc-soft); }
.wws-acct .av { width: 32px; height: 32px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; font: 700 13px var(--en); flex-shrink: 0; box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgba(168,139,92,.5); }
.wws-acct .who { min-width: 0; } .wws-acct b { display: block; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .wws-acct small { display: block; font-size: 11.5px; color: var(--ink3); }
.wws-classic { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; font-size: 13px; color: var(--ink2); text-decoration: none; }
.wws-classic:hover { background: rgba(27,29,54,.04); color: var(--ink); }
.wws-main { flex: 1; min-width: 0; }
.wws.embed { min-height: 0; background: var(--paper); } .wws.embed .wws-page { padding: 18px 18px 40px; } .wws.embed .wws-head h1 { font-size: 22px; }
/* 页面版式 */
.wws-page { max-width: 1240px; margin: 0 auto; padding: 34px clamp(18px, 3vw, 44px) 70px; }
.wws-eyebrow { font: 600 11.5px/1.4 var(--en); letter-spacing: .26em; color: var(--brass); text-transform: uppercase; }
.wws-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
.wws-head h1 { font: 900 30px/1.2 var(--serif); letter-spacing: .03em; margin: 8px 0 0; }
.wws-head h1 span { display: block; font: italic 400 15px var(--en); color: var(--ink2); letter-spacing: .01em; margin-top: 6px; }
.wws-head p { margin: 10px 0 0; color: var(--ink2); font-size: 14px; line-height: 1.85; max-width: 760px; }
.wws-head .acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.wws-h2 { font: 800 18px var(--serif); letter-spacing: .03em; margin: 0; } .wws-h2 small { font: italic 400 13px var(--en); color: var(--ink3); margin-left: 8px; letter-spacing: 0; }
.wws-rule { display: flex; align-items: center; gap: 12px; margin: 30px 0 16px; }
.wws-rule i { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(168,139,92,.45), transparent); } .wws-rule i:first-child { flex: 0 0 18px; background: rgba(168,139,92,.6); }
.wws-card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; position: relative; box-shadow: 0 1px 0 rgba(27,29,54,.03), 0 14px 32px -26px rgba(27,29,54,.28); }
.wws-card.lined::before { content: ''; position: absolute; left: 20px; right: 20px; top: 0; height: 2px; background: linear-gradient(90deg, transparent, rgba(168,139,92,.55), transparent); }
.wws-card.pad { padding: 18px 20px; }
.wws-card-h { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.wws-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.wws-stat { padding: 16px 18px 14px; position: relative; overflow: hidden; }
.wws-stat b { display: block; font: 900 32px/1.1 var(--serif); font-variant-numeric: tabular-nums; }
.wws-stat span { display: block; font-size: 13.5px; color: var(--ink2); margin-top: 6px; font-weight: 700; }
.wws-stat i { position: absolute; right: 14px; top: 8px; font: italic 500 13px var(--en); color: var(--brass); opacity: .8; letter-spacing: .06em; }
.wws-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.wws-table th { text-align: left; font: 600 10.5px/1.4 var(--en), "PingFang SC", sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--ink2); padding: 12px 14px 9px; border-bottom: 1.5px solid var(--ink); white-space: nowrap; }
.wws-table th small { display: block; font: 600 11.5px "PingFang SC", sans-serif; letter-spacing: .04em; text-transform: none; color: var(--ink3); }
.wws-table td { padding: 12px 14px; border-bottom: 1px solid var(--line2); vertical-align: top; line-height: 1.6; }
.wws-table tr:hover td { background: rgba(96,85,245,.025); }
.wws-table .t { font-weight: 800; text-decoration: none; } .wws-table .t:hover { color: var(--acc); }
.wws-table .sub { color: var(--ink3); font-size: 12px; }
.wws-num { font: 900 17px var(--serif); font-variant-numeric: tabular-nums; }
.wws-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 9px; padding: 7px 14px; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; text-decoration: none; white-space: nowrap; }
.wws-btn:hover { border-color: var(--acc); color: var(--acc); } .wws-btn:disabled { opacity: .5; cursor: default; }
.wws-btn.p { background: var(--acc); border-color: var(--acc); color: #fff; } .wws-btn.p:hover { background: #453cc4; color: #fff; }
.wws-ask { border: 1px solid #dcd8fb; background: var(--acc-soft); color: var(--acc); border-radius: 8px; padding: 4px 11px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.wws-ask:hover { background: #e6e3fd; }
.wws-chip { border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 5px 13px; font: inherit; font-size: 13px; color: var(--ink2); cursor: pointer; font-weight: 600; text-decoration: none; }
.wws-chip.on { background: var(--ink); border-color: var(--ink); color: #fff; }
.wws-in { border: 1px solid var(--line); border-radius: 9px; padding: 7px 12px; font: inherit; font-size: 13.5px; outline: 0; background: #fff; color: var(--ink); }
.wws-in:focus { border-color: var(--acc); }
.wws-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 16px; overflow-x: auto; }
.wws-tabs button { border: 0; background: none; padding: 10px 16px 11px; font: 700 15px var(--serif); letter-spacing: .04em; color: var(--ink2); border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; white-space: nowrap; }
.wws-tabs button small { font: italic 400 12px var(--en); color: var(--ink3); margin-left: 6px; letter-spacing: 0; }
.wws-tabs button.on { color: var(--ink); border-bottom-color: var(--acc); }
.wws-tag { font-size: 11.5px; border-radius: 6px; padding: 1px 7px; font-weight: 700; white-space: nowrap; }
.wws-tag.ok { color: #0d7a52; background: #e7f5ee; } .wws-tag.warn { color: #8a5a00; background: #fbf1df; } .wws-tag.mute { color: #6b6f86; background: #f0efeb; } .wws-tag.acc { color: var(--acc); background: var(--acc-soft); }
.wws-muted { color: var(--ink3); font-size: 13px; }
.wws-empty-box { padding: 30px; text-align: center; color: var(--ink2); line-height: 1.9; } .wws-empty-box::before { content: '✦'; display: block; color: var(--brass); font-size: 16px; margin-bottom: 6px; }
.wws-bar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--paper); }
.wws-back { color: var(--acc); font-weight: 700; font-size: 13.5px; text-decoration: none; } .wws-bar-t { font: 800 16px var(--serif); letter-spacing: .03em; }
.wws-menu { position: relative; } .wws-menu-m { position: absolute; right: 0; top: calc(100% + 6px); background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 6px; box-shadow: 0 10px 30px rgba(27,29,54,.14); display: grid; gap: 2px; min-width: 220px; z-index: 10; }
.wws-menu-m a, .wws-menu-m button { display: block; text-align: left; border: 0; background: transparent; padding: 9px 12px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 700; color: var(--ink); cursor: pointer; text-decoration: none; }
.wws-menu-m small { display: block; font-weight: 500; font-size: 12px; color: var(--ink3); margin-top: 2px; }
.wws-menu-m a:hover, .wws-menu-m button:hover { background: var(--acc-soft); }
/* 手机（11-05）：照 Claude 的 H5——顶栏汉堡 + 新对话，侧栏整个收成左边抽屉（内容和桌面一样：新对话、导航、最近、账号） */
.wws-mtop, .wws-close { display: none; }
@media (max-width: 860px) {
  .wws { flex-direction: column; }
  .wws-mtop { display: flex; align-items: center; gap: 6px; position: sticky; top: 0; z-index: 30; height: 52px; padding: 0 8px; background: var(--paper); border-bottom: 1px solid var(--line); }
  .wws-ham { width: 40px; height: 40px; border: 0; background: transparent; border-radius: 10px; display: grid; place-items: center; color: var(--ink); cursor: pointer; flex-shrink: 0; }
  .wws-ham:active { background: rgba(27,29,54,.06); }
  .wws-mbrand { display: flex; align-items: center; gap: 8px; text-decoration: none; margin-right: auto; min-width: 0; }
  .wws-mbrand .mk { width: 28px; height: 28px; border-radius: 50%; background: var(--acc); color: #fff; display: grid; place-items: center; font: 900 14px var(--serif); flex-shrink: 0; }
  .wws-mbrand b { font: 900 15.5px var(--serif); letter-spacing: .05em; white-space: nowrap; }
  .wws-side { position: fixed; left: 0; top: 0; bottom: 0; height: 100%; width: min(84vw, 300px); z-index: 50; transform: translateX(-104%); transition: transform .22s ease; box-shadow: 8px 0 30px rgba(27,29,54,.16); }
  .wws-side.open { transform: none; }
  .wws-close { display: grid; position: absolute; right: 8px; top: 14px; z-index: 2; }
  .wws-brand { padding-right: 52px; }
  .wws-scrim { position: fixed; inset: 0; background: rgba(27,29,54,.32); z-index: 45; }
  .wws-page { padding: 20px 16px 48px; } .wws-head h1 { font-size: 24px; } .wws-head p { font-size: 13.5px; }
  .wws-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .wws-stat { padding: 12px 14px; } .wws-stat b { font-size: 26px; }
  .wws-menu-m { right: auto; left: 0; max-width: calc(100vw - 32px); }
  .wws-tabs button { padding: 9px 12px 10px; font-size: 14px; } .wws-tabs button small { display: none; }
  .wws-in { min-width: 0 !important; max-width: 100%; }
  .wws-table th, .wws-table td { padding: 10px 9px; } .wws-table td { overflow-wrap: anywhere; }
  /* 窄屏只留关键列（其余横滑也看不清）：管理真活 / 任务报告 / 用户管理 / 全部真活 / 素材 */
  .t-tasks tr > :nth-child(5), .t-tasks tr > :nth-child(6), .t-tasks tr > :nth-child(7),
  .t-reports tr > :nth-child(4), .t-reports tr > :nth-child(6), .t-reports tr > :nth-child(8), .t-reports tr > :nth-child(9),
  .t-users tr > :nth-child(4),
  .t-all tr > :nth-child(2), .t-all tr > :nth-child(5), .t-all tr > :nth-child(6), .t-all tr > :nth-child(7),
  .t-assets tr > :nth-child(3), .t-assets tr > :nth-child(4) { display: none; }
  .wws-table td[colspan] { display: table-cell !important; }
}
/* 手机竖屏：表格每行变成一张小卡片——主信息（第一格）占一整行，其余跟在下面，操作靠右；表头不要 */
@media (max-width: 640px) {
  .wws-table, .wws-table tbody { display: block; } .wws-table thead { display: none; }
  .wws-table tr { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 12px 14px; border-bottom: 1px solid var(--line2); }
  .wws-table tr:hover td { background: none; }
  .wws-table td { display: block; padding: 0 !important; border: 0; min-width: 0 !important; }
  .wws-table td:first-child { flex-basis: 100%; } .wws-table td:last-child:not(:first-child) { margin-left: auto; }
  .wws-table td[colspan] { display: block !important; flex-basis: 100%; }
  .t-reports td:first-child { flex-basis: auto; } .t-reports td:nth-child(2) { flex-basis: calc(100% - 40px); } .t-reports td:nth-child(3) { flex-basis: 100%; }
}
}
`;
