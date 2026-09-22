'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Table, Tag, Space, Select, Typography, Popconfirm, Dropdown, Progress, Tooltip, Checkbox, App, Alert } from 'antd';
import { ReadOutlined, DownloadOutlined, CheckCircleOutlined, DeleteOutlined, DownOutlined, RocketOutlined, ExperimentOutlined, GlobalOutlined, HomeOutlined, SafetyCertificateOutlined, SolutionOutlined, ThunderboltOutlined, FileUnknownOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { exportToCsv } from '@/lib/export-csv';
import { JOB_FIELDS, JOB_STATUS, JOB_TYPE_LABELS, RECRUIT_SEASON_LABELS, REMOTE_TYPE_LABELS, CAMPUS_JOB_TYPES, formatJobValue, formatSalary } from '@/lib/job-fields';
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '@/lib/review-status';
import { SEGMENT_LABELS } from '@/lib/company-fields';
import { BRAND } from '@/lib/theme';
import { useModel } from '@/lib/model-context';

const { Text } = Typography;

const toOptions = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

export default function DbJobPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { currentModel } = useModel();
  const [enrich, setEnrich] = useState<{ done: number; total: number; filled: number; failed: number; current: string } | null>(null);
  const enrichStop = useRef(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({ search: '', jobType: CAMPUS_JOB_TYPES.join(','), season: '', remote: '', status: '', review: '', overseas: false, missingJd: false });

  const query = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({
    search: filters.search, jobType: filters.jobType, season: filters.season, remote: filters.remote,
    status: filters.status, review: filters.review, overseas: filters.overseas ? '1' : '', missingJd: filters.missingJd ? '1' : '', ...extra,
  }), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await (await fetch(`/api/db/jobs?${query({ page: String(page), pageSize: String(pageSize), withStats: '1' })}`)).json();
      if (!json.success) throw new Error(json.error);
      setData(json.data); setTotal(json.total); setStats(json.stats || {});
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [page, pageSize, query]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (patch: Partial<typeof filters>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); setSelected([]); };

  const batchUpdate = async (body: Record<string, any>, okMsg: string) => {
    const json = await (await fetch('/api/db/jobs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, ...body }) })).json();
    if (!json.success) { message.error(json.error); return; }
    message.success(okMsg); setSelected([]); load();
  };

  const batchDelete = async () => {
    const json = await (await fetch(`/api/db/jobs?ids=${selected.join(',')}`, { method: 'DELETE' })).json();
    if (!json.success) { message.error(json.error); return; }
    message.success(`已删除 ${json.deleted} 条`); setSelected([]); load();
  };

  /** AI 补全 JD：打开每条岗位的详情页重新提取，只填空字段。selected 为空时补当前筛选下缺 JD 的全部岗位 */
  const runEnrich = async () => {
    let ids: number[] = selected as number[];
    if (!ids.length) {
      const json = await (await fetch(`/api/db/jobs?${query({ exportAll: 'true', missingJd: '1' })}`)).json();
      ids = (json.data || []).filter((j: any) => j.link).map((j: any) => j.id);
      if (!ids.length) { message.info('当前筛选下没有「缺 JD 且有详情链接」的岗位'); return; }
    }
    enrichStop.current = false;
    let filled = 0, failed = 0;
    const reasons: Record<string, number> = {};
    for (let i = 0; i < ids.length && !enrichStop.current; i += 4) {
      const batch = ids.slice(i, i + 4);
      setEnrich({ done: i, total: ids.length, filled, failed, current: `第 ${i + 1}–${Math.min(i + 4, ids.length)} 条` });
      try {
        const json = await (await fetch('/api/db/jobs/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: batch, model: currentModel }) })).json();
        if (!json.success) throw new Error(json.error);
        for (const r of json.results) { if (r.status === 'filled') filled++; else { failed++; reasons[r.reason || r.status] = (reasons[r.reason || r.status] || 0) + 1; } }
      } catch (e: any) { failed += batch.length; reasons[e.message] = (reasons[e.message] || 0) + batch.length; }
    }
    setEnrich(null); setSelected([]);
    const why = Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join('，');
    message.success(`补全完成：${filled} 条补到了新信息${failed ? `，${failed} 条未补（${why}）` : ''}`, 8);
    load();
  };

  /** 导出当前筛选条件下的全部岗位 */
  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await (await fetch(`/api/db/jobs?${query({ exportAll: 'true' })}`)).json();
      if (!json.success) throw new Error(json.error);
      if (!json.data.length) { message.warning('当前筛选条件下没有数据'); return; }
      exportToCsv(json.data, [
        { key: 'id', header: 'ID' },
        { key: 'institute_or_company_name', header: '企业' },
        { key: 'company_ref.segment', header: '企业分类', formatter: v => SEGMENT_LABELS[v]?.label || '' },
        { key: 'company_ref.industry', header: '行业' },
        ...JOB_FIELDS.map(f => ({ key: f.key, header: f.label, formatter: (v: any) => formatJobValue(f.key, v) })),
        { key: 'status', header: '在招状态', formatter: v => JOB_STATUS[v]?.label || v || '' },
        { key: 'human_review_status', header: '审核状态', formatter: v => REVIEW_STATUS[v]?.label || '未审核' },
        { key: 'completeness_score', header: '完整度' },
        { key: 'source_url', header: '来源页面' },
        { key: 'first_seen_at', header: '首次发现' },
        { key: 'last_seen_at', header: '最近一次在招' },
      ], '校招岗位库');
      message.success(`已导出 ${json.data.length} 条`);
    } catch (e: any) { message.error(`导出失败: ${e.message}`); }
    finally { setExporting(false); }
  };

  const columns = [
    {
      title: '岗位 / 项目', dataIndex: 'name', width: 300, fixed: 'left' as const,
      render: (t: string, r: any) => (
        <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/db-job/${r.id}`)}>
          <div style={{ fontWeight: 600, color: BRAND.primary }}>{t}</div>
          {(r.program_name || (r.title_cn && r.title_cn !== t)) && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{[r.title_cn !== t && r.title_cn, r.program_name].filter(Boolean).join(' · ')}</div>}
        </div>
      ),
    },
    {
      title: '企业', dataIndex: 'institute_or_company_name', width: 170,
      render: (t: string, r: any) => (
        <div>
          <a onClick={() => r.company_id && router.push(`/admin/db-company/${r.company_id}`)} style={{ fontWeight: 500 }}>{t || '-'}</a>
          {r.company_ref?.segment && <div><Tag color={SEGMENT_LABELS[r.company_ref.segment]?.color} style={{ fontSize: 11, lineHeight: '16px', marginTop: 2 }}>{SEGMENT_LABELS[r.company_ref.segment]?.label}</Tag></div>}
        </div>
      ),
    },
    { title: '类型', dataIndex: 'job_type', width: 130, render: (t: string, r: any) => <Space size={2} wrap>{t ? <Tag color="orange">{JOB_TYPE_LABELS[t] || t}</Tag> : '-'}{r.recruit_season && <Tag>{RECRUIT_SEASON_LABELS[r.recruit_season]}</Tag>}</Space> },
    { title: '职能', dataIndex: 'job_function', width: 100, render: (t: string) => t || '-' },
    { title: '地点', dataIndex: 'location', width: 180, ellipsis: true, render: (t: string, r: any) => <span>{r.remote_type === 'remote' && <Tag color="green">远程</Tag>}{r.remote_type === 'hybrid' && <Tag color="cyan">混合</Tag>}{t || '-'}</span> },
    { title: '届别', dataIndex: 'graduation_year', width: 120, ellipsis: true, render: (t: string) => t || '-' },
    { title: '留学生', dataIndex: 'accepts_overseas_students', width: 80, align: 'center' as const, render: (v: boolean | null) => v === true ? <Tag color="blue">面向</Tag> : v === false ? <Tag>不面向</Tag> : <Text type="secondary">—</Text> },
    { title: '薪资', width: 170, render: (_: any, r: any) => formatSalary(r) || (r.salary_description ? <Tooltip title={r.salary_description}><Text type="secondary">见说明</Text></Tooltip> : '-') },
    { title: '网申截止', dataIndex: 'application_end_date_str', width: 110, render: (d: string) => d ? <span style={{ color: new Date(d) < new Date() ? BRAND.ink4 : BRAND.ink }}>{d}</span> : '-' },
    { title: '完整度', dataIndex: 'completeness_score', width: 100, render: (n: number) => <Progress percent={n || 0} size="small" strokeColor={n >= 70 ? BRAND.success : n >= 40 ? BRAND.warning : BRAND.danger} format={p => `${p}`} /> },
    { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => <Tag color={JOB_STATUS[s]?.color}>{JOB_STATUS[s]?.label || s}</Tag> },
    { title: '审核', dataIndex: 'human_review_status', width: 90, render: (s: string) => s ? <Tag color={REVIEW_STATUS[s]?.color}>{REVIEW_STATUS[s]?.label || s}</Tag> : <Tag>未审核</Tag> },
    { title: '更新', dataIndex: 'updated_at', width: 110, render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{new Date(t).toLocaleDateString('zh-CN')}</Text> },
    {
      title: '链接', width: 70, fixed: 'right' as const,
      render: (_: any, r: any) => (r.link || r.source_url) ? <a href={r.link || r.source_url} target="_blank" rel="noreferrer">{r.link ? '原文' : '来源'}</a> : '-',
    },
  ];

  return (
    <div style={{ maxWidth: 1700, margin: '0 auto' }}>
      <PageHeader
        icon={<ReadOutlined />}
        title="校招岗位库"
        description="AI 提取的校招项目、应届生岗位与实习（含远程）。再次提取同一页面时：新岗位入库、已有岗位更新、页面上消失的岗位标记为「已下线」；人工审核过 / 改过的内容不会被覆盖。"
        extra={<>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>导出 CSV（当前筛选）</Button>
          <Button type="primary" icon={<RocketOutlined />} onClick={() => router.push('/admin/tool-job')}>去提取岗位</Button>
        </>}
      />

      <StatCards loading={loading && !stats.total} items={[
        { label: '岗位总数', value: stats.total || 0, icon: <ReadOutlined />, hint: `在招 ${stats.open || 0}` },
        { label: '校招 / 应届', value: stats.graduate || 0, icon: <SolutionOutlined />, color: '#d97706' },
        { label: '实习', value: stats.intern || 0, icon: <ExperimentOutlined />, color: '#0ea5e9' },
        { label: '管培 / 专项', value: stats.program || 0, icon: <RocketOutlined />, color: '#8b5cf6' },
        { label: '远程', value: stats.remote || 0, icon: <HomeOutlined />, color: '#16a34a' },
        { label: '面向留学生', value: stats.overseas || 0, icon: <GlobalOutlined />, color: '#2f54eb' },
        { label: '审核通过', value: stats.reviewed || 0, icon: <SafetyCertificateOutlined />, color: '#16a34a' },
        { label: '缺 JD 正文', value: stats.missing_jd || 0, icon: <FileUnknownOutlined />, color: '#dc2626', hint: '可用「AI 补全 JD」' },
      ]} />

      <Panel padding={16}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input.Search placeholder="搜索岗位 / 企业 / 校招项目 / 地点" allowClear style={{ width: 300 }} onSearch={v => setFilter({ search: v })} />
          <Select value={filters.jobType} style={{ width: 170 }} onChange={v => setFilter({ jobType: v })}
            options={[{ value: CAMPUS_JOB_TYPES.join(','), label: '校招口径（默认）' }, { value: '', label: '全部类型' }, ...toOptions(JOB_TYPE_LABELS)]} />
          <Select value={filters.season} style={{ width: 130 }} onChange={v => setFilter({ season: v })} options={[{ value: '', label: '全部招聘季' }, ...toOptions(RECRUIT_SEASON_LABELS)]} />
          <Select value={filters.remote} style={{ width: 130 }} onChange={v => setFilter({ remote: v })} options={[{ value: '', label: '全部办公方式' }, ...toOptions(REMOTE_TYPE_LABELS)]} />
          <Select value={filters.status} style={{ width: 110 }} onChange={v => setFilter({ status: v })} options={[{ value: '', label: '全部状态' }, ...Object.entries(JOB_STATUS).map(([value, m]) => ({ value, label: m.label }))]} />
          <Select value={filters.review} style={{ width: 120 }} onChange={v => setFilter({ review: v })} options={[{ value: '', label: '全部审核' }, { value: 'none', label: '未审核' }, ...REVIEW_STATUS_OPTIONS]} />
          <Checkbox checked={filters.overseas} onChange={e => setFilter({ overseas: e.target.checked })}>只看面向留学生</Checkbox>
          <Checkbox checked={filters.missingJd} onChange={e => setFilter({ missingJd: e.target.checked })}>只看缺 JD</Checkbox>
          <Tooltip title={selected.length ? `打开选中 ${selected.length} 条岗位的详情页重新提取，只填空字段` : '打开当前筛选下所有「缺 JD 且有详情链接」的岗位详情页重新提取，只填空字段'}>
            <Button icon={<ThunderboltOutlined />} loading={!!enrich} onClick={runEnrich}>AI 补全 JD{selected.length ? `（${selected.length}）` : ''}</Button>
          </Tooltip>
          <div style={{ flex: 1 }} />
          {selected.length > 0 && (
            <Space>
              <Text type="secondary">已选 {selected.length} 条</Text>
              <Button type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => batchUpdate({ human_review_status: 'complete' }, '已标记为审核通过')}>审核通过</Button>
              <Dropdown menu={{
                items: [
                  ...REVIEW_STATUS_OPTIONS.filter(o => o.value !== 'complete').map(o => ({ key: `r:${o.value}`, label: `审核：${o.label}` })),
                  { type: 'divider' as const },
                  { key: 's:closed', label: '标记为已下线' }, { key: 's:open', label: '标记为在招' },
                ],
                onClick: ({ key }) => key.startsWith('r:') ? batchUpdate({ human_review_status: key.slice(2) }, '审核状态已更新') : batchUpdate({ status: key.slice(2) }, '在招状态已更新'),
              }}><Button>更多 <DownOutlined /></Button></Dropdown>
              <Popconfirm title={`删除选中的 ${selected.length} 条岗位？`} description="不可恢复。" onConfirm={batchDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                <Button danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )}
        </div>
        {enrich && <Alert type="info" style={{ marginBottom: 12 }} action={<Button size="small" onClick={() => { enrichStop.current = true; }}>停止</Button>}
          message={<div><div style={{ marginBottom: 4 }}>AI 补全中（{currentModel}）：{enrich.current} · 已补 {enrich.filled} · 未补 {enrich.failed}</div><Progress percent={Math.round((enrich.done / enrich.total) * 100)} size="small" /></div>} />}
        <Table
          rowKey="id" size="small" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1900 }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        />
      </Panel>
    </div>
  );
}
