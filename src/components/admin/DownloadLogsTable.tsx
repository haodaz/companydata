'use client';
/** 系统账号管理 · 下载记录：谁、什么时候、下载了什么（服务端导出接口 + 浏览器端生成的文件） */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Table, Tag, Typography, Button, Space, Input } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;
type Log = { id: number; user_id: string | null; email: string | null; role: string | null; target: string; params: Record<string, any> | null; via: 'server' | 'client'; ip: string | null; created_at: string };

const fmt = (s: string) => new Date(s).toLocaleString('zh-CN', { hour12: false });
/** 接口路径 → 人话 */
const TARGET_LABEL: Record<string, string> = {
  '/api/db/jobs': '校招岗位库 CSV（全量）',
};
/** 企业报告 PDF / PNG 的接口路径带企业 id，按前缀认 */
const targetLabel = (t: string) =>
  TARGET_LABEL[t] || (/^\/api\/db\/companies\/[^/]+\/report-pdf$/.test(t) ? '企业深度报告 PDF / PNG' : t);
const paramText = (p: Record<string, any> | null) => {
  if (!p) return '';
  const { format, page, ...rest } = p;
  return Object.entries(rest).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(' · ');
};

export default function DownloadLogsTable() {
  const [rows, setRows] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const { message } = App.useApp();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch('/api/admin/download-logs?limit=500', { cache: 'no-store' }).then(r => r.json());
      if (j.ok) setRows(j.data); else message.error(j.error || '加载失败');
    } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const kw = q.trim().toLowerCase();
  const data = kw ? rows.filter(r => `${r.email} ${r.target} ${targetLabel(r.target)} ${paramText(r.params)}`.toLowerCase().includes(kw)) : rows;

  const columns = [
    { title: '时间', dataIndex: 'created_at', width: 170, render: (v: string) => <Text style={{ fontSize: 12 }}>{fmt(v)}</Text> },
    { title: '用户', key: 'user', width: 220, render: (_: any, r: Log) => (
      <Space size={4}><span>{r.email || '—'}</span>{r.role === 'admin' && <Tag style={{ margin: 0, fontSize: 10 }}>管理员</Tag>}</Space>
    ) },
    { title: '下载内容', key: 'target', render: (_: any, r: Log) => (
      <div>
        <div>{targetLabel(r.target)}</div>
        {paramText(r.params) && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{paramText(r.params)}</div>}
      </div>
    ) },
    { title: '方式', dataIndex: 'via', width: 110, render: (v: string) => v === 'server' ? <Tag color="blue">服务端导出</Tag> : <Tag>页面生成</Tag> },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: `1px solid ${BRAND.borderSoft}` }}>
        <Input.Search allowClear placeholder="按用户 / 下载内容筛选" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        <Text type="secondary" style={{ fontSize: 12, alignSelf: 'center', marginLeft: 'auto' }}>最近 {rows.length} 条</Text>
      </div>
      <Table rowKey="id" loading={loading} dataSource={data} columns={columns} size="middle" pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: '暂无下载记录' }} />
    </div>
  );
}
