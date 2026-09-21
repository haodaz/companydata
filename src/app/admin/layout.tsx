'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ApiOutlined, UserOutlined, SwapOutlined, DownOutlined, GlobalOutlined, LogoutOutlined, LinkOutlined, BankOutlined, ReadOutlined, FileSearchOutlined, FileTextOutlined, BarChartOutlined, SafetyCertificateOutlined, MenuOutlined } from '@ant-design/icons';
import { ModelProvider, useModel, MODEL_OPTIONS, ModelBadge } from '@/lib/model-context';
import { UserProvider, useUser } from '@/lib/user-context';
import { BRAND } from '@/lib/theme';
import { Logo, BRAND_NAME, BRAND_TAGLINE } from '@/components/brand/Logo';

const PRIMARY = BRAND.primary;

type NavItem = { key: string; icon: React.ReactNode; label: string; path: string; group: string };

const NAV_GROUPS = ['采集工具', '数据资产', '运行日志', '系统'];

const NAV: NavItem[] = [
  { key: 'tool-url',     icon: <GlobalOutlined />,     label: 'URL 获取工具',  path: '/admin/tool-url',     group: '采集工具' },
  { key: 'tool-job',     icon: <ApiOutlined />,        label: '校招岗位提取',  path: '/admin/tool-job',     group: '采集工具' },
  { key: 'db-company',   icon: <BankOutlined />,       label: '企业实体库',    path: '/admin/db-company',   group: '数据资产' },
  { key: 'db-job',       icon: <ReadOutlined />,       label: '校招岗位库',    path: '/admin/db-job',       group: '数据资产' },
  { key: 'db-url',       icon: <LinkOutlined />,       label: '信息源库',      path: '/admin/db-url',       group: '数据资产' },
  { key: 'journal-url',  icon: <FileSearchOutlined />, label: 'URL 日志',      path: '/admin/journal-url',  group: '运行日志' },
  { key: 'journal-job',  icon: <FileTextOutlined />,   label: '岗位爬取日志',  path: '/admin/journal-job',  group: '运行日志' },
  { key: 'token-usage',  icon: <BarChartOutlined />,   label: 'Token 用量',    path: '/admin/token-usage',  group: '系统' },
];

/* ── 模型切换下拉 ── */
function ModelSwitcher() {
  const { currentModel, setCurrentModel, modelLabel } = useModel();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
          borderRadius: 8, cursor: 'pointer', fontSize: 12,
          background: open ? 'rgba(96,85,245,0.06)' : 'transparent',
          color: BRAND.ink2, transition: 'all 0.15s',
          border: `1px solid ${BRAND.border}`,
        }}
      >
        <SwapOutlined style={{ fontSize: 13, color: PRIMARY }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {modelLabel}
        </span>
        <DownOutlined style={{ fontSize: 9, color: '#aaa', transform: open ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }} />
      </div>

      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: -100,
          marginBottom: 4, background: '#fff', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: `1px solid ${BRAND.border}`,
          maxHeight: 280, overflowY: 'auto', zIndex: 100,
        }}>
          {MODEL_OPTIONS.map(m => {
            const providerColor = m.provider === 'OpenAI' ? '#10a37f' : '#4285f4';
            return (
            <div key={m.id}
              onClick={() => { setCurrentModel(m.id); setOpen(false); }}
              style={{
                padding: '9px 12px', fontSize: 12, cursor: 'pointer',
                background: currentModel === m.id ? BRAND.primarySoft : 'transparent',
                color: currentModel === m.id ? PRIMARY : BRAND.ink2,
                fontWeight: currentModel === m.id ? 600 : 400,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (currentModel !== m.id) e.currentTarget.style.background = '#f8f8fa'; }}
              onMouseLeave={e => { if (currentModel !== m.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: providerColor, flexShrink: 0 }} />
                {m.label}
                <ModelBadge text={m.badge} />
              </div>
              <div style={{ fontSize: 10, color: '#bbb', marginTop: 1, paddingLeft: 13 }}>{m.provider} · {m.modelName}</div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`pc-nav-item${active ? ' pc-nav-active' : ''}`}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
        background: active ? BRAND.primarySoft : 'transparent',
        color: active ? PRIMARY : BRAND.ink2,
        fontWeight: active ? 600 : 400,
        fontSize: 13, transition: 'background 0.15s, color 0.15s',
      }}>
      {active && <span style={{ position: 'absolute', left: -8, top: 8, bottom: 8, width: 3, borderRadius: 2, background: PRIMARY }} />}
      <span style={{ fontSize: 15, display: 'flex', opacity: active ? 1 : 0.8 }}>{item.icon}</span>
      {item.label}
    </div>
  );
}

