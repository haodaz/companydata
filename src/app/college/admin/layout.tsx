'use client';

/**
 * 百业学院教务（2026-10-23）：申请管理 / 学员管理 / 学员培养 / 毕业生管理 / 课程。只给 admin（proxy 按库里角色实时拦；核心业务逻辑不对普通用户和百业用户开放）。
 * 两条路径：每个基础功能都能在这里人工点；教务 AI（学院秘书）再把它们串起来。气质沿用学院官网（象牙 / 深蓝 / 金 / 衬线）。
 * 2026-10-26：侧栏照一答工作台——新对话 + 导航 + 「最近」对话历史在同一条侧栏里，底部是账号（头衔写在这里）。
 * 和秘书页之间用 window 事件通信：college-threads（刷新列表）/ college-thread（当前对话 id）/ college-open（打开某段或新对话）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronsUpDown, ClipboardCheck, Factory, Feather, GraduationCap, Hammer, Landmark, LayoutDashboard, Library, MailOpen, SquarePen, Users, type LucideIcon } from 'lucide-react';
import { ADMIN_CSS } from './ui';

const CHAT = '/college/admin/chat';
const NAV = [
  { ic: Feather as LucideIcon, href: CHAT, t: '学院秘书', on: (p: string) => p.startsWith(CHAT) },
  { ic: LayoutDashboard as LucideIcon, href: '/college/admin', t: '总览', on: (p: string) => p === '/college/admin' },
  { ic: MailOpen as LucideIcon, href: '/college/admin/applications', t: '申请管理 · 线索', on: (p: string) => p.startsWith('/college/admin/applications') },
  { ic: Users as LucideIcon, href: '/college/admin/students', t: '学员管理', on: (p: string) => p.startsWith('/college/admin/students') },
  { ic: Hammer as LucideIcon, href: '/college/admin/training', t: '学员培养', on: (p: string) => p.startsWith('/college/admin/training') },
  { ic: GraduationCap as LucideIcon, href: '/college/admin/graduates', t: '毕业生管理', on: (p: string) => p.startsWith('/college/admin/graduates') },
  { ic: Library as LucideIcon, href: '/college/admin/courses', t: '课程目录', on: (p: string) => p.startsWith('/college/admin/courses') },
];
const FOLD_KEY = 'college-side-fold';

export default function CollegeAdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '';
  const router = useRouter();
  const [threads, setThreads] = useState<{ id: string; title?: string }[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  // 被学院秘书的右侧面板用 iframe 嵌进去时，不再套一条侧栏
  const [embed, setEmbed] = useState(false);
  useEffect(() => { try { setEmbed(window.self !== window.top); } catch { setEmbed(true); } }, []);
  const load = useCallback(() => fetch('/api/college/admin/threads', { cache: 'no-store' }).then(r => r.json()).then(j => j.ok && setThreads(j.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { setFold(JSON.parse(localStorage.getItem(FOLD_KEY) || '{}')); } catch {} }, []);
  useEffect(() => {
    const onList = () => load();
    const onCur = (e: Event) => setCur((e as CustomEvent).detail || null);
    window.addEventListener('college-threads', onList); window.addEventListener('college-thread', onCur);
    return () => { window.removeEventListener('college-threads', onList); window.removeEventListener('college-thread', onCur); };
  }, [load]);
  useEffect(() => { if (!path.startsWith(CHAT)) setCur(null); setMenu(false); }, [path]);
  const toggle = (k: string) => setFold(f => { const n = { ...f, [k]: !f[k] }; try { localStorage.setItem(FOLD_KEY, JSON.stringify(n)); } catch {} return n; });
  // 在秘书页里就直接切对话（不整页跳），别的页先跳过去
  const open = (id: string | null) => {
    if (path.startsWith(CHAT)) window.dispatchEvent(new CustomEvent('college-open', { detail: id }));
    else router.push(id ? `${CHAT}?thread=${id}` : CHAT);
  };
  return (
    <div className={`ca${embed ? ' embed' : ''}`}>
      <style>{ADMIN_CSS + SIDE_CSS}</style>
      <aside className="ca-side">
        <div className="ca-brand"><span className="crest"><img src="/college/crest.svg" alt="院徽" /></span><div><b>百业学院</b><small>教务处 · REGISTRAR</small></div></div>
        <div className="cs-scroll">
          <button className="cs-new" onClick={() => open(null)}><Ic I={SquarePen} />新对话</button>
          <nav className="ca-nav">
            {NAV.map((x, i) => <Link key={x.href} href={x.href} className={x.on(path) && !(i === 0 && cur) ? 'on' : ''}><Ic I={x.ic} />{x.t}</Link>)}
          </nav>
          <button className={`cs-group${fold.recent ? ' folded' : ''}`} onClick={() => toggle('recent')}>最近<span>›</span></button>
          {!fold.recent && <div className="cs-list">
            {threads.slice(0, 30).map(t => <button key={t.id} className={`cs-item${cur === t.id ? ' on' : ''}`} title={t.title || '对话'} onClick={() => open(t.id)}>{t.title || '对话'}</button>)}
            {!threads.length && <div className="cs-empty">还没有对话</div>}
          </div>}
          <button className={`cs-group${fold.campus ? ' folded' : ''}`} onClick={() => toggle('campus')}>校园<span>›</span></button>
          {!fold.campus && <div className="ca-nav cs-campus">
            <a href="/college" target="_blank" rel="noreferrer"><Ic I={Landmark} />学院官网</a>
            <a href="/lab/spaces" target="_blank" rel="noreferrer"><Ic I={Factory} />百业工厂 · 造课程</a>
            <a href="/work/mine" target="_blank" rel="noreferrer"><Ic I={ClipboardCheck} />真活台 · 出考题</a>
          </div>}
        </div>
        <div className="cs-foot">
          {menu && <div className="cs-menu">
            <a href="/college" target="_blank" rel="noreferrer">学院官网</a>
            <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/college'; }}>退出登录</button>
          </div>}
          <button className="cs-acct" onClick={() => setMenu(m => !m)} aria-expanded={menu}>
            <span className="seal">壮</span>
            <span className="who"><b>好大壮</b><small>院长 · 定方向、拍板、见客户</small></span>
            <ChevronsUpDown className="chev" size={15} strokeWidth={1.7} />
          </button>
        </div>
      </aside>
      {/* 总览起的各页：内容最宽 1500 居中，两边留白随屏幕；学院秘书是满幅工作台，不套 */}
      <main className="ca-main">{path.startsWith(CHAT) ? children : <div className="ca-wrap">{children}</div>}</main>
    </div>
  );
}

