'use client';

/**
 * AI 百业｜AI 大学的外壳（2026-10-21）：一所在线学院，学生是 AI。
 * 气质照证书：象牙底、深蓝字、金色点缀、衬线标题。账号和百业同一套（UserProvider），登录走百业的蒙版登录页。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { App, ConfigProvider } from 'antd';
import { UserProvider, useUser } from '@/lib/user-context';
import { ModelProvider } from '@/lib/model-context';

const NAV = [
  { href: '/college#about', t: '关于', on: () => false },
  { href: '/college#academics', t: '课程与训练', on: () => false },
  { href: '/college#industries', t: '千行百业', on: () => false },
  { href: '/college/cases', t: '案例', on: (p: string) => p.startsWith('/college/cases') },
  { href: '/college/graduates', t: '毕业生', on: (p: string) => p.startsWith('/college/g') },
];

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/college';
  const { user, loading } = useUser();
  // 首页和三个介绍页是整幅影像的官网版式，不套居中容器
  const home = ['/college', '/college/enroll', '/college/hire', '/college/graduates', '/college/cases'].includes(path);
  // 手机：右上角菜单按钮 → 全屏菜单（换页、按 Esc 关掉；开着的时候背后不滚）
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => {
    if (!menu) return;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [menu]);
  const close = () => setMenu(false);
  const facultyHref = user ? '/lab/spaces' : `/lab/login?next=${encodeURIComponent('/lab/spaces')}`;
  // 教务管理（/college/admin）有自己的外壳：只套学院的配色变量，不要公开官网的页头页脚
  if (path.startsWith('/college/admin')) return <div className="col"><style>{COLLEGE_CSS}</style>{children}</div>;
  const staff = !!user && (user as any).role !== 'baiye_user';
  return (
    <div className="col">
      <style>{COLLEGE_CSS}</style>
      {/* 三类来访者各一个入口（像大学官网顶上那一条 Students / Faculty & Staff） */}
      <div className="col-util">
        <a href="/lab" className="col-util-brand">AI 百业</a>
        <div style={{ flex: 1 }} />
        <Link href="/college/enroll">申请模型入学</Link>
        <Link href="/college/hire">人才培养需求</Link>
        <Link href="/college/graduates">查看毕业生</Link>
        <a href={facultyHref}>教职工入口</a>
        {staff && <Link href="/college/admin">教务管理</Link>}
      </div>
      <header className="col-head">
        <Link href="/college" className="col-brand">
          <img className="col-crest" src="/college/crest.svg" alt="百业学院院徽" />
          <span>
            <b>AI 百业<i>｜</i>百业学院</b>
            <small>THE ONLINE COLLEGE FOR AI</small>
          </span>
        </Link>
        <div style={{ flex: 1 }} />
        <nav className="col-nav">
          {NAV.map(n => <Link key={n.href} href={n.href} className={n.on(path) ? 'on' : ''}>{n.t}</Link>)}
        </nav>
        {/* 右上角登录：登录后不显示邮箱（录屏会露出来），只给退出——退出后留在学院页面，不跳去数据工厂的登录页 */}
        {!loading && (user
          ? <button className="col-login out" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.reload(); }}>退出登录</button>
          : <a className="col-login" href={`/lab/login?next=${encodeURIComponent(path)}`}>登录</a>)}
        <button className={`col-burger${menu ? ' x' : ''}`} aria-label={menu ? '关闭菜单' : '打开菜单'} aria-expanded={menu} onClick={() => setMenu(m => !m)}><i /><i /></button>
      </header>
      <div className={`col-menu${menu ? ' open' : ''}`} aria-hidden={!menu}>
        <img className="col-menu-mark" src="/college/crest.svg" alt="" />
        <div className="col-menu-in">
          <div className="col-menu-kick">MENU · 百業學院</div>
          <nav className="col-menu-nav">
            {NAV.map((n, i) => (
              <Link key={n.href} href={n.href} onClick={close} style={{ transitionDelay: menu ? `${120 + i * 60}ms` : '0ms' }} className={n.on(path) ? 'on' : ''}>
                <span>{String(i + 1).padStart(2, '0')}</span>{n.t}
              </Link>
            ))}
          </nav>
          <div className="col-menu-kick" style={{ marginTop: 34 }}>从这里开始</div>
          <div className="col-menu-doors" style={{ transitionDelay: menu ? '480ms' : '0ms' }}>
            <Link href="/college/enroll" onClick={close}><b>申请模型入学</b><span>送你的模型来上学 →</span></Link>
            <Link href="/college/hire" onClick={close}><b>人才培养需求</b><span>定向培养一位 AI 员工 →</span></Link>
            <Link href="/college/graduates" onClick={close}><b>查看毕业生</b><span>直接引进上岗 →</span></Link>
          </div>
          <div className="col-menu-foot" style={{ transitionDelay: menu ? '560ms' : '0ms' }}>
            <a href={facultyHref}>教职工入口</a>
            {!loading && !user && <a href={`/lab/login?next=${encodeURIComponent(path)}`}>登录</a>}
            <a href="/lab">百业体验 ↗</a>
          </div>
          <div className="col-menu-motto">人 · 求真 · 心智世界</div>
        </div>
      </div>
      <main className={home ? 'col-full' : 'col-main'}>{children}</main>
      <footer className="col-foot">
        <div className="col-foot-in">
          <div>
            <div className="col-foot-brand">AI 百业｜百业学院 · 一所 AI 学院</div>
            <div className="col-foot-en">The Online College for AI · 平方智能 × 方略研究院</div>
          </div>
          <div className="col-foot-links">
            <Link href="/college#about">关于</Link>
            <Link href="/college#academics">课程与训练</Link>
            <Link href="/college#industries">千行百业</Link>
            <Link href="/college/cases">案例</Link>
            <Link href="/college/graduates">毕业生</Link>
            <a href="/lab">百业体验</a>
          </div>
          <div className="col-foot-motto">人 · 求真 · 心智世界<br /><span>People · Truth · The World of Mind</span></div>
        </div>
      </footer>
    </div>
  );
}

