'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Space, Table, Tag, Tooltip, Typography, App } from 'antd';
import { EyeOutlined, ProfileOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { CompanyRunView } from '@/components/admin/CompanyRunView';
import { BRAND } from '@/lib/theme';
import type { PipelineEvent } from '@/lib/company-pipeline-client';

const { Text } = Typography;
const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'default' }, running: { label: '处理中', color: 'processing' }, success: { label: '成功', color: 'success' }, failed: { label: '失败', color: 'error' },
};

export default function JournalCompanyPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [active, setActive] = useState<any>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '30', search, status });
      const json = await (await fetch(`/api/admin/journal-company?${qs}`)).json();
      if (!json.ok) throw new Error(json.error);
      setLogs(json.logs); setTotal(json.total);
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [page, search, status]);
  useEffect(() => { load(); }, [load]);

  const open = async (r: any) => {
    setActive(r); setEvents([]);
    try {
      const json = await (await fetch(`/api/admin/journal-company?logId=${r.id}`)).json();
      if (!json.ok) throw new Error(json.error);
      const log = json.log;
      const saved = log.structured_json?.pipeline_log;
      setEvents(saved?.length ? saved : [{ key: 'done', title: log.error_message ? `❌ ${log.error_message}` : (log.status === 'pending' ? '尚未运行' : '✅ 已完成'), status: log.error_message ? 'error' : 'success', color: log.error_message ? 'red' : 'green' }]);
      setActive(log);
    } catch (e: any) { message.error(e.message); }
  };

  if (active) {
    return <CompanyRunView log={active} events={events} markdown={active.raw_markdown || ''} data={active.structured_json || null} rawSearches={active.raw_searches || null} onBack={() => setActive(null)} backLabel="返回日志列表" />;
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader icon={<ProfileOutlined />} title="企业画像日志" description="企业画像工具跑过的每一家：官方页面原文（raw）、每个主题的检索原始返回、合并后的终局 JSON、AI 逐工序摘要、入库结果与成本。"
        extra={<Button onClick={() => router.push('/admin/tool-company')}>去企业画像工具 →</Button>} />
      <Panel padding={16}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Input.Search placeholder="搜索企业" allowClear style={{ width: 280 }} onSearch={v => { setSearch(v); setPage(1); }} />
          <Select value={status} style={{ width: 130 }} onChange={v => { setStatus(v); setPage(1); }}
            options={[{ value: '', label: '全部状态' }, { value: 'success', label: '成功' }, { value: 'failed', label: '失败' }, { value: 'running', label: '处理中' }, { value: 'pending', label: '待处理' }]} />
        </Space>
        <Table rowKey="id" size="small" loading={loading} dataSource={logs} scroll={{ x: 1300 }}
          pagination={{ current: page, pageSize: 30, total, onChange: setPage, showTotal: t => `共 ${t} 条`, showSizeChanger: false }}
          columns={[
            { title: '企业', dataIndex: 'company', width: 200, render: (t: string, r: any) => <a onClick={() => r.company_id && router.push(`/admin/db-company/${r.company_id}`)} style={{ fontWeight: 600 }}>{t}</a> },
            { title: '任务', width: 160, render: (_: any, r: any) => r.task?.name ? <Text style={{ fontSize: 12 }}>{r.task.name}</Text> : <Tag>单家</Tag> },
            { title: '状态', dataIndex: 'status', width: 85, render: (s: string, r: any) => <Tooltip title={r.error_message}><Tag color={STATUS[s]?.color}>{STATUS[s]?.label || s}</Tag></Tooltip> },
            { title: '工序', dataIndex: 'steps_done', width: 120, render: (s: string[]) => <Text style={{ fontSize: 11 }} type="secondary">{(s || []).length} 步{(s || []).some(x => x.startsWith('search:')) ? ` · 检索 ${(s || []).filter(x => x.startsWith('search:')).length}` : ''}</Text> },
            { title: 'Raw', dataIndex: 'markdown_len', width: 80, render: (n: number, r: any) => n ? <span style={{ fontSize: 12 }}>{(n / 1000).toFixed(0)}k · {(r.pages_fetched || []).filter((p: any) => p.ok).length} 页</span> : '-' },
            { title: '完整度', width: 100, render: (_: any, r: any) => r.completeness_after != null ? <span>{r.completeness_before ?? '-'} → <b style={{ color: BRAND.primary }}>{r.completeness_after}</b></span> : '-' },
            { title: '字段 / 融资 / 动态 / 高管', width: 170, render: (_: any, r: any) => r.status === 'success' ? `${(r.fields_filled || []).length} / ${r.financings_saved} / ${r.news_saved} / ${r.executives_saved}` : '-' },
            { title: '成本', width: 100, render: (_: any, r: any) => r.llm_calls ? <Tooltip title={`${r.llm_calls} 次 · ${(r.token_total || 0).toLocaleString()} tokens`}>${Number(r.cost_usd).toFixed(4)}</Tooltip> : '-' },
            { title: 'AI 摘要', dataIndex: 'ai_summary', ellipsis: true, render: (t: string) => <Tooltip title={t}><span style={{ fontSize: 12, color: BRAND.ink3 }}>{t || '-'}</span></Tooltip> },
            { title: '模型', dataIndex: 'model_id', width: 130, render: (t: string) => <span style={{ fontSize: 11 }}>{t || '-'}</span> },
            { title: '时间', dataIndex: 'created_at', width: 150, render: (t: string) => <span style={{ fontSize: 12 }}>{new Date(t).toLocaleString('zh-CN')}</span> },
            { title: '', width: 50, fixed: 'right' as const, render: (_: any, r: any) => <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => open(r)} /> },
          ]} />
      </Panel>
    </div>
  );
}