/** 侧栏图标（2026-10-26）：lucide 细线图标，按功能取意，代替原来的「秘 / ◆ / 罗马数字」 */
function Ic({ I }: { I: LucideIcon }) { return <span className="ic"><I size={17} strokeWidth={1.6} /></span>; }

const SIDE_CSS = `
.ca-nav a .ic, .cs-new .ic { width: 24px; height: 24px; display: grid; place-items: center; flex-shrink: 0; color: var(--gold); }
.ca-nav a.on .ic { color: var(--navy); } .ca-nav a:hover .ic { color: var(--navy2); }
.ca-side { width: 252px; }
.ca.embed .ca-side { display: none; } .ca.embed .ca-main { padding: 20px 22px 40px; }
.cs-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 10px 14px; }
.cs-scroll .ca-nav { padding: 0; }
.cs-new { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; margin-bottom: 4px; border: 1px solid var(--line); background: #fff; border-radius: 8px; font: inherit; font-size: 14.5px; font-weight: 700; color: var(--navy); cursor: pointer; text-align: left; }
.cs-new:hover { border-color: var(--gold); }
.cs-group { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: transparent; padding: 16px 12px 4px; font: 700 11px var(--en), 'PingFang SC', sans-serif; letter-spacing: .2em; color: var(--ink3); cursor: pointer; text-align: left; }
.cs-group span { opacity: 0; transform: rotate(90deg); transition: transform .15s, opacity .15s; font-size: 13px; }
.cs-group:hover span { opacity: 1; } .cs-group.folded span { opacity: 1; transform: rotate(0deg); }
.cs-list { display: grid; gap: 1px; }
.cs-item { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 7px 12px; border-radius: 8px; font: inherit; font-size: 13.5px; color: var(--navy2); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-item:hover { background: rgba(22,32,74,.05); color: var(--navy); }
.cs-item.on { background: rgba(176,141,87,.13); color: var(--navy); font-weight: 700; }
.cs-empty { padding: 6px 12px; font-size: 13px; color: var(--ink3); }
.cs-foot { position: relative; padding: 10px; border-top: 1px solid var(--line); }
.cs-acct { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: transparent; padding: 8px 10px; border-radius: 10px; cursor: pointer; font: inherit; text-align: left; color: var(--navy); }
.cs-acct:hover, .cs-acct[aria-expanded="true"] { background: rgba(22,32,74,.05); }
.cs-acct .seal { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--navy); color: #fff; font-weight: 700; font-size: 13px; flex-shrink: 0; box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgba(176,141,87,.55); }
.cs-acct .who { flex: 1; min-width: 0; } .cs-acct .who b { display: block; font-size: 14px; }
.cs-acct .who small { display: block; font-size: 11.5px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-acct .chev { color: var(--ink3); flex-shrink: 0; }
.cs-menu { position: absolute; left: 10px; right: 10px; bottom: calc(100% - 4px); background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 6px; box-shadow: 0 8px 24px rgba(22,32,74,.12); display: grid; gap: 2px; z-index: 5; }
.cs-menu a, .cs-menu button { display: block; border: 0; background: transparent; text-align: left; padding: 8px 10px; border-radius: 8px; font: inherit; font-size: 13.5px; color: var(--navy); cursor: pointer; }
.cs-menu a:hover, .cs-menu button:hover { background: rgba(22,32,74,.05); }
.ca-wrap { max-width: 1500px; margin: 0 auto; }
/* 中等宽度：侧栏还是一列竖排，只是收窄（不要把导航挤成一行） */
@media (max-width: 960px) {
  .ca { flex-direction: row; }
  .ca-side { position: sticky; top: 0; height: 100vh; width: 212px; }
  .ca-brand { padding: 18px 14px 14px; } .ca-brand .crest { width: 38px; height: 38px; } .ca-brand .crest img { width: 31px; height: 31px; } .ca-brand b { font-size: 17px; }
  .cs-scroll .ca-nav { display: grid; } .ca-nav a { padding: 9px 10px; gap: 8px; font-size: 14px; } .ca-nav a i { width: 22px; }
}
/* 手机：侧栏变成顶部一条，导航横向滑动；最近对话、校园、账号收起 */
@media (max-width: 799px) {
  .ca { flex-direction: column; }
  .ca-side { position: static; height: auto; width: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .ca-brand { border-bottom: 0; padding-bottom: 6px; }
  .cs-scroll { overflow: visible; padding: 4px 10px 10px; }
  .cs-new, .cs-group, .cs-list, .cs-scroll .ca-nav.cs-campus, .cs-foot { display: none; }
  .cs-scroll .ca-nav { display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 4px; scrollbar-width: none; }
  .cs-scroll .ca-nav a { flex-shrink: 0; white-space: nowrap; }
}
`;