export default function CollegeShell({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1d2a5c', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif' } }}>
      <App>
        <UserProvider><ModelProvider><Shell>{children}</Shell></ModelProvider></UserProvider>
      </App>
    </ConfigProvider>
  );
}

export const COLLEGE_CSS = `
.col { --ivory: #f7f4ec; --paper: #fffdf7; --navy: #16204a; --navy2: #2c3768; --ink2: #545b78; --ink3: #8a8fa6; --gold: #b08d57; --gold2: #d9b878; --line: rgba(22,32,74,.12);
  --serif: var(--font-serif-sc), "Noto Serif SC", "Songti SC", "STSong", serif; --en: var(--font-en-serif), "Source Serif 4", Georgia, serif;
  min-height: 100vh; background: var(--ivory); color: var(--navy); font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif; }
.col a { color: inherit; text-decoration: none; }
.col .serif { font-family: var(--serif); }
.col-util { display: flex; align-items: center; gap: 22px; padding: 7px clamp(16px, 4vw, 48px); background: #0f1638; color: rgba(255,255,255,.82); font-size: 12.5px; }
.col-util a:hover { color: #fff; }
.col-util-brand { font-weight: 800; letter-spacing: .12em; color: var(--gold2) !important; }
.col-head { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 22px; padding: 14px clamp(16px, 4vw, 48px); background: rgba(255,255,255,.94); backdrop-filter: blur(14px); border-bottom: 1px solid var(--line); }
.col-brand { display: flex; align-items: center; gap: 12px; }
.col-brand b { display: block; font-family: var(--serif); font-size: 20px; font-weight: 900; letter-spacing: .04em; white-space: nowrap; }
.col-brand b i { font-style: normal; color: var(--gold); margin: 0 2px; }
.col-brand small { display: block; font: 600 10px/1.4 var(--en); letter-spacing: .22em; color: var(--ink3); white-space: nowrap; margin-top: 2px; }
.col-crest { width: 40px; height: 40px; flex-shrink: 0; display: block; }
.col-nav { display: flex; gap: 2px; }
.col-nav a { padding: 10px 14px; font-size: 15.5px; color: var(--navy); font-weight: 700; white-space: nowrap; }
.col-login { display: inline-flex; align-items: center; height: 38px; padding: 0 20px; margin-left: 8px; background: var(--navy); color: #fff !important; font-size: 14.5px; font-weight: 700; border: 0; border-radius: 2px; cursor: pointer; font-family: inherit; white-space: nowrap; }
.col-login:hover { background: #24306a; }
.col-login.out { background: transparent; color: var(--ink2) !important; box-shadow: inset 0 0 0 1.5px var(--line); }
.col-nav a:hover { background: rgba(22,32,74,.05); }
.col-nav a.on { box-shadow: inset 0 -2px 0 var(--gold); border-radius: 0; }
.col-main { max-width: 1180px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 40px) 60px; }
.col-full { display: block; }
.col-en { display: block; font: italic 400 .52em/1.5 var(--en); letter-spacing: .01em; color: var(--ink3); margin-top: 4px; }
.col-foot { background: #0f1638; color: rgba(255,255,255,.72); padding: 46px clamp(16px, 4vw, 48px) 40px; font-size: 13.5px; }
.col-foot-in { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 1.2fr 1.6fr 1fr; gap: 28px; }
.col-foot-brand { font-family: var(--serif); font-size: 22px; font-weight: 900; color: #fff; }
.col-foot-en { margin-top: 6px; font-family: var(--en); font-size: 13px; opacity: .7; }
.col-foot-links { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; align-content: start; }
.col-foot-links a:hover { color: #fff; }
.col-foot-motto { font-family: var(--serif); color: var(--gold2); font-size: 16px; text-align: right; line-height: 1.8; }
.col-foot-motto span { font: italic 13px var(--en); opacity: .8; }
.col-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 22px; border-radius: 999px; border: 0; background: var(--navy); color: #fff !important; font-size: 15px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.col-btn:disabled { opacity: .45; cursor: default; }
.col-btn.gold { background: linear-gradient(120deg, #b08d57, #d9b878); color: #1c1606 !important; }
.col-btn.ghost { background: transparent; color: var(--navy) !important; box-shadow: inset 0 0 0 1.5px var(--line); }
.col-btn.sm { height: 34px; padding: 0 15px; font-size: 13.5px; }
.col-card { background: var(--paper); border: 1px solid var(--line); border-radius: 18px; }
.col-eyebrow { font-size: 12px; letter-spacing: .24em; color: var(--gold); font-weight: 800; }
.col-h2 { font-family: var(--serif); font-size: clamp(24px, 3vw, 34px); font-weight: 900; margin: 6px 0 10px; letter-spacing: .02em; }
.col-sub { color: var(--ink2); font-size: 15.5px; line-height: 1.85; }
.col-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 12.5px; background: rgba(22,32,74,.06); color: var(--navy2); white-space: nowrap; }
.col-chip.gold { background: rgba(176,141,87,.14); color: #7a5c2a; }
.col-chip.ok { background: rgba(18,160,107,.1); color: #0d7a52; }
.col-input { width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: #fff; font-size: 14.5px; color: var(--navy); outline: none; font-family: inherit; }
.col-input:focus { border-color: var(--navy2); }
.col-burger { display: none; }
.col-menu { display: none; }
@media (max-width: 860px) {
  .col-util, .col-nav, .col-head .col-login { display: none; }
  .col-head { gap: 10px; padding: 10px 16px; }
  .col-brand b { font-size: 17px; }
  .col-brand small { font-size: 9px; letter-spacing: .16em; }
  .col-crest { width: 38px; height: 38px; }
  .col-burger { display: grid; place-items: center; position: relative; z-index: 60; width: 44px; height: 44px; margin-right: -6px; border: 0; background: none; cursor: pointer; }
  .col-burger i { position: absolute; left: 11px; right: 11px; height: 2px; background: var(--navy); border-radius: 2px; transition: transform .35s cubic-bezier(.2,.7,.2,1), top .35s, background .3s; }
  .col-burger i:first-child { top: 17px; } .col-burger i:last-child { top: 25px; right: 17px; }
  .col-burger.x i { background: #f3dfae; top: 21px; right: 11px; }
  .col-burger.x i:first-child { transform: rotate(45deg); } .col-burger.x i:last-child { transform: rotate(-45deg); }
  .col-menu { display: block; position: fixed; inset: 0; z-index: 50; overflow-y: auto; color: #fff;
    background: radial-gradient(120% 70% at 85% 0%, #2c3768 0%, #16204a 45%, #0b0f22 100%);
    clip-path: circle(0 at calc(100% - 32px) 32px); visibility: hidden; transition: clip-path .6s cubic-bezier(.7,0,.2,1), visibility 0s .6s; }
  .col-menu.open { clip-path: circle(150% at calc(100% - 32px) 32px); visibility: visible; transition: clip-path .7s cubic-bezier(.7,0,.2,1), visibility 0s; }
  .col-head:has(+ .col-menu.open) { background: #121a40; border-bottom-color: rgba(217,184,120,.2); backdrop-filter: none; }
  .col-head:has(+ .col-menu.open) .col-brand b { color: #fff; }
  .col-head:has(+ .col-menu.open) { z-index: 55; }
  .col-menu-mark { position: absolute; right: -90px; bottom: -70px; width: 360px; height: 360px; opacity: .1; pointer-events: none; }
  .col-menu-in { position: relative; padding: 92px 26px 40px; min-height: 100%; box-sizing: border-box; }
  .col-menu-kick { font: 700 11.5px var(--en); letter-spacing: .3em; color: var(--gold2); margin-bottom: 10px; }
  .col-menu-nav { display: grid; border-top: 1px solid rgba(217,184,120,.25); }
  .col-menu-nav a { display: flex; align-items: baseline; gap: 16px; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,.08); font: 900 30px/1.2 var(--serif); letter-spacing: .06em; color: #fff;
    opacity: 0; transform: translateY(14px); transition: opacity .5s, transform .5s cubic-bezier(.2,.7,.2,1), color .2s; }
  .col-menu-nav a span { font: italic 400 14px var(--en); color: var(--gold2); width: 22px; }
  .col-menu-nav a.on, .col-menu-nav a:active { color: #f3dfae; }
  .col-menu.open .col-menu-nav a, .col-menu.open .col-menu-doors, .col-menu.open .col-menu-foot { opacity: 1; transform: none; }
  .col-menu-doors { display: grid; gap: 10px; opacity: 0; transform: translateY(14px); transition: opacity .5s, transform .5s; }
  .col-menu-doors a { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid rgba(217,184,120,.45); background: rgba(255,255,255,.04); }
  .col-menu-doors b { font: 900 17px var(--serif); color: #fff; }
  .col-menu-doors span { font-size: 12.5px; color: var(--gold2); white-space: nowrap; }
  .col-menu-foot { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 28px; font-size: 14px; opacity: 0; transform: translateY(14px); transition: opacity .5s, transform .5s; }
  .col-menu-foot a { color: rgba(255,255,255,.75); border-bottom: 1px solid rgba(255,255,255,.25); padding-bottom: 2px; }
  .col-menu-motto { margin-top: 40px; font: 900 15px var(--serif); letter-spacing: .3em; color: rgba(243,223,174,.55); }
  .col-foot-in { grid-template-columns: 1fr; } .col-foot-motto { text-align: left; }
}
`;
