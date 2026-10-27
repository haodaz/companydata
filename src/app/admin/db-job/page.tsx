'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Table, Tag, Space, Select, Typography, Popconfirm, Dropdown, Progress, Tooltip, Checkbox, App, Alert, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { ReadOutlined, DownloadOutlined, CheckCircleOutlined, DeleteOutlined, DownOutlined, RocketOutlined, ExperimentOutlined, GlobalOutlined, HomeOutlined, SafetyCertificateOutlined, SolutionOutlined, ThunderboltOutlined, FileUnknownOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { exportToCsv } from '@/lib/export-csv';
import { ensureDownloadAllowed, clearDownloadPermissionCache } from '@/lib/download-gate';
import { JOB_FIELDS, JOB_SOURCE_LABELS, JOB_STATUS, JOB_TYPE_LABELS, RECRUIT_SEASON_LABELS, REMOTE_TYPE_LABELS, CAMPUS_JOB_TYPES, formatJobValue, formatSalary } from '@/lib/job-fields';
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '@/lib/review-status';
import { SEGMENT_LABELS } from '@/lib/company-fields';
import { BRAND } from '@/lib/theme';
import { useModel } from '@/lib/model-context';
import { sourcesText } from '@/lib/source-tags';
import { COMPLETENESS_BUCKETS } from '@/lib/completeness-filter';
import { LINK_FILTERS } from '@/lib/link-filter';

const { Text } = Typography;

const toOptions = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

