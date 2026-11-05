'use client';

/**
 * 真活工作台 /work/ws（2026-11-05 起，新版单独一个入口，/work 原样不动）：出任务的人的 workspace。
 * 照 Claude 的 workspace（用户 11-05）：侧栏 = 首页 + ＋新对话 + 工具入口（管理真活 / 任务报告 / 任务库 / 填表）+ 所有「最近」对话 + 账号。
 * 聊着出任务只是新对话里的一种活；对话时右边是应用框架：看 AI 做出来的东西（题的空间、报告），也能自己打开别的应用。
 * 每件事也都有人工能点的页面；页面上「问助理」把这件事带进对话。页面被嵌在对话右边时不套侧栏，「问助理」交给外面的对话（postMessage wws-ask）。
 * 和对话页之间用 window 事件：wws-threads（刷新列表）/ wws-thread（当前对话 id）/ wws-open（打开某段或新对话）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, ClipboardList, Database, FilePlus2, House, SquarePen, type LucideIcon } from 'lucide-react';

const HOME = '/work/ws', CHAT = '/work/ws/chat';
const NAV = [
  { ic: House as LucideIcon, href: HOME, t: '首页', on: (p: string) => p === HOME },
  { ic: ClipboardList as LucideIcon, href: `${HOME}/tasks`, t: '管理真活', on: (p: string) => p.startsWith(`${HOME}/tasks`) },
  { ic: Database as LucideIcon, href: `${HOME}/reports`, t: '任务报告', on: (p: string) => p.startsWith(`${HOME}/reports`) },
  { ic: BookOpen as LucideIcon, href: '/work/library', t: '任务库', on: () => false },
  { ic: FilePlus2 as LucideIcon, href: '/work/new', t: '填表出任务', on: () => false },
];

export default function WorkWsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '';
  const router = useRouter();
  const [threads, setThreads] = useState<{ id: string; title?: string }[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [me, setMe] = useState<{ email?: string; name?: string } | null>(null);
  const [embed, setEmbed] = useState(false);
  useEffect(() => { try { setEmbed(window.self !== window.top); } catch { setEmbed(true); } }, []);
  // 嵌在对话右边：点「问助理」不在小框里跳，交给外面的对话接着聊
  useEffect(() => {
    if (!embed) return;
    const on = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest?.('a'); const href = a?.getAttribute('href') || ''; if (!href.startsWith(CHAT)) return; e.preventDefault(); window.parent.postMessage({ type: 'wws-ask', href }, location.origin); };
    document.addEventListener('click', on, true); return () => document.removeEventListener('click', on, true);
  }, [embed]);
  const load = useCallback(() => fetch('/api/admin/work/chat', { cache: 'no-store' }).then(r => { if (r.status === 401) location.href = `/work/login?next=${encodeURIComponent(location.pathname)}`; return r.json(); }).then(j => j.ok && setThreads(j.data)).catch(() => {}), []);
  useEffect(() => { if (embed) return; load(); fetch('/api/auth/me').then(r => r.json()).then(j => setMe(j.user || j)).catch(() => {}); }, [load, embed]);
  useEffect(() => {
    const onList = () => load();
    const onCur = (e: Event) => setCur((e as CustomEvent).detail || null);
    window.addEventListener('wws-threads', onList); window.addEventListener('wws-thread', onCur);
    return () => { window.removeEventListener('wws-threads', onList); window.removeEventListener('wws-thread', onCur); };
  }, [load]);
  useEffect(() => { if (path !== CHAT) setCur(null); }, [path]);
  const open = (id: string | null) => {
    if (path === CHAT) window.dispatchEvent(new CustomEvent('wws-open', { detail: id }));
    else router.push(id ? `${CHAT}?thread=${id}` : CHAT);
  };
  const who = me?.name || me?.email || '';
  if (embed) return <div className="wws embed"><style>{CSS}</style><main className="wws-main">{children}</main></div>;
  return (
    <div className="wws">
      <style>{CSS}</style>
      <aside className="wws-side">
        <Link href="/work" className="wws-brand"><span className="mk">真</span><div><b>百业AI｜真活</b><small>工作台 · beta</small></div></Link>
        <div className="wws-scroll">
          <button className={`wws-new${path === CHAT && !cur ? ' on' : ''}`} onClick={() => open(null)}><Ic I={SquarePen} />新对话</button>
          <nav className="wws-nav">{NAV.map(x => <Link key={x.href} href={x.href} className={x.on(path) ? 'on' : ''}><Ic I={x.ic} />{x.t}</Link>)}</nav>
          <div className="wws-grp">最近</div>
          <div className="wws-list">
            {threads.slice(0, 30).map(t => <button key={t.id} className={`wws-item${cur === t.id ? ' on' : ''}`} title={t.title || '对话'} onClick={() => open(t.id)}>{t.title || '对话'}</button>)}
            {!threads.length && <div className="wws-empty">还没有对话</div>}
          </div>
        </div>
        <div className="wws-foot"><span className="av">{(who || '我').slice(0, 1).toUpperCase()}</span><span className="who"><b>{who || '出任务的人'}</b><small>出任务 · 看答卷 · 定人</small></span></div>
      </aside>
      <main className="wws-main">{children}</main>
    </div>
  );
}

function Ic({ I }: { I: LucideIcon }) { return <span className="ic"><I size={17} strokeWidth={1.7} /></span>; }

const CSS = `
.wws { display: flex; min-height: 100vh; background: #f6f7fb; color: #1a1a2e; font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif; }
.wws-side { width: 236px; flex-shrink: 0; position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; background: #fff; border-right: 1px solid #e8e9f0; }
.wws-brand { display: flex; align-items: center; gap: 10px; padding: 18px 16px 12px; text-decoration: none; color: inherit; }
.wws-brand .mk { width: 32px; height: 32px; border-radius: 9px; background: #6055f5; color: #fff; display: grid; place-items: center; font-weight: 900; }
.wws-brand b { display: block; font-size: 15px; } .wws-brand small { display: block; font-size: 11.5px; color: #8c8fa6; }
.wws-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 10px 14px; }
.wws-new { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; margin-bottom: 6px; border: 1px solid #e0e0ee; background: #fff; border-radius: 10px; font: inherit; font-size: 14px; font-weight: 700; color: #1a1a2e; cursor: pointer; }
.wws-new:hover, .wws-new.on { border-color: #6055f5; }
.wws.embed { min-height: 0; background: #fff; } .wws.embed .wws-page { padding: 16px 16px 40px; }
.wws-nav { display: grid; gap: 1px; }
.wws-nav a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 9px; color: #3b405a; text-decoration: none; font-size: 14px; }
.wws-nav a:hover { background: #f0f1f6; } .wws-nav a.on { background: #ecebff; color: #2b2670; font-weight: 700; }
.wws-nav .ic, .wws-new .ic { width: 22px; display: grid; place-items: center; color: #6055f5; }
.wws-grp { font-size: 11px; letter-spacing: .2em; color: #999; padding: 16px 10px 4px; font-weight: 700; }
.wws-list { display: grid; gap: 1px; }
.wws-item { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 7px 10px; border-radius: 8px; font: inherit; font-size: 13.5px; color: #3b405a; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wws-item:hover { background: #f0f1f6; } .wws-item.on { background: #ecebff; color: #2b2670; font-weight: 700; }
.wws-empty { padding: 6px 10px; font-size: 13px; color: #999; }
.wws-foot { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-top: 1px solid #e8e9f0; }
.wws-foot .av { width: 30px; height: 30px; border-radius: 50%; background: #1a1a2e; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.wws-foot .who { min-width: 0; } .wws-foot b { display: block; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .wws-foot small { display: block; font-size: 11.5px; color: #8c8fa6; }
.wws-main { flex: 1; min-width: 0; }
.wws-page { max-width: 1240px; margin: 0 auto; padding: 28px 28px 60px; }
.wws-h1 { font-size: 24px; font-weight: 900; margin: 0 0 4px; } .wws-sub { color: #6b6f86; font-size: 14px; margin: 0 0 18px; }
.wws-card { background: #fff; border: 1px solid #e8e9f0; border-radius: 14px; }
.wws-ask { border: 1px solid #dcd8ff; background: #f6f5ff; color: #4c43c9; border-radius: 8px; padding: 3px 10px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.wws-ask:hover { background: #ecebff; }
@media (max-width: 860px) {
  .wws { flex-direction: column; }
  .wws-side { position: static; width: auto; height: auto; border-right: 0; border-bottom: 1px solid #e8e9f0; }
  .wws-scroll { padding: 0 10px 10px; } .wws-new, .wws-grp, .wws-list, .wws-foot { display: none; }
  .wws-scroll > .wws-nav { display: flex; overflow-x: auto; gap: 4px; }
  .wws-nav a { white-space: nowrap; flex-shrink: 0; }
  .wws-page { padding: 18px 16px 40px; }
}
`;
