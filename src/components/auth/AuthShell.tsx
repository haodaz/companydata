'use client';

import React from 'react';
import { Logo, BRAND_NAME } from '@/components/brand/Logo';
import { BRAND } from '@/lib/theme';

const HIGHLIGHTS = [
  { k: '7 位 AI 员工', v: '厂长排产，建名单、画像、寻源、抓取、提炼、质检各司其职' },
  { k: '从无到有', v: '一句话下达总任务，企业与岗位数据直接进入正式库' },
  { k: '聚焦校招', v: '中国企业 · 中外合资 · 海外百强的校招项目与实习' },
];

const MASK = 'radial-gradient(ellipse 62% 62% at 50% 50%, #000 72%, transparent 100%)';

/**
 * 登录 / 注册共用外壳。
 * 桌面：左侧 AI 工厂主视觉，右侧表单。
 * 手机：工厂主视觉铺在上半屏，表单是一张从下方盖上来的圆角卡片——打开就能看到工厂。
 * 纯 CSS 媒体查询切换，首屏不闪。
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="cd-auth">
      <style>{`
        @keyframes cd-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .cd-auth { min-height: 100vh; min-height: 100dvh; display: flex; background: #fff; }
        .cd-auth-hero {
          flex: 1 1 58%; position: relative; overflow: hidden; display: flex; flex-direction: column;
          padding: 36px 48px 40px; color: ${BRAND.ink};
          background: radial-gradient(90% 70% at 50% 45%, #eef2fc 0%, #ebeefd 40%, #e0dbff 100%);
        }
        .cd-auth-art { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 8px 0; overflow: hidden; }
        .cd-auth-art img { width: 112%; max-width: 920px; max-height: 100%; object-fit: contain; animation: cd-float 7s ease-in-out infinite; mask-image: ${MASK}; -webkit-mask-image: ${MASK}; }
        .cd-auth-headline { margin: 0; font-size: 30px; font-weight: 800; line-height: 1.35; letter-spacing: .5px; }
        .cd-auth-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 22px; max-width: 820px; }
        .cd-auth-form { flex: 1 1 42%; min-width: 360px; display: flex; align-items: center; justify-content: center; padding: 40px 24px; background: #fff; }
        .cd-auth-form-logo { margin-bottom: 18px; }

        @media (max-width: 960px) {
          .cd-auth { flex-direction: column; background: #e6e1ff; }
          .cd-auth-hero { flex: 0 0 auto; padding: calc(16px + env(safe-area-inset-top)) 20px 0; background: radial-gradient(120% 90% at 50% 30%, #f3f5ff 0%, #e9ebfd 45%, #d9d2ff 100%); }
          .cd-auth-art { flex: 0 0 auto; height: 31vh; min-height: 210px; max-height: 320px; padding: 0; margin: 0 -20px; }
          .cd-auth-art img { width: auto; height: 118%; max-width: none; max-height: none; }
          .cd-auth-headline { font-size: 20px; text-align: center; margin-top: -4px; padding-bottom: 38px; }
          .cd-auth-cards { display: none; }
          .cd-auth-form {
            flex: 1 1 auto; min-width: 0; align-items: flex-start; margin-top: -24px; position: relative; z-index: 2;
            border-radius: 26px 26px 0 0; padding: 24px 22px calc(24px + env(safe-area-inset-bottom));
            box-shadow: 0 -10px 40px rgba(76,65,217,0.16);
          }
          .cd-auth-form-logo { display: none !important; }
          .cd-auth-form .ant-form-item { margin-bottom: 16px; }
          .cd-auth-title { font-size: 22px !important; }
          .cd-auth-head { margin-bottom: 18px !important; }
        }
      `}</style>

      {/* 主视觉：一群 AI 在办公室里寻找全球企业数据 */}
      <section className="cd-auth-hero">
        <div style={{ position: 'absolute', inset: 0, opacity: 0.35, pointerEvents: 'none', backgroundImage: `radial-gradient(${BRAND.primary} 0.7px, transparent 0.7px)`, backgroundSize: '26px 26px', maskImage: 'linear-gradient(180deg, transparent, #000 40%, transparent)' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo size={42} animated />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>{BRAND_NAME}</div>
            <div style={{ fontSize: 11, color: BRAND.ink3, letterSpacing: 2 }}>AI ENTERPRISE DATA FACTORY</div>
          </div>
        </div>

        <div className="cd-auth-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/factory/login_hero.jpg" alt="AI 员工在数据工厂里寻找全球企业数据" />
        </div>

        <div style={{ position: 'relative' }}>
          <h1 className="cd-auth-headline">
            一群 AI 员工，<br />正在为你寻找<span style={{ background: BRAND.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>全球企业数据</span>
          </h1>
          <div className="cd-auth-cards">
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
      <section className="cd-auth-form">
        <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
          <div className="cd-auth-head" style={{ marginBottom: 28 }}>
            <Logo size={48} className="cd-auth-form-logo" />
            <h2 className="cd-auth-title" style={{ margin: 0, fontSize: 26, fontWeight: 800, color: BRAND.ink }}>{title}</h2>
            <div style={{ marginTop: 6, fontSize: 14, color: BRAND.ink3 }}>{subtitle}</div>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
