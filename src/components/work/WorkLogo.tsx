'use client';

/**
 * 百业AI｜真活 的 logo：图形 = 渐变圆角方块里一个「真」字风格的印章感标记（一横一竖一勾：活是干出来的），
 * 文字 = 百业AI｜真活 + 英文口号 TRUE WORK, TRUE TALENT（用户 10-18 定的）。
 * size: lg 首页顶栏 / md 内页顶栏 / sm 登录卡片等
 */
import React from 'react';
import Link from 'next/link';

export function WorkMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs><linearGradient id="wkg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6055f5" /><stop offset="1" stopColor="#12b5cb" /></linearGradient></defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#wkg)" />
      {/* 工位台面 + 一只落下的手：看他干 */}
      <path d="M12 33 H36" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M16 33 V21 a8 8 0 0 1 16 0 V33" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24 13 V9" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="24" cy="26" r="3" fill="#fff" />
      <path d="M33 14 l4 4 l7 -7" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity=".95" />
    </svg>
  );
}

export function WorkLogo({ size = 'md', href = '/work', dark }: { size?: 'lg' | 'md' | 'sm'; href?: string | null; dark?: boolean }) {
  const S = size === 'lg' ? { mark: 44, name: 24, cap: 10.5, gap: 12 } : size === 'md' ? { mark: 32, name: 18, cap: 9, gap: 10 } : { mark: 28, name: 16, cap: 8.5, gap: 8 };
  const ink = dark ? '#fff' : '#1a1a2e', sub = dark ? 'rgba(255,255,255,.7)' : '#6b6f86';
  const body = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: S.gap, textDecoration: 'none', color: ink }}>
      <WorkMark size={S.mark} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span style={{ fontSize: S.name, fontWeight: 900, letterSpacing: 1 }}>百业AI<span style={{ color: '#6055f5', fontWeight: 400, margin: '0 1px' }}>｜</span>真活</span>
        <span style={{ fontSize: S.cap, letterSpacing: 2.2, color: sub, fontWeight: 700, marginTop: 3, fontFamily: 'ui-monospace, Menlo, monospace' }}>TRUE WORK, TRUE TALENT</span>
      </span>
    </span>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{body}</Link> : body;
}
