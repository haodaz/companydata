'use client';

/**
 * 真活出题人一侧的统一顶栏（2026-10-27）：我的真活 / 出题 / 题目空间 / 管理全部 都用它，哪一页都能一步回到列表。
 * 第一行（吸顶）：logo（回「我的真活」）+ 导航（我的真活 · 管理全部〔admin〕）+ 右侧动作（默认「出一道真活」，出题页换成填表 / 聊着切换）。
 * 第二行（可选）：面包屑「我的真活 › 当前题目」+ 右侧小工具，在题目里面时用。
 * 候选人做题页不用它（对外的页面不露出题人的导航）。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { WorkLogo } from './WorkLogo';

type Me = { email: string; role: string } | null;
let meCache: Promise<Me> | undefined;   // 一次会话只问一次「我是谁」
export function useMe(): Me | undefined {   // undefined = 还在问（先什么都不画，免得「登录」闪一下）
  const [me, setMe] = useState<Me | undefined>(undefined);
  useEffect(() => {
    meCache ??= fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.json()).then(j => (j?.user?.email ? { email: j.user.email, role: j.user.role || 'user' } : null)).catch(() => null);
    meCache.then(setMe);
  }, []);
  return me;
}

export type Crumb = { label: React.ReactNode; href?: string };

export function WorkTopBar({ active, right, crumbs, crumbRight }: { active?: 'mine' | 'new' | 'admin'; right?: React.ReactNode; crumbs?: Crumb[]; crumbRight?: React.ReactNode }) {
  const me = useMe(); const role = me?.role || null;
  return (
    <>
      <style>{WORK_BAR_CSS}</style>
      <header className="wtb">
        <WorkLogo size="md" href="/work/mine" />
        <nav className="wtb-nav" aria-label="真活导航">
          <NavLink href="/work/mine" on={active === 'mine'}>我的真活</NavLink>
          {role === 'admin' && <NavLink href="/work/admin" on={active === 'admin'}>管理全部</NavLink>}
          <NavLink href="/lab">百业体验空间</NavLink>
        </nav>
        <div className="wtb-right">
          {right ?? (active !== 'new' && <Link href="/work/new" className="wtb-cta">＋ 出一道真活</Link>)}
          <WorkAccount me={me} />
        </div>
      </header>
      {crumbs?.length ? (
        <div className="wtb-crumbs">
          <div className="wtb-path">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="sep">›</span>}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="cur">{c.label}</span>}
              </React.Fragment>
            ))}
          </div>
          {crumbRight && <div className="wtb-crumb-right">{crumbRight}</div>}
        </div>
      ) : null}
    </>
  );
}

function NavLink({ href, on, children }: { href: string; on?: boolean; children: React.ReactNode }) {
  return on ? <span className="on" aria-current="page">{children}</span> : <Link href={href}>{children}</Link>;
}

/** 账号：登录了显示名字（邮箱 @ 前面那段），点开有我的真活 / 管理全部 / 退出；没登录才显示「登录」 */
export function WorkAccount({ me, dark }: { me: Me | undefined; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.wtb-acct')) setOpen(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (me === undefined) return <span className="wtb-acct-ph" />;
  if (!me) {
    const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/work/mine';
    return <a className={`wtb-login${dark ? ' dark' : ''}`} href={`/work/login?next=${encodeURIComponent(next)}`}>登录</a>;
  }
  const name = me.email.split('@')[0];
  return (
    <div className="wtb-acct">
      <button className={`wtb-acct-btn${dark ? ' dark' : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open} title={me.email}>
        <span className="av">{name.slice(0, 1).toUpperCase()}</span><span className="nm">{name}</span><span className="cv">▾</span>
      </button>
      {open && (
        <div className="wtb-menu" role="menu">
          <div className="wtb-menu-h">{me.email}{me.role === 'admin' ? <i>管理员</i> : null}</div>
          <Link href="/work/mine" role="menuitem">我的真活</Link>
          {me.role === 'admin' && <Link href="/work/admin" role="menuitem">管理全部</Link>}
          <Link href="/work/new" role="menuitem">出一道真活</Link>
          <button role="menuitem" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); meCache = undefined; window.location.href = '/work'; }}>退出登录</button>
        </div>
      )}
    </div>
  );
}

/** 出题页右上：填表 / 聊着 两种出法切换 */
export function NewModeSwitch({ mode }: { mode: 'form' | 'chat' }) {
  return (
    <div className="wtb-mode">
      {mode === 'form' ? <span className="on">填表出任务</span> : <Link href="/work/new">填表出任务</Link>}
      {mode === 'chat' ? <span className="on">聊着出任务</span> : <Link href="/work/new/chat">聊着出任务</Link>}
    </div>
  );
}

export const WORK_BAR_CSS = `
.wtb { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 14px; height: 60px; padding: 0 clamp(14px, 3vw, 28px); background: rgba(255,255,255,.96); backdrop-filter: blur(8px); border-bottom: 1px solid #e8e9f0; box-sizing: border-box; }
.wtb-nav { display: flex; align-items: center; gap: 4px; margin-left: 6px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.wtb-nav > * { flex-shrink: 0; padding: 6px 12px; border-radius: 999px; font-size: 13.5px; color: #6b6f86; text-decoration: none; transition: background .15s, color .15s; }
.wtb-nav a:hover { background: #f1f0fb; color: #4c43c9; }
.wtb-nav .on { background: #eeecff; color: #3f35c4; font-weight: 700; box-shadow: inset 0 0 0 1px #d8d4ff; }
.wtb-right { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.wtb-cta { display: inline-flex; align-items: center; height: 34px; padding: 0 16px; border-radius: 8px; background: #6055f5; color: #fff !important; font-size: 14px; font-weight: 600; text-decoration: none; box-shadow: 0 2px 6px rgba(96,85,245,.25); }
.wtb-cta:hover { background: #5046e5; }
.wtb-mode { display: flex; border: 1px solid #e0e0ee; border-radius: 999px; overflow: hidden; font-size: 13px; background: #fff; }
.wtb-mode a, .wtb-mode span { padding: 6px 14px; color: #666; text-decoration: none; } .wtb-mode a:hover { color: #4c43c9; background: #f6f5ff; }
.wtb-mode .on { background: #6055f5; color: #fff; font-weight: 700; }
.wtb-crumbs { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 clamp(14px, 3vw, 28px); background: #fbfbfe; border-bottom: 1px solid #eeeff5; font-size: 13px; box-sizing: border-box; }
.wtb-path { display: flex; align-items: center; gap: 8px; min-width: 0; }
.wtb-path a { color: #6055f5; text-decoration: none; flex-shrink: 0; } .wtb-path a:hover { text-decoration: underline; }
.wtb-path .sep { color: #b8bacb; }
.wtb-path .cur { color: #3b405a; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtb-crumb-right { margin-left: auto; display: flex; align-items: center; gap: 10px; color: #999; font-size: 12px; flex-shrink: 0; }
.wtb-acct-ph { width: 32px; height: 32px; }
.wtb-login { font-size: 13.5px; color: #3b405a; text-decoration: none; padding: 6px 12px; border-radius: 8px; border: 1px solid #e0e0ee; background: #fff; } .wtb-login:hover { border-color: #6055f5; color: #4c43c9; }
.wtb-login.dark { color: #fff; background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.3); }
.wtb-acct { position: relative; }
.wtb-acct-btn { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px 0 4px; border: 1px solid transparent; border-radius: 999px; background: transparent; cursor: pointer; font: inherit; color: #3b405a; }
.wtb-acct-btn:hover, .wtb-acct-btn[aria-expanded="true"] { background: #f3f2fb; border-color: #e6e4f8; }
.wtb-acct-btn.dark { color: #1a1a2e; background: rgba(255,255,255,.85); }
.wtb-acct-btn .av { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #6055f5, #12b5cb); color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 700; }
.wtb-acct-btn .nm { font-size: 13.5px; font-weight: 600; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtb-acct-btn .cv { font-size: 10px; color: #9a9db0; }
.wtb-menu { position: absolute; right: 0; top: calc(100% + 6px); min-width: 210px; background: #fff; border: 1px solid #e8e9f0; border-radius: 12px; box-shadow: 0 12px 30px rgba(26,26,46,.12); padding: 6px; z-index: 30; display: grid; gap: 2px; }
.wtb-menu-h { padding: 8px 10px 8px; font-size: 12px; color: #8a8ea3; border-bottom: 1px solid #f0f0f6; margin-bottom: 4px; word-break: break-all; }
.wtb-menu-h i { font-style: normal; margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: #eeecff; color: #3f35c4; font-size: 11px; }
.wtb-menu a, .wtb-menu button { display: block; text-align: left; padding: 8px 10px; border-radius: 8px; border: 0; background: transparent; font: inherit; font-size: 13.5px; color: #1a1a2e; text-decoration: none; cursor: pointer; }
.wtb-menu a:hover, .wtb-menu button:hover { background: #f5f4fd; }
@media (max-width: 720px) { .wtb-acct-btn .nm { display: none; } }
@media (max-width: 720px) { .wtb-nav > a[href="/lab"] { display: none; } .wtb-crumb-right > span { display: none; } }
`;
