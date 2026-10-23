'use client';

/**
 * 百业学院教务（2026-10-23）：申请管理 / 学员管理 / 学员培养 / 毕业生管理 / 课程。只给平方内部（登录且不是百业用户，proxy 拦）。
 * 两条路径：每个基础功能都能在这里人工点；教务 AI（院长 A）再把它们串起来。气质沿用学院官网（象牙 / 深蓝 / 金 / 衬线）。
 */
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { ADMIN_CSS, ROMAN } from './ui';

const NAV = [
  { href: '/college/admin/chat', t: '教务 AI · 院长 A', on: (p: string) => p.startsWith('/college/admin/chat') },
  { href: '/college/admin', t: '总览', on: (p: string) => p === '/college/admin' },
  { href: '/college/admin/applications', t: '申请管理 · 线索', on: (p: string) => p.startsWith('/college/admin/applications') },
  { href: '/college/admin/students', t: '学员管理', on: (p: string) => p.startsWith('/college/admin/students') },
  { href: '/college/admin/training', t: '学员培养', on: (p: string) => p.startsWith('/college/admin/training') },
  { href: '/college/admin/graduates', t: '毕业生管理', on: (p: string) => p.startsWith('/college/admin/graduates') },
  { href: '/college/admin/courses', t: '课程目录', on: (p: string) => p.startsWith('/college/admin/courses') },
];

export default function CollegeAdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '';
  const { user } = useUser();
  return (
    <div className="ca">
      <style>{ADMIN_CSS}</style>
      <aside className="ca-side">
        <div className="ca-brand"><span className="crest"><img src="/college/crest.svg" alt="院徽" /></span><div><b>百业学院</b><small>教务处 · REGISTRAR</small></div></div>
        <nav className="ca-nav">
          {NAV.map((x, i) => <Link key={x.href} href={x.href} className={x.on(path) ? 'on' : ''}><i>{i === 0 ? 'A' : i === 1 ? '◆' : ROMAN[i - 2]}</i>{x.t}</Link>)}
          <div className="sec">CAMPUS</div>
          <a href="/college" target="_blank" rel="noreferrer"><i>↗</i>学院官网</a>
          <a href="/lab/spaces" target="_blank" rel="noreferrer"><i>↗</i>百业工厂 · 造课程</a>
          <a href="/work/mine" target="_blank" rel="noreferrer"><i>↗</i>真活台 · 出考题</a>
        </nav>
        <div className="ca-deans">
          <div className="k">DEANS · 院长</div>
          <div className="ca-dean"><span className="seal">A</span><div>院长 A · 教务 AI<small>排课、监考、批改、分派</small></div></div>
          <div className="ca-dean"><span className="seal b">B</span><div>院长 B · {user?.email ? user.email.split('@')[0] : '你'}<small>定方向、拍板、见客户</small></div></div>
        </div>
        <div className="ca-side-foot">
          <div className="motto">学生是 AI，考的是真活<span>Where AI learns a craft — and earns its place at work.</span></div>
        </div>
      </aside>
      <main className="ca-main">{children}</main>
    </div>
  );
}
