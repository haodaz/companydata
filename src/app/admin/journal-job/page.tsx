'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Table, Tag, Select, Drawer, Typography, Space, Tabs, Spin, Tooltip, App } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { JOB_TYPE_LABELS } from '@/lib/job-fields';

const { Text } = Typography;

const statusOf = (r: any) => r.structurer_status === 'success' ? { label: '成功', color: 'success' }
  : (r.fetcher_status === 'failed' || r.structurer_status === 'failed') ? { label: '失败', color: 'error' }
  : r.fetcher_status === 'running' ? { label: '处理中', color: 'processing' } : { label: '待处理', color: 'default' };

export default function JournalJobPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [active, setActive] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '30', search, status });
      const json = await (await fetch(`/api/admin/journal-job?${qs}`)).json();
      if (!json.ok) throw new Error(json.error);
      setLogs(json.logs); setTotal(json.total);
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const open = async (r: any) => {
    setActive(r); setDetailLoading(true);
    try {
      const json = await (await fetch(`/api/admin/journal-job?logId=${r.id}`)).json();
      if (json.ok) setActive(json.log);
    } finally { setDetailLoading(false); }
  };

  const jobs: any[] = active?.structured_json?.jobs || [];

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader icon={<FileTextOutlined />} title="岗位爬取日志" description="校招岗位提取工具处理过的每个 URL：抓取的原始 Markdown、AI 结构化结果、入库情况。" />
      <Panel padding={16}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Input.Search placeholder="搜索企业 / URL / 提示" allowClear style={{ width: 320 }} onSearch={v => { setSearch(v); setPage(1); }} />
          <Select value={status} style={{ width: 130 }} onChange={v => { setStatus(v); setPage(1); }}
            options={[{ value: '', label: '全部状态' }, { value: 'success', label: '成功' }, { value: 'failed', label: '失败' }, { value: 'pending', label: '待处理' }]} />
        </Space>
        <Table rowKey="id" size="small" loading={loading} dataSource={logs} scroll={{ x: 1400 }}
          pagination={{ current: page, pageSize: 30, total, showSizeChanger: false, showTotal: t => `共 ${t} 条`, onChange: setPage }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 70 },
            { title: '时间', dataIndex: 'updated_at', width: 165, render: (t: string) => new Date(t).toLocaleString('zh-CN') },
            { title: '企业', dataIndex: 'company', width: 170, render: (t: string, r: any) => t ? <a onClick={() => r.company_id && router.push(`/admin/db-company/${r.company_id}`)} style={{ fontWeight: 600 }}>{t}</a> : '-' },
            { title: 'URL', dataIndex: 'target_url', ellipsis: true, render: (u: string) => <a href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{u}</a> },
            { title: '任务', width: 190, ellipsis: true, render: (_: any, r: any) => r.task?.name || '-' },
            { title: 'Markdown', dataIndex: 'markdown_len', width: 95, align: 'right' as const, render: (n: number) => n ? `${(n / 1000).toFixed(0)}k` : '-' },
            { title: '入库岗位', dataIndex: 'jobs_saved', width: 90, align: 'center' as const, render: (n: number, r: any) => r.pushed_to_db ? <Text strong style={{ color: '#16a34a' }}>{n}</Text> : <Text type="secondary">0</Text> },
            { title: '状态', width: 90, render: (_: any, r: any) => { const s = statusOf(r); return <Tooltip title={r.error_message}><Tag color={s.color}>{s.label}</Tag></Tooltip>; } },
            { title: '模型', dataIndex: 'model_id', width: 150, render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{t || '-'}</Text> },
            { title: '', width: 70, fixed: 'right' as const, render: (_: any, r: any) => <Button type="link" size="small" onClick={() => open(r)}>查看</Button> },
          ]} />
      </Panel>

      <Drawer title={active ? `日志 #${active.id} · ${active.company || ''}` : ''} open={!!active} onClose={() => setActive(null)} width={920}>
        {detailLoading ? <div style={{ textAlign: 'center', marginTop: 80 }}><Spin /></div> : active && (
          <>
            <a href={active.target_url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{active.target_url}</a>
            {active.error_message && <div style={{ color: '#dc2626', marginTop: 8, fontSize: 13 }}>{active.error_message}</div>}
            {active.structured_json?.ai_summary && <div style={{ background: '#fafafa', borderRadius: 8, padding: 14, margin: '12px 0', lineHeight: 1.7, fontSize: 13 }}>{active.structured_json.ai_summary}</div>}
            <Tabs items={[
              {
                key: 'jobs', label: `岗位（${jobs.length}）`,
                children: <Table rowKey={(_, i) => String(i)} size="small" dataSource={jobs} pagination={false}
                  columns={[
                    { title: '岗位 / 项目', dataIndex: 'title', render: (t: string, r: any) => r.job_url ? <a href={r.job_url} target="_blank" rel="noreferrer">{t}</a> : t },
                    { title: '类型', dataIndex: 'job_type', width: 120, render: (t: string) => t ? <Tag color="orange">{JOB_TYPE_LABELS[t] || t}</Tag> : '-' },
                    { title: '地点', dataIndex: 'location', width: 180, ellipsis: true },
                    { title: '截止', dataIndex: 'deadline', width: 110 },
                  ]} />,
              },
              { key: 'sub', label: `子页面（${active.sub_pages_fetched?.length || 0}）`, children: (active.sub_pages_fetched || []).map((u: string) => <div key={u} style={{ fontSize: 12, marginBottom: 4 }}><a href={u} target="_blank" rel="noreferrer">{u}</a></div>) },
              { key: 'json', label: 'JSON', children: <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: '60vh', overflow: 'auto' }}>{JSON.stringify({ ...active.structured_json, pipeline_log: undefined }, null, 2)}</pre> },
              { key: 'md', label: 'Raw Markdown', children: <pre style={{ background: '#f9f9f9', padding: 16, borderRadius: 8, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '60vh', overflow: 'auto' }}>{(active.raw_markdown || '').slice(0, 100000)}</pre> },
            ]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
