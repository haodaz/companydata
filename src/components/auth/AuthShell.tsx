'use client';

import React from 'react';
import { Logo, BRAND_NAME } from '@/components/brand/Logo';
import { BRAND } from '@/lib/theme';

const HIGHLIGHTS = [
  { k: '7 位 AI 员工', v: '厂长排产，建名单、画像、寻源、抓取、提炼、质检各司其职' },
  { k: '从无到有', v: '一句话下达总任务，企业与岗位数据直接进入正式库' },
  { k: '聚焦校招', v: '中国企业 · 中外合资 · 海外百强的校招项目与实习' },
];

/** 登录 / 注册共用外壳：左侧 AI 工厂主视觉，右侧表单 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#fff' }}>
      <style>{`
        @media (max-width: 960px) { .cd-auth-hero { display: none !important; } }
        @keyframes cd-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>

      {/* 主视觉：一群 AI 在办公室里寻找全球企业数据 */}
      <section className="cd-auth-hero" style={{
        flex: '1 1 58%', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        padding: '36px 48px 40px', color: BRAND.ink,
        background: 'radial-gradient(90% 70% at 50% 45%, #eef2fc 0%, #ebeefd 40%, #e0dbff 100%)',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none', backgroundImage: `radial-gradient(${BRAND.primary} 0.7px, transparent 0.7px)`, backgroundSize: '26px 26px', maskImage: 'linear-gradient(180deg, transparent, #000 40%, transparent)' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo size={42} animated />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>{BRAND_NAME}</div>
            <div style={{ fontSize: 11, color: BRAND.ink3, letterSpacing: 2 }}>AI ENTERPRISE DATA FACTORY</div>
          </div>
        </div>

        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/factory/login_hero.jpg" alt="AI 员工在数据工厂里寻找全球企业数据"
            style={{
              width: '112%', maxWidth: 920, maxHeight: '100%', objectFit: 'contain', animation: 'cd-float 7s ease-in-out infinite',
              // 羽化图片四周的底色，让插画「浮」在渐变背景上
              maskImage: 'radial-gradient(ellipse 62% 62% at 50% 50%, #000 72%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 62% 62% at 50% 50%, #000 72%, transparent 100%)',
            }} />
        </div>

        <div style={{ position: 'relative' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, lineHeight: 1.35, letterSpacing: 0.5 }}>
            一群 AI 员工，<br />正在为你寻找<span style={{ background: BRAND.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>全球企业数据</span>
          </h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 22, maxWidth: 820 }}>
            {HIGHLIGHTS.map(h => (
              <div key={h.k} style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(6px)', border: '1px solid rgba(96,85,245,0.14)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.primary }}>{h.k}</div>
                <div style={{ fontSize: 12, color: BRAND.ink2, lineHeight: 1.65, marginTop: 4 }}>{h.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 表单 */}
      <section style={{ flex: '1 1 42%', minWidth: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: '#fff' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <Logo size={48} style={{ marginBottom: 18 }} />
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: BRAND.ink }}>{title}</h2>
            <div style={{ marginTop: 6, fontSize: 14, color: BRAND.ink3 }}>{subtitle}</div>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