/** 本标签页里记住的岗位库筛选（sessionStorage，关掉标签页就没了） */
const FILTER_KEY = 'db-job:filters';

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
  const DEFAULT_FILTERS = { search: '', jobType: CAMPUS_JOB_TYPES.join(','), season: '', remote: '', status: '', review: '', overseas: false, missingJd: false, companyId: '', companyName: '', source: '', flag: '', ids: '', publishFrom: '', publishTo: '', comp: '', sort: '', link: '' };
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [resetKey, setResetKey] = useState(0);   // 重置时让搜索框（非受控）一起清空
  const [sources, setSources] = useState<Record<string, number>>({});
  // 从「校招岗位提取」任务跳过来：?companyId=&companyName=&jobType=all 直接定位到刚提取的那批。
  // 以前跳过来是默认的「校招口径」，社招岗位被默认筛掉，看起来像「提取成功了库里却没有」。
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    // 网址里的筛选 + 页码：从岗位详情返回时还原到原来那一页（数据部门 1009 反馈「从第 5 页进去，返回跳回第 1 页」）
    // 网址没带筛选（从左边导航点回来）：还原这个浏览器标签里上次的筛选（数据部门 10-20 #18）
    let qs = window.location.search;
    if (!qs) { try { qs = sessionStorage.getItem(FILTER_KEY) || ''; } catch { /* 无痕模式等读不了 */ } if (qs) window.history.replaceState(null, '', `?${qs.replace(/^\?/, '')}`); }
    const u = new URLSearchParams(qs);
    const jt = u.get('jobType');
    setFilters(f => ({
      ...f,
      companyId: u.get('companyId') || '', companyName: u.get('companyName') || '', ids: u.get('ids') || '', search: u.get('search') || '',
      jobType: jt === 'all' ? '' : (jt ?? f.jobType),
      season: u.get('season') || '', remote: u.get('remote') || '', status: u.get('status') || '', review: u.get('review') || '',
      overseas: u.get('overseas') === '1', missingJd: u.get('missingJd') === '1',
      source: u.get('source') || '', flag: u.get('flag') || '', publishFrom: u.get('publishFrom') || '', publishTo: u.get('publishTo') || '',
      comp: u.get('comp') || '', sort: u.get('sort') || '', link: u.get('link') || '',
    }));
    const p = parseInt(u.get('page') || ''), ps = parseInt(u.get('pageSize') || '');
    if (p > 0) setPage(p);
    if (ps > 0) setPageSize(ps);
    setUrlReady(true);
  }, []);

  // 筛选 / 页码一变就写回网址（replaceState，不新增历史记录、不触发页面跳转）
  useEffect(() => {
    if (!urlReady) return;
    const q = new URLSearchParams();
    const put = (k: string, v: string | boolean) => { if (v) q.set(k, v === true ? '1' : String(v)); };
    put('search', filters.search); put('jobType', filters.jobType === CAMPUS_JOB_TYPES.join(',') ? '' : (filters.jobType || 'all'));
    put('season', filters.season); put('remote', filters.remote); put('status', filters.status); put('review', filters.review);
    put('overseas', filters.overseas); put('missingJd', filters.missingJd); put('companyId', filters.companyId); put('companyName', filters.companyName); put('ids', filters.ids);
    put('source', filters.source); put('flag', filters.flag); put('publishFrom', filters.publishFrom); put('publishTo', filters.publishTo);
    put('comp', filters.comp); put('sort', filters.sort); put('link', filters.link);
    if (page > 1) q.set('page', String(page));
    if (pageSize !== 50) q.set('pageSize', String(pageSize));
    const s = q.toString();
    // 第一个参数按 Next 文档传 null（传 window.history.state 会把 Next 自己的旧路由状态带过去）
    window.history.replaceState(null, '', s ? `?${s}` : window.location.pathname);
    // 记住筛选（外采篮带过来的「只看这一篮」不记，免得下次打开还被它筛着）
    try { const keep = new URLSearchParams(s); keep.delete('ids'); sessionStorage.setItem(FILTER_KEY, keep.toString()); } catch { /* 读写不了就不记 */ }
  }, [filters, page, pageSize, urlReady]);

  const query = useCallback((extra: Record<string, string> = {}) => new URLSearchParams({
    search: filters.search, jobType: filters.jobType, season: filters.season, remote: filters.remote,
    status: filters.status, review: filters.review, overseas: filters.overseas ? '1' : '', missingJd: filters.missingJd ? '1' : '', companyId: filters.companyId, ids: filters.ids,
    source: filters.source, flag: filters.flag, publishFrom: filters.publishFrom, publishTo: filters.publishTo, comp: filters.comp, sort: filters.sort, link: filters.link, ...extra,
  }), [filters]);

  const load = useCallback(async () => {
    if (!urlReady) return;
    setLoading(true);
    try {
      const json = await (await fetch(`/api/db/jobs?${query({ page: String(page), pageSize: String(pageSize) })}`)).json();
      if (!json.success) throw new Error(json.error);
      setData(json.data); setTotal(json.total);
      // 按类型筛空了：看看放开类型有多少（vivo 的岗位全是社招，校招口径下一条都搜不到）
      setOtherScope(null);
      if (!json.total && filters.jobType) {
        const o = await (await fetch(`/api/db/jobs?${query({ jobType: '', page: '1', pageSize: '1' })}`)).json();
        if (o.success && o.total) setOtherScope(o.total);
      }
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [page, pageSize, query, urlReady, filters.jobType]);
  const [otherScope, setOtherScope] = useState<number | null>(null);

  useEffect(() => { load(); }, [load]);
  // 顶部统计是全库口径：打开页面时单独取一次（接口里让数据库直接数），翻页 / 筛选不再重新数
  useEffect(() => { fetch('/api/db/jobs?page=1&pageSize=1&withStats=1').then(r => r.json()).then(j => { if (j.success) { setStats(j.stats || {}); setSources(j.sources || {}); } }).catch(() => {}); }, []);

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
    if (!(await ensureDownloadAllowed())) return;   // 没有下载许可：弹出申请框（日志由服务端导出接口记）
    setExporting(true);
    try {
      const res = await fetch(`/api/db/jobs?${query({ exportAll: 'true' })}`);
      const json = await res.json();
      if (res.status === 403 && json.code === 'DOWNLOAD_PERMISSION_REQUIRED') {
        // 前端缓存的许可已过期（被收回）：以服务端为准，重新弹申请框
        clearDownloadPermissionCache(); await ensureDownloadAllowed(); return;
      }
      if (!json.success) throw new Error(json.error);
      if (!json.data.length) { message.warning('当前筛选条件下没有数据'); return; }
      exportToCsv(json.data, [
        { key: 'id', header: 'ID' },
        { key: 'external_id', header: 'flora_external_id' },
        { key: 'applysquare_id', header: 'applysquare_id' },
        { key: 'institute_or_company_name', header: '企业' },
        { key: 'company_ref.segment', header: '企业分类', formatter: v => SEGMENT_LABELS[v]?.label || '' },
        { key: 'company_ref.industry', header: '行业' },
        { key: 'source', header: '来源', formatter: (v: any) => sourcesText(v) },   // 多个来源用「；」连
        { key: 'recruit_channel', header: '招聘渠道', formatter: v => (v && JOB_SOURCE_LABELS[v]) || v || '' },
        ...JOB_FIELDS.map(f => ({ key: f.key, header: f.label, formatter: (v: any) => formatJobValue(f.key, v) })),
        { key: 'status', header: '在招状态', formatter: v => JOB_STATUS[v]?.label || v || '' },
        { key: 'human_review_status', header: '审核状态', formatter: v => REVIEW_STATUS[v]?.label || '未审核' },
        { key: 'completeness_score', header: '完整度' },
        { key: 'source_url', header: '来源页面' },
        { key: 'first_seen_at', header: '首次发现' },
        { key: 'last_seen_at', header: '最近一次在招' },
      ], '校招岗位库', { serverChecked: true });
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
    { title: '完整度', dataIndex: 'completeness_score', width: 100, sorter: true, sortDirections: ['descend', 'ascend'] as any, sortOrder: (filters.sort === 'comp_desc' ? 'descend' : filters.sort === 'comp_asc' ? 'ascend' : null) as any, render: (n: number) => <Progress percent={n || 0} size="small" strokeColor={n >= 70 ? BRAND.success : n >= 40 ? BRAND.warning : BRAND.danger} format={p => `${p}`} /> },
    { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => <Tag color={JOB_STATUS[s]?.color}>{JOB_STATUS[s]?.label || s}</Tag> },
    { title: '审核', dataIndex: 'human_review_status', width: 90, render: (s: string) => s ? <Tag color={REVIEW_STATUS[s]?.color}>{REVIEW_STATUS[s]?.label || s}</Tag> : <Tag>未审核</Tag> },
    { title: '更新', dataIndex: 'updated_at', width: 110, render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{new Date(t).toLocaleDateString('zh-CN')}</Text> },
    {
      title: '链接', width: 70, fixed: 'right' as const,
      render: (_: any, r: any) => (r.link || r.source_url) ? <Tooltip title={r.link_issue || undefined}><a href={r.link || r.source_url} target="_blank" rel="noreferrer" style={r.link_issue === '列表页，未找到该岗位详情' || r.link_status === 'dead' ? { color: BRAND.danger } : undefined}>{r.link ? '原文' : '来源'}</a></Tooltip> : '-',
    },
  ];

  return (
    <div style={{ maxWidth: 1700, margin: '0 auto' }}>
      <PageHeader
        icon={<ReadOutlined />}
        title="校招岗位库"
        description="AI 提取的校招项目、应届生岗位与实习（含远程）。再次提取同一页面时：新岗位入库、已有岗位更新、页面上消失的岗位标记为「已下线」；人工审核过 / 改过的内容不会被覆盖。"
        extra={<>
          <Popconfirm title={filters.companyId ? `给「${filters.companyName || '这家企业'}」去重？` : '给所有企业的岗位去重？'} description="同一企业里岗位编号 + 城市相同（「江苏省·常州市」和「常州市」算同一城市），或名称 + 城市相同且一条只有列表信息的在招岗位，并成一条：留内容最全的，另一条的字段补过来后软删。" okText="去重" cancelText="取消" onConfirm={async () => {
            message.loading({ content: '去重中…', key: 'dedupe', duration: 0 });
            const r = await fetch('/api/admin/jobs-dedupe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: filters.companyId || undefined }) }).then(x => x.json()).catch(e => ({ ok: false, error: e.message }));
            if (!r.ok) { message.error({ content: `去重失败：${r.error}`, key: 'dedupe' }); return; }
            message.success({ content: `检查了 ${r.companies} 家企业，合并了 ${r.merged} 条重复岗位`, key: 'dedupe' }); load();
          }}><Button>一键去重{filters.companyId ? '（本企业）' : ''}</Button></Popconfirm>
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
          <Input.Search key={urlReady ? `ready-${resetKey}` : 'init'} defaultValue={filters.search} placeholder="搜索岗位 / 企业 / 校招项目 / 地点" allowClear style={{ width: 300 }} onSearch={v => setFilter({ search: v })} />
          {filters.ids && <Tag closable color="orange" style={{ padding: '4px 10px', fontSize: 13 }} onClose={() => setFilter({ ids: '' })}>🧺 只看这一篮采到的 {filters.ids.split(',').filter(Boolean).length} 个岗位</Tag>}
          {filters.companyId && <Tag closable color="purple" style={{ padding: '4px 10px', fontSize: 13 }} onClose={() => setFilter({ companyId: '', companyName: '' })}>只看：{filters.companyName || `企业 #${filters.companyId}`}</Tag>}
          <Select value={filters.jobType} style={{ width: 170 }} onChange={v => setFilter({ jobType: v })}
            options={[{ value: CAMPUS_JOB_TYPES.join(','), label: '校招口径（默认）' }, { value: '', label: '全部类型' }, ...toOptions(JOB_TYPE_LABELS)]} />
          <Select value={filters.season} style={{ width: 130 }} onChange={v => setFilter({ season: v })} options={[{ value: '', label: '全部招聘季' }, ...toOptions(RECRUIT_SEASON_LABELS)]} />
          <Select value={filters.remote} style={{ width: 130 }} onChange={v => setFilter({ remote: v })} options={[{ value: '', label: '全部办公方式' }, ...toOptions(REMOTE_TYPE_LABELS)]} />
          <Select value={filters.status} style={{ width: 110 }} onChange={v => setFilter({ status: v })} options={[{ value: '', label: '全部状态' }, ...Object.entries(JOB_STATUS).map(([value, m]) => ({ value, label: m.label }))]} />
          <Select value={filters.review} style={{ width: 120 }} onChange={v => setFilter({ review: v })} options={[{ value: '', label: '全部审核' }, { value: 'none', label: '未审核' }, ...REVIEW_STATUS_OPTIONS]} />
          <Select value={filters.flag} style={{ width: 150 }} onChange={v => setFilter({ flag: v })} popupMatchSelectWidth={false}
            options={[{ value: '', label: '全部采集标记' }, ...['数据外采篮', '仅列表信息', '详情已补', '详情待补', '待核实', '重点岗位', '支持内推码'].map(f => ({ value: f, label: f }))]} />
          <Select value={filters.source} style={{ width: 160 }} onChange={v => setFilter({ source: v })} popupMatchSelectWidth={false}
            options={[{ value: '', label: '全部来源' }, ...Object.entries(sources).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${JOB_SOURCE_LABELS[k] || k}（${n}）` })),
              ...(sources.none ? [{ value: 'none', label: `未标来源（${sources.none}）` }] : [])]} />
          <Tooltip title={`按岗位页面写明的发布日期筛（${stats.with_publish_date || 0} / ${stats.total || 0} 条有发布日期，没写的不会出现在日期筛选结果里）`}>
            <DatePicker.RangePicker style={{ width: 240 }} placeholder={['发布日期起', '止']} allowEmpty={[true, true]}
              value={[filters.publishFrom ? dayjs(filters.publishFrom) : null, filters.publishTo ? dayjs(filters.publishTo) : null]}
              onChange={v => setFilter({ publishFrom: v?.[0]?.format('YYYY-MM-DD') || '', publishTo: v?.[1]?.format('YYYY-MM-DD') || '' })} />
          </Tooltip>
          <Select value={filters.comp} style={{ width: 140 }} onChange={v => setFilter({ comp: v })} options={[{ value: '', label: '全部完整度' }, ...COMPLETENESS_BUCKETS]} />
          <Select value={filters.link} style={{ width: 170 }} onChange={v => setFilter({ link: v })} popupMatchSelectWidth={false} options={[{ value: '', label: '全部链接' }, ...LINK_FILTERS]} />
          <Checkbox checked={filters.overseas} onChange={e => setFilter({ overseas: e.target.checked })}>只看面向留学生</Checkbox>
          <Checkbox checked={filters.missingJd} onChange={e => setFilter({ missingJd: e.target.checked })}>只看缺 JD</Checkbox>
          <Button onClick={() => { setFilters(DEFAULT_FILTERS); setPage(1); setSelected([]); setResetKey(k => k + 1); }}>重置筛选</Button>
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
        {otherScope !== null && !loading && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }}
            message={`「${filters.jobType === CAMPUS_JOB_TYPES.join(',') ? '校招口径' : '当前类型'}」下没有符合条件的岗位；放开类型后有 ${otherScope} 条（多半是社招全职）。`}
            action={<Button size="small" type="primary" onClick={() => setFilter({ jobType: '' })}>看全部类型</Button>} />
        )}
        <Table
          rowKey="id" size="small" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1900 }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          onChange={(_p, _f, sorter: any, extra) => { if (extra.action === 'sort') setFilter({ sort: sorter?.order === 'ascend' ? 'comp_asc' : sorter?.order === 'descend' ? 'comp_desc' : '' }); }}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        />
      </Panel>
    </div>
  );
}
