'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Table, Tag, Select, Drawer, Typography, Popconfirm, Space, App } from 'antd';
import { FileSearchOutlined, DeleteOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { SEARCH_TYPES, subtypeLabel, urlTypeMeta } from '@/lib/url-types';

const { Text } = Typography;

export default function JournalUrlPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchType, setSearchType] = useState('');
  const [active, setActive] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '20', search, searchType });
      const json = await (await fetch(`/api/admin/journal-url?${qs}`)).json();
      if (!json.ok) throw new Error(json.error);
      setLogs(json.logs); setTotal(json.total);
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [page, search, searchType]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: number) => {
    const json = await (await fetch(`/api/admin/journal-url?id=${id}`, { method: 'DELETE' })).json();
    if (json.ok) { message.success('已删除'); load(); } else message.error(json.error);
  };

  const urlsOf = (r: any): any[] => r?.raw_data?.urls || [];

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <PageHeader icon={<FileSearchOutlined />} title="URL 日志" description="URL 获取工具每次运行的检索结果与 AI 汇总报告。" />
      <Panel padding={16}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Input.Search placeholder="搜索企业 / 业务线" allowClear style={{ width: 300 }} onSearch={v => { setSearch(v); setPage(1); }} />
          <Select value={searchType} style={{ width: 200 }} onChange={v => { setSearchType(v); setPage(1); }}
            options={[{ value: '', label: '全部检索维度' }, ...Object.entries(SEARCH_TYPES).map(([value, m]) => ({ value, label: m.label }))]} />
        </Space>
        <Table rowKey="id" size="small" loading={loading} dataSource={logs}
          pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, showTotal: t => `共 ${t} 条`, onChange: setPage }}
          columns={[
            { title: '时间', dataIndex: 'created_at', width: 170, render: (t: string) => new Date(t).toLocaleString('zh-CN') },
            { title: '企业', dataIndex: 'company', width: 200, render: (t: string, r: any) => <a onClick={() => r.company_id && router.push(`/admin/db-company/${r.company_id}`)} style={{ fontWeight: 600 }}>{t}</a> },
            { title: '业务线', dataIndex: 'unit', width: 160, render: (t: string) => t || <Text type="secondary">整个企业</Text> },
            { title: '检索维度', dataIndex: 'search_type', width: 170, render: (t: string) => SEARCH_TYPES[t] ? <Tag color={SEARCH_TYPES[t].color}>{SEARCH_TYPES[t].label}</Tag> : '-' },
            { title: 'URL 数', width: 80, align: 'center' as const, render: (_: any, r: any) => urlsOf(r).length },
            { title: '模型', dataIndex: 'model_id', width: 160, render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{t || '-'}</Text> },
            { title: '报告摘要', dataIndex: 'ai_overview', ellipsis: true, render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{(t || '').replace(/[#*\n]/g, ' ').slice(0, 120)}</Text> },
            {
              title: '操作', width: 120, render: (_: any, r: any) => (
                <Space size={0}>
                  <Button type="link" size="small" onClick={() => setActive(r)}>查看</Button>
                  <Popconfirm title="删除这条日志？" description="已入库的 URL 不受影响。" onConfirm={() => remove(r.id)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]} />
      </Panel>

      <Drawer title={active ? `${active.company}${active.unit ? ` · ${active.unit}` : ''}` : ''} open={!!active} onClose={() => setActive(null)} size={820}>
        {active && (
          <>
            {active.raw_data?.searchQueries?.length > 0 && <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Search Queries: {active.raw_data.searchQueries.join(', ')}</div>}
            <div style={{ marginBottom: 16 }}>
              {urlsOf(active).map((u, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
                  <Tag color={urlTypeMeta(u.type).color} style={{ margin: 0 }}>{subtypeLabel(u.type, u.subtype) || urlTypeMeta(u.type).short}</Tag>
                  <a href={u.url} target="_blank" rel="noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.title || u.url}</a>
                </div>
              ))}
            </div>
            <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 13 }}>{active.ai_overview}</div>
          </>
        )}
      </Drawer>
    </div>
  );
}
