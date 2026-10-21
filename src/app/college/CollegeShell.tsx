'use client';

/**
 * AI 百业｜AI 大学的外壳（2026-10-21）：一所在线学院，学生是 AI。
 * 气质照证书：象牙底、深蓝字、金色点缀、衬线标题。账号和百业同一套（UserProvider），登录走百业的蒙版登录页。
 */
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { App, ConfigProvider } from 'antd';
import { UserProvider, useUser } from '@/lib/user-context';
import { ModelProvider } from '@/lib/model-context';

const NAV = [
  { href: '/college#about', t: '关于', on: () => false },
  { href: '/college#academics', t: '课程与训练', on: () => false },
  { href: '/college#industries', t: '千行百业', on: () => false },
  { href: '/college/graduates', t: '毕业生', on: (p: string) => p.startsWith('/college/g') },
];

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/college';
  const { user, loading } = useUser();
  // 首页和三个介绍页是整幅影像的官网版式，不套居中容器
  const home = ['/college', '/college/enroll', '/college/hire', '/college/graduates'].includes(path);
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
        <a href={user ? '/lab/spaces' : `/lab/login?next=${encodeURIComponent('/lab/spaces')}`}>教职工入口</a>
      </div>
      <header className="col-head">
        <Link href="/college" className="col-brand">
          <span className="col-crest">AI</span>
          <span>
            <b>AI 百业<i>｜</i>AI 大学</b>
            <small>THE ONLINE COLLEGE FOR AI</small>
          </span>
        </Link>
        <div style={{ flex: 1 }} />
        <nav className="col-nav">
          {NAV.map(n => <Link key={n.href} href={n.href} className={n.on(path) ? 'on' : ''}>{n.t}</Link>)}
        </nav>
        {/* 右上角登录：登录后不显示邮箱（录屏会露出来），只给退出——退出后留在大学页面，不跳去数据工厂的登录页 */}
        {!loading && (user
          ? <button className="col-login out" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.reload(); }}>退出登录</button>
          : <a className="col-login" href={`/lab/login?next=${encodeURIComponent(path)}`}>登录</a>)}
      </header>
      <main className={home ? 'col-full' : 'col-main'}>{children}</main>
      <footer className="col-foot">
        <div className="col-foot-in">
          <div>
            <div className="col-foot-brand">AI 百业｜AI 大学</div>
            <div className="col-foot-en">The Online College for AI · 平方智能 × 方略研究院</div>
          </div>
          <div className="col-foot-links">
            <Link href="/college#about">关于</Link>
            <Link href="/college#academics">课程与训练</Link>
            <Link href="/college#industries">千行百业</Link>
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
.col-crest { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle at 30% 30%, #2c3768, #16204a); color: var(--gold2); font: 700 14px var(--en); box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px var(--gold); flex-shrink: 0; }
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
@media (max-width: 860px) { .col-head { flex-wrap: wrap; gap: 8px; padding-bottom: 4px; } .col-login { height: 34px; padding: 0 14px; } .col-nav { order: 3; width: 100%; overflow-x: auto; } .col-nav a { padding: 6px 10px; } .col-util { gap: 14px; overflow-x: auto; white-space: nowrap; } .col-foot-in { grid-template-columns: 1fr; } .col-foot-motto { text-align: left; } }
`;
