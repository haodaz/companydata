'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Select, Tooltip } from 'antd';
import { DatabaseOutlined, LogoutOutlined, PartitionOutlined, TeamOutlined } from '@ant-design/icons';
import { ModelProvider, useModel, MODEL_OPTIONS, ModelBadge } from '@/lib/model-context';
import { UserProvider, useUser } from '@/lib/user-context';
import { BRAND } from '@/lib/theme';
import { Logo, BRAND_NAME } from '@/components/brand/Logo';

const TABS = [
  { path: '/office', label: '生产线', icon: <PartitionOutlined />, desc: '下达总任务，AI 员工按工序协作' },
  { path: '/office/employees', label: 'AI 员工', icon: <TeamOutlined />, desc: '和单个 AI 员工对话，让它单独干活' },
];

function OfficeShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useUser();
  const { currentModel, setCurrentModel } = useModel();
  const active = pathname.startsWith('/office/employees') ? '/office/employees' : '/office';

  return (
    <div className="cd-office" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: BRAND.pageBg }}>
      <style>{`
        .cd-office-header { height: 60px; gap: 20px; padding: 0 24px; }
        .cd-office-tabbar { display: none; }
        @media (max-width: 768px) {
          .cd-office-header { height: calc(52px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 14px 0; gap: 10px; }
          .cd-office-sub, .cd-office-nav, .cd-office-admin, .cd-office-logout { display: none !important; }
          .cd-office-model { width: 132px !important; }
          .cd-office-tabbar {
            display: grid; grid-template-columns: repeat(3, 1fr); flex-shrink: 0; background: #fff;
            border-top: 1px solid ${BRAND.border}; padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
          }
        }
      `}</style>

      <header className="cd-office-header" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', background: '#fff', borderBottom: `1px solid ${BRAND.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }} onClick={() => router.push('/office')}>
          <Logo size={32} animated />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{BRAND_NAME}</div>
            <div className="cd-office-sub" style={{ fontSize: 11, color: BRAND.ink3, letterSpacing: 1, whiteSpace: 'nowrap' }}>虚拟工厂 · VIRTUAL FACTORY</div>
          </div>
        </div>

        <nav className="cd-office-nav" style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {TABS.map(t => (
            <Tooltip key={t.path} title={t.desc} placement="bottom">
              <div onClick={() => router.push(t.path)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap',
                fontSize: 14, fontWeight: active === t.path ? 700 : 500,
                color: active === t.path ? BRAND.primary : BRAND.ink2,
                background: active === t.path ? BRAND.primarySoft : 'transparent',
              }}>
                {t.icon}{t.label}
              </div>
            </Tooltip>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <Select className="cd-office-model" size="small" variant="filled" value={currentModel} onChange={setCurrentModel} style={{ width: 190 }}
          popupMatchSelectWidth={250} options={MODEL_OPTIONS.map(m => ({ value: m.id, label: <span>{m.label}<ModelBadge text={m.badge} /></span> }))} />
        <div className="cd-office-admin" onClick={() => router.push('/admin/db-company')} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
          fontSize: 13, color: BRAND.ink2, border: `1px solid ${BRAND.border}`,
        }}>
          <DatabaseOutlined /> 数据后台
        </div>
        <Tooltip title={`${user?.email || ''} · 退出登录`}>
          <LogoutOutlined className="cd-office-logout" onClick={logout} style={{ color: BRAND.ink4, cursor: 'pointer', fontSize: 15 }} />
        </Tooltip>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative', WebkitOverflowScrolling: 'touch' }}>
        {/* 点阵底纹 */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.07, pointerEvents: 'none', backgroundImage: `radial-gradient(${BRAND.primary} 0.6px, transparent 0.6px)`, backgroundSize: '24px 24px' }} />
        <div style={{ position: 'relative', minHeight: '100%' }}>{children}</div>
      </main>

      {/* 手机底部导航 */}
      <nav className="cd-office-tabbar">
        {[...TABS, { path: '/admin/db-company', label: '数据后台', icon: <DatabaseOutlined /> }].map(t => {
          const on = active === t.path;
          return (
            <div key={t.path} onClick={() => router.push(t.path)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0', color: on ? BRAND.primary : BRAND.ink3, fontWeight: on ? 700 : 500 }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
              <span style={{ fontSize: 11 }}>{t.label}</span>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ModelProvider>
        <OfficeShell>{children}</OfficeShell>
      </ModelProvider>
    </UserProvider>
  );
}
