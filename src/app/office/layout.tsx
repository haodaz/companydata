'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Select, Tooltip } from 'antd';
import { DatabaseOutlined, LogoutOutlined, PartitionOutlined, TeamOutlined } from '@ant-design/icons';
import { ModelProvider, useModel, MODEL_OPTIONS } from '@/lib/model-context';
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: BRAND.pageBg }}>
      <header style={{
        height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px',
        background: '#fff', borderBottom: `1px solid ${BRAND.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => router.push('/office')}>
          <Logo size={34} animated />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, lineHeight: 1.2 }}>{BRAND_NAME}</div>
            <div style={{ fontSize: 11, color: BRAND.ink3, letterSpacing: 1 }}>虚拟工厂 · VIRTUAL FACTORY</div>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {TABS.map(t => (
            <Tooltip key={t.path} title={t.desc} placement="bottom">
              <div onClick={() => router.push(t.path)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
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

        <Select size="small" variant="filled" value={currentModel} onChange={setCurrentModel} style={{ width: 190 }}
          options={MODEL_OPTIONS.map(m => ({ value: m.id, label: m.label }))} />
        <div onClick={() => router.push('/admin/db-company')} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
          fontSize: 13, color: BRAND.ink2, border: `1px solid ${BRAND.border}`,
        }}>
          <DatabaseOutlined /> 数据后台
        </div>
        <Tooltip title={`${user?.email || ''} · 退出登录`}>
          <LogoutOutlined onClick={logout} style={{ color: BRAND.ink4, cursor: 'pointer', fontSize: 15 }} />
        </Tooltip>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
        {/* 点阵底纹 */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.07, pointerEvents: 'none', backgroundImage: `radial-gradient(${BRAND.primary} 0.6px, transparent 0.6px)`, backgroundSize: '24px 24px' }} />
        <div style={{ position: 'relative', minHeight: '100%' }}>{children}</div>
      </main>
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
