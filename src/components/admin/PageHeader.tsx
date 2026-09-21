'use client';

import React from 'react';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { BRAND } from '@/lib/theme';

interface PageHeaderProps {
  title: React.ReactNode;
  /** 一句话说明这个页面做什么 */
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** 右侧操作区 */
  extra?: React.ReactNode;
  /** 标题旁的小标签，如数量、状态 */
  tags?: React.ReactNode;
  onBack?: () => void;
  style?: React.CSSProperties;
}

/** 所有后台页面统一的页头：图标 + 标题 + 说明 + 右侧操作 */
export function PageHeader({ title, description, icon, extra, tags, onBack, style }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, marginBottom: 20, flexWrap: 'wrap', ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {onBack && (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ color: BRAND.ink3, marginRight: -4 }} />
        )}
        {icon && (
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: BRAND.primarySoft, color: BRAND.primary, fontSize: 19,
          }}>
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: BRAND.ink, letterSpacing: 0.2, lineHeight: 1.3 }}>
              {title}
            </h1>
            {tags}
          </div>
          {description && (
            <div style={{ fontSize: 13, color: BRAND.ink3, marginTop: 3, lineHeight: 1.5 }}>{description}</div>
          )}
        </div>
      </div>
      {extra && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{extra}</div>}
    </div>
  );
}

/** 页面内的白色面板 */
export function Panel({ children, style, padding = 20 }: { children: React.ReactNode; style?: React.CSSProperties; padding?: number | string }) {
  return (
    <div style={{
      background: BRAND.surface, borderRadius: BRAND.radiusLg,
      border: `1px solid ${BRAND.border}`, boxShadow: BRAND.shadow,
      padding, ...style,
    }}>
      {children}
    </div>
  );
}