/* ── 主布局 ── */
function AdminLayoutGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useUser();
  const [isInIframe, setIsInIframe] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // 切换页面后收起手机抽屉
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    // Detect if we're rendered inside an iframe (e.g., Drawer preview)
    try { setIsInIframe(window.self !== window.top); } catch { setIsInIframe(true); }
  }, []);

  const NAV_WITH_AUTH: NavItem[] = [
    ...NAV,
    ...(user?.role === 'admin' ? [{ key: 'system-users', icon: <SafetyCertificateOutlined />, label: '系统账号管理', path: '/admin/system-users', group: '系统' }] : []),
  ];

  // 按路径长度降序匹配，避免短路径先被命中
  const activeKey = [...NAV_WITH_AUTH].sort((a, b) => b.path.length - a.path.length)
    .find(n => pathname.startsWith(n.path))?.key;

  // If in iframe, render content only (no sidebar, no header)
  if (isInIframe) {
    return (
      <div style={{ background: BRAND.pageBg, minHeight: '100vh', padding: 16 }}>
        {children}
      </div>
    );
  }

  return (
    <div className="cd-admin" style={{ display: 'flex', height: '100dvh', background: BRAND.pageBg }}>
      <style>{`
        .pc-nav-item:not(.pc-nav-active):hover { background: #f5f5fb !important; color: ${BRAND.ink} !important; }
        .cd-topbar, .cd-side-mask { display: none; }
        .cd-content { padding: 24px 28px; }
        /* 手机：侧栏收成抽屉，顶部出汉堡菜单 */
        @media (max-width: 768px) {
          .cd-admin { flex-direction: column; }
          .cd-topbar {
            display: flex; align-items: center; gap: 10px; flex-shrink: 0; height: calc(52px + env(safe-area-inset-top));
            padding: env(safe-area-inset-top) 12px 0; background: #fff; border-bottom: 1px solid ${BRAND.border};
          }
          .cd-side {
            position: fixed; z-index: 1001; top: 0; bottom: 0; left: 0; width: 264px !important; max-width: 82vw;
            transform: translateX(-105%); transition: transform .25s ease; box-shadow: 8px 0 32px rgba(20,22,40,.18);
            padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);
          }
          .cd-side.cd-open { transform: translateX(0); }
          .cd-side-mask.cd-open { display: block; position: fixed; inset: 0; z-index: 1000; background: rgba(20,22,40,.42); }
          .cd-content { padding: 14px 12px calc(24px + env(safe-area-inset-bottom)); }
        }
      `}</style>

      {/* 手机顶栏 */}
      <div className="cd-topbar">
        <div onClick={() => setMenuOpen(true)} aria-label="打开菜单" role="button"
          style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: BRAND.ink2, background: '#f5f6fa' }}>
          <MenuOutlined />
        </div>
        <Logo size={28} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: BRAND.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {NAV_WITH_AUTH.find(n => n.key === activeKey)?.label || BRAND_NAME}
        </div>
        <div onClick={() => router.push('/office')} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: BRAND.gradient }}>虚拟工厂</div>
      </div>
      <div className={`cd-side-mask${menuOpen ? ' cd-open' : ''}`} onClick={() => setMenuOpen(false)} />

      {/* 左侧导航 */}
      <div className={`cd-side${menuOpen ? ' cd-open' : ''}`} style={{
        width: 216, flexShrink: 0, background: '#fff',
        borderRight: `1px solid ${BRAND.border}`,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 品牌 */}
        <div style={{ padding: '18px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={38} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, lineHeight: 1.2 }}>{BRAND_NAME}</div>
            <div style={{ fontSize: 11, color: BRAND.ink3, marginTop: 2, letterSpacing: 0.3 }}>{BRAND_TAGLINE}</div>
          </div>
        </div>

        {/* 虚拟工厂入口 */}
        <div style={{ padding: '0 12px 6px 16px' }}>
          <div onClick={() => router.push('/office')} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
            background: BRAND.gradient, color: '#fff', boxShadow: '0 4px 12px rgba(96,85,245,0.25)',
          }}>
            <img src="/factory/pixel_nexus.png" alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', imageRendering: 'pixelated', border: '2px solid rgba(255,255,255,0.5)' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>进入虚拟工厂</div>
              <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>给 AI 员工下达总任务</div>
            </div>
          </div>
        </div>

        {/* 导航项（分组） */}
        <div style={{ padding: '4px 12px 8px 16px', flex: 1, overflowY: 'auto' }}>
          {NAV_GROUPS.map(group => {
            const items = NAV_WITH_AUTH.filter(n => n.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: BRAND.ink4, fontWeight: 500, padding: '10px 12px 6px', letterSpacing: 1 }}>{group}</div>
                {items.map(item => (
                  <NavLink key={item.key} item={item} active={activeKey === item.key} onClick={() => router.push(item.path)} />
                ))}
              </div>
            );
          })}
        </div>

        {/* 底部：模型切换 + 用户信息 */}
        <div style={{ padding: '12px 12px', borderTop: `1px solid ${BRAND.borderSoft}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ModelSwitcher />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: BRAND.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              color: PRIMARY, fontSize: 13, fontWeight: 700,
            }}>
              {user?.email ? user.email.slice(0, 1).toUpperCase() : <UserOutlined style={{ fontSize: 13 }} />}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: BRAND.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email?.split('@')[0] || '用户'}
                {user?.role === 'admin' && <span style={{ fontSize: 10, color: PRIMARY, background: BRAND.primarySoft, borderRadius: 4, padding: '0 5px', marginLeft: 6, fontWeight: 500 }}>管理员</span>}
              </div>
              <div style={{ fontSize: 10, color: BRAND.ink4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || '加载中…'}
              </div>
            </div>
            <div
              onClick={logout}
              title="退出登录"
              style={{ cursor: 'pointer', color: BRAND.ink4, padding: 4, borderRadius: 4, transition: 'color 0.15s', display: 'flex' }}
              onMouseEnter={e => (e.currentTarget.style.color = BRAND.danger)}
              onMouseLeave={e => (e.currentTarget.style.color = BRAND.ink4)}
            >
              <LogoutOutlined style={{ fontSize: 14 }} />
            </div>
          </div>
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="cd-content" style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ModelProvider>
        <AdminLayoutGuard>{children}</AdminLayoutGuard>
      </ModelProvider>
    </UserProvider>
  );
}
