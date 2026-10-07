'use client';
/**
 * 系统账号管理 · 数据下载许可：待审批的申请在前（批准 / 拒绝），已批准的可以收回。
 * 审批后发 download-requests:changed 事件，侧导航红点随之刷新。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Table, Tag, Button, Space, Typography, Popconfirm, Input, Segmented } from 'antd';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;

type Req = { id: number; user_id: string; email: string; status: string; reason?: string | null; requested_at: string; decided_at?: string | null; note?: string | null };

const fmt = (s?: string | null) => s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '—';
const STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审批' },
  approved: { color: 'green', label: '已批准' },
  rejected: { color: 'default', label: '已拒绝' },
  revoked: { color: 'default', label: '已收回' },
};

export default function DownloadRequestsCard({ onPendingChange }: { onPendingChange?: (n: number) => void }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'open' | 'all'>('open');
  const [note, setNote] = useState('');
  const { message } = App.useApp();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch('/api/admin/download-requests', { cache: 'no-store' }).then(r => r.json());
      if (j.ok) setRows(j.data); else message.error(j.error || '加载失败');
    } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const act = async (r: Req, action: 'approve' | 'reject' | 'revoke') => {
    const j = await fetch(`/api/admin/download-requests/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note: note || undefined }),
    }).then(x => x.json());
    if (j.ok) {
      message.success(action === 'approve' ? '已批准，对方现在可以下载' : action === 'reject' ? '已拒绝' : '已收回下载许可');
      setNote('');
      load();
      window.dispatchEvent(new Event('download-requests:changed'));
    } else message.error(j.error || '操作失败');
  };

  const pending = rows.filter(r => r.status === 'pending').length;
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);
  const data = view === 'open' ? rows.filter(r => r.status === 'pending' || r.status === 'approved') : rows;

  const columns = [
    { title: '申请人', dataIndex: 'email', render: (v: string) => <span style={{ fontWeight: 600 }}>{v || '—'}</span> },
    { title: '理由', dataIndex: 'reason', render: (v: string) => v ? <Text style={{ fontSize: 13 }}>{v}</Text> : <Text type="secondary">—</Text> },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: string) => <Tag color={STATUS[v]?.color}>{STATUS[v]?.label || v}</Tag> },
    { title: '申请时间', dataIndex: 'requested_at', width: 170, render: (v: string) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: '处理', key: 'ops', width: 200, render: (_: any, r: Req) => r.status === 'pending' ? (
      <Space size={4}>
        <Button size="small" type="primary" onClick={() => act(r, 'approve')}>批准</Button>
        <Popconfirm title="拒绝这条申请？" okText="拒绝" cancelText="取消" onConfirm={() => act(r, 'reject')}
          description={<Input size="small" placeholder="理由（选填，对方能看到）" value={note} onChange={e => setNote(e.target.value)} />}>
          <Button size="small">拒绝</Button>
        </Popconfirm>
      </Space>
    ) : r.status === 'approved' ? (
      <Popconfirm title="收回下载许可？" description="收回后对方 1 分钟内不能再下载" okText="收回" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => act(r, 'revoke')}>
        <Button size="small" danger>收回</Button>
      </Popconfirm>
    ) : <Text type="secondary" style={{ fontSize: 12 }}>{fmt(r.decided_at)}{r.note ? ` · ${r.note}` : ''}</Text> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderBottom: `1px solid ${BRAND.borderSoft}` }}>
        <Segmented size="small" value={view} onChange={v => setView(v as any)} options={[{ value: 'open', label: '待审批 / 已批准' }, { value: 'all', label: '全部记录' }]} />
        <span style={{ fontSize: 12, color: BRAND.ink3 }}>管理员随时可以下载；普通用户点下载时向管理员申请，批准后即可下载，随时可以收回。</span>
      </div>
      <Table rowKey="id" loading={loading} dataSource={data} columns={columns} pagination={false} size="middle"
        locale={{ emptyText: view === 'open' ? '暂无待审批的申请' : '暂无记录' }} />
    </div>
  );
}
