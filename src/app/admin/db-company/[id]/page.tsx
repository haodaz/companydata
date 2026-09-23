'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Col, Descriptions, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Table, Tabs, Tag, Tooltip, Typography, App } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, GlobalOutlined, LinkOutlined, ThunderboltOutlined, ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, LockOutlined, ProfileOutlined, EyeOutlined } from '@ant-design/icons';
import { FINANCING_COLUMNS, NEWS_COLUMNS, EXECUTIVE_COLUMNS, formatProfileValue } from '@/components/admin/CompanyRunView';
import { EntityHero } from '@/components/admin/EntityHero';
import { useModel } from '@/lib/model-context';
import { BRAND } from '@/lib/theme';
import { COMPANY_EDIT_FIELDS, COMPANY_TYPE_LABELS, COMPANY_TYPE_OPTIONS, SEGMENT_LABELS, SEGMENT_OPTIONS, KIND_LABELS, KIND_OPTIONS, hasValue } from '@/lib/company-fields';
import { JOB_STATUS, JOB_TYPE_LABELS, RECRUIT_SEASON_LABELS, REMOTE_TYPE_LABELS } from '@/lib/job-fields';
import { REVIEW_STATUS, REVIEW_STATUS_OPTIONS } from '@/lib/review-status';
import { URL_TYPE_ORDER, URL_TYPES, subtypeLabel, urlTypeMeta } from '@/lib/url-types';

const { Text, Paragraph } = Typography;

const FIELD_LABEL: Record<string, string> = Object.fromEntries(COMPANY_EDIT_FIELDS.map(f => [f.key, f.label]));
/** 档案与画像卡片按这些分组展示（招聘入口在「校招入口」卡片里单独展示） */
const PROFILE_GROUPS = ['基本信息', '企业画像', '业务与行业', '校招与口碑'];

export default function CompanyDetailPage() {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentModel } = useModel();

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [urls, setUrls] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [financings, setFinancings] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [executives, setExecutives] = useState<any[]>([]);
  const [profileLogs, setProfileLogs] = useState<any[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();
  const [report, setReport] = useState<any>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const json = await (await fetch(`/api/db/companies/${id}`)).json();
      if (!json.success) throw new Error(json.error);
      setCompany(json.company); setUrls(json.urls); setJobs(json.jobs); setJournals(json.journals); setNote(json.company?.human_review_note || '');
      setFinancings(json.financings || []); setNews(json.news || []); setExecutives(json.executives || []); setProfileLogs(json.profileLogs || []);
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runEnrich = async (overwrite: boolean) => {
    setEnriching(true);
    try {
      const json = await (await fetch(`/api/db/companies/${id}/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel, overwrite }) })).json();
      if (!json.success) throw new Error(json.error);
      if (json.filled.length) message.success(`已${overwrite ? '更新' : '补全'} ${json.filled.length} 个字段：${json.filled.map((f: string) => FIELD_LABEL[f] || f).join('、')}`);
      else message.info('没有可补全的新信息（已有字段不会被覆盖）');
      load();
    } catch (e: any) { message.error(`AI 补全失败: ${e.message}`); }
    finally { setEnriching(false); }
  };

  const review = async (body: Record<string, any>, ok: string) => {
    const json = await (await fetch(`/api/db/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    if (!json.success) { message.error(json.error); return; }
    message.success(ok); load();
  };

  const openEdit = () => { form.setFieldsValue(company); setEditOpen(true); };

  /** 子实体审核 / 软删 */
  const entityReview = async (entity: string, row: any, status: string) => {
    const json = await (await fetch('/api/db/company-entities', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity, id: row.id, human_review_status: status }) })).json();
    if (!json.success) { message.error(json.error); return; }
    message.success('已更新'); load();
  };
  const entityRemove = async (entity: string, row: any) => {
    const json = await (await fetch(`/api/db/company-entities?entity=${entity}&id=${row.id}`, { method: 'DELETE' })).json();
    if (!json.success) { message.error(json.error); return; }
    message.success('已删除（软删，流水线不会再写回）'); load();
  };
  const entityActionCol = (entity: string) => ({
    title: '审核', width: 150, fixed: 'right' as const,
    render: (_: any, r: any) => (
      <Space size={0}>
        {r.human_review_status ? <Tag color={REVIEW_STATUS[r.human_review_status]?.color} style={{ marginRight: 4 }}>{REVIEW_STATUS[r.human_review_status]?.label}</Tag> : null}
        {r.human_review_status !== 'complete' && <Tooltip title="审核通过"><Button type="text" size="small" icon={<CheckCircleOutlined style={{ color: BRAND.success }} />} onClick={() => entityReview(entity, r, 'complete')} /></Tooltip>}
        {r.human_review_status !== 'rejected' && <Tooltip title="不通过"><Button type="text" size="small" icon={<CloseCircleOutlined style={{ color: '#f5222d' }} />} onClick={() => entityReview(entity, r, 'rejected')} /></Tooltip>}
        <Popconfirm title="删除这条记录？" onConfirm={() => entityRemove(entity, r)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
      </Space>
    ),
  });
  const toolCompanyHref = `/admin/tool-company?company=${id}&name=${encodeURIComponent(company?.name || '')}`;

  const saveEdit = async () => {
    try {
      const values = await form.validateFields();
      const json = await (await fetch(`/api/db/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) })).json();
      if (!json.success) throw new Error(json.error);
      message.success('已保存');
      setEditOpen(false);
      load();
    } catch (e: any) { if (e?.message) message.error(e.message); }
  };

  const remove = async () => {
    const json = await (await fetch(`/api/db/companies/${id}`, { method: 'DELETE' })).json();
    if (json.success) { message.success('企业已删除'); router.push('/admin/db-company'); }
    else message.error(json.error);
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: 120 }}><Spin size="large" /></div>;
  if (!company) return <Empty description="企业不存在" style={{ marginTop: 120 }} />;

  const sources: Record<string, string> = company.profile_source || {};
  const withSource = (key: string, node: React.ReactNode) => (
    <span>
      {node}
      {sources[key] && <Tooltip title={`AI 补全来源：${sources[key]}`}><a href={sources[key]} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: BRAND.ink4 }}><LinkOutlined /></a></Tooltip>}
    </span>
  );
  const val = (key: string) => company[key] ?? null;
  const link = (key: string) => val(key) ? withSource(key, <a href={val(key)} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{val(key)}</a>) : <Text type="secondary">—</Text>;
  const text = (key: string, fmt?: (v: any) => React.ReactNode) => val(key) !== null && val(key) !== '' ? withSource(key, fmt ? fmt(val(key)) : String(val(key))) : <Text type="secondary">—</Text>;

  const openJobs = jobs.filter(j => j.status === 'open');
  const toolUrlHref = `/admin/tool-url?company=${encodeURIComponent(company.name)}&companyId=${company.id}`;

  const jobColumns = [
    {
      title: '岗位 / 项目', dataIndex: 'name',
      render: (t: string, r: any) => (
        <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/db-job/${r.id}`)}>
          <span style={{ fontWeight: 600, color: BRAND.primary }}>{t}</span>
          {r.program_name && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.program_name}</div>}
        </div>
      ),
    },
    { title: '类型', dataIndex: 'job_type', width: 120, render: (t: string, r: any) => <Space size={2} wrap>{t && <Tag color="orange">{JOB_TYPE_LABELS[t] || t}</Tag>}{r.recruit_season && <Tag>{RECRUIT_SEASON_LABELS[r.recruit_season]}</Tag>}</Space> },
    { title: '地点', dataIndex: 'location', width: 170, ellipsis: true, render: (t: string, r: any) => <span>{r.remote_type === 'remote' && <Tag color="green">远程</Tag>}{r.remote_type === 'hybrid' && <Tag color="cyan">{REMOTE_TYPE_LABELS.hybrid}</Tag>}{t || '-'}</span> },
    { title: '届别', dataIndex: 'graduation_year', width: 110, ellipsis: true, render: (t: string) => t || '-' },
    { title: '留学生', dataIndex: 'accepts_overseas_students', width: 80, align: 'center' as const, render: (v: boolean | null) => v === true ? <Tag color="blue">面向</Tag> : v === false ? <Tag>不面向</Tag> : <Text type="secondary">—</Text> },
    { title: '网申截止', dataIndex: 'application_end_date_str', width: 110, render: (d: string) => d ? <span style={{ color: new Date(d) < new Date() ? BRAND.ink4 : BRAND.ink }}>{d}</span> : '-' },
    { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => <Tag color={JOB_STATUS[s]?.color}>{JOB_STATUS[s]?.label || s}</Tag> },
    { title: '审核', dataIndex: 'human_review_status', width: 90, render: (s: string) => s ? <Tag color={REVIEW_STATUS[s]?.color}>{REVIEW_STATUS[s]?.label || s}</Tag> : <Tag>未审核</Tag> },
  ];

  const urlColumns = [
    { title: '类型', width: 150, render: (_: any, r: any) => <Space size={2} wrap><Tag color={urlTypeMeta(r.type).color}>{urlTypeMeta(r.type).short}</Tag>{r.subtype && <Tag>{subtypeLabel(r.type, r.subtype)}</Tag>}</Space> },
    { title: '标题', dataIndex: 'title', ellipsis: true, render: (t: string, r: any) => <Tooltip title={r.reasoning}><span>{r.unit && <Text type="secondary">[{r.unit}] </Text>}{t || '-'}</span></Tooltip> },
    { title: 'URL', dataIndex: 'url', ellipsis: true, render: (u: string) => <a href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{u}</a> },
    { title: '健康', dataIndex: 'health_status', width: 80, render: (h: string) => h === 'alive' ? <Tag color="success">可访问</Tag> : h === 'dead' ? <Tag color="error">失效</Tag> : h === 'redirect' ? <Tag color="warning">跳转</Tag> : <Tag>未检查</Tag> },
  ];

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => router.push('/admin/db-company')}>返回企业实体库</Button>
        <Space>
          <Button icon={<GlobalOutlined />} onClick={() => router.push(toolUrlHref)}>找校招 URL</Button>
          <Button type="primary" ghost icon={<ProfileOutlined />} onClick={() => router.push(toolCompanyHref)}>跑画像流水线</Button>
          <Tooltip title="轻量版：一次联网检索只补基础字段；完整画像请用「跑画像流水线」"><Button icon={<ThunderboltOutlined />} loading={enriching} onClick={() => runEnrich(false)}>快速补全</Button></Tooltip>
          <Button icon={<EditOutlined />} onClick={openEdit}>编辑</Button>
          <Popconfirm title="删除这家企业？" description="关联的信息源与岗位会保留，但解除与企业的关联。" onConfirm={remove} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>

      <EntityHero
        initial={(company.name || '?').slice(0, 1).toUpperCase()}
        title={company.name}
        subtitle={[company.name_en !== company.name && company.name_en, company.jv_partners].filter(Boolean).join(' · ') || undefined}
        tags={<>
          {company.segment && <Tag color={SEGMENT_LABELS[company.segment]?.color}>{SEGMENT_LABELS[company.segment]?.label}</Tag>}
          {company.company_type && <Tag>{COMPANY_TYPE_LABELS[company.company_type]}</Tag>}
          {company.kind && <Tag>{KIND_LABELS[company.kind] || company.kind}</Tag>}
          {company.industry && <Tag color="purple">{company.industry}{company.sub_industry ? ` · ${company.sub_industry}` : ''}</Tag>}
          {company.fortune_global_rank && <Tag color="gold">世界 500 强 #{company.fortune_global_rank}{company.ranking_year ? `（${company.ranking_year}）` : ''}</Tag>}
          {company.stock_code && <Tag>{company.stock_code}</Tag>}
          {company.human_review_status ? <Tag color={REVIEW_STATUS[company.human_review_status]?.color}>{REVIEW_STATUS[company.human_review_status]?.label}</Tag> : <Tag>未审核</Tag>}
          {(company.tags || []).map((t: string) => <Tag key={t}>{t}</Tag>)}
        </>}
        metrics={[
          { label: '完整度', value: company.completeness_score ?? '—', color: BRAND.primary },
          { label: '在招岗位', value: openJobs.length, color: BRAND.success },
          { label: '岗位总数', value: jobs.length },
          { label: '信息源', value: urls.length },
        ]}
      />

      <Row gutter={16}>
        <Col xs={24} xl={9}>
          <Card title="人工审核" size="small" style={{ marginBottom: 16 }}
            extra={company.human_review_status ? <Tag color={REVIEW_STATUS[company.human_review_status]?.color}>{REVIEW_STATUS[company.human_review_status]?.label}</Tag> : <Tag>未审核</Tag>}>
            <Space wrap style={{ marginBottom: 10 }}>
              <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => review({ human_review_status: 'complete', human_review_note: note }, '已审核通过')}>审核通过</Button>
              <Button danger size="small" icon={<CloseCircleOutlined />} onClick={() => review({ human_review_status: 'rejected', human_review_note: note }, '已标记不通过')}>不通过</Button>
              <Select size="small" style={{ width: 120 }} placeholder="其他状态" value={null} options={REVIEW_STATUS_OPTIONS.filter(o => !['complete', 'rejected'].includes(o.value))} onChange={v => v && review({ human_review_status: v, human_review_note: note }, '审核状态已更新')} />
            </Space>
            <Input.TextArea rows={2} placeholder="审核备注（随审核操作一起保存）" value={note} onChange={e => setNote(e.target.value)} />
            <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 8, lineHeight: 1.7 }}>
              通过 / 不通过 / 隐藏后，AI 补全不再覆盖这家企业；人工编辑过的字段会锁定 <LockOutlined style={{ color: BRAND.warning }} />。
              {(company.human_locked_fields || []).length > 0 && <div>已锁定：{(company.human_locked_fields as string[]).map(k => COMPANY_EDIT_FIELDS.find(f => f.key === k)?.label || k).join('、')} <a onClick={() => review({ unlock: company.human_locked_fields }, '已解除全部锁定')}>解除</a></div>}
              {company.human_review_at && <div>上次审核 {new Date(company.human_review_at).toLocaleString('zh-CN')}</div>}
            </div>
          </Card>

          <Card title="校招入口" size="small" style={{ marginBottom: 16 }}
            extra={!company.campus_url && <Button type="link" size="small" onClick={() => router.push(toolUrlHref)}>去检索 →</Button>}>
            <Descriptions column={1} size="small" styles={{ label: { width: 100 } }}>
              <Descriptions.Item label="校招官网">{link('campus_url')}</Descriptions.Item>
              <Descriptions.Item label="招聘总入口">{link('careers_url')}</Descriptions.Item>
            </Descriptions>
            <div style={{ fontSize: 12, color: BRAND.ink3, margin: '12px 0 4px' }}>校招概况</div>
            {company.campus_overview
              ? <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{withSource('campus_overview', company.campus_overview)}</Paragraph>
              : <Text type="secondary">暂无。点右上角「AI 补全画像」生成。</Text>}
          </Card>

          <Card title="企业档案与画像" size="small" style={{ marginBottom: 16 }}
            extra={<Space size={8}>
              {company.profile_crawled_at && <Text type="secondary" style={{ fontSize: 12 }}>画像流水线 {new Date(company.profile_crawled_at).toLocaleDateString('zh-CN')}</Text>}
              {company.profile_updated_at
                ? <Popconfirm title="重新检索并覆盖已有基础字段？" onConfirm={() => runEnrich(true)} okText="覆盖更新" cancelText="取消"><Button type="link" size="small" loading={enriching} style={{ padding: 0 }}>重新检索</Button></Popconfirm>
                : <Text type="secondary" style={{ fontSize: 12 }}>尚未 AI 补全</Text>}
            </Space>}>
            {company.one_sentence && <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink2, marginBottom: 8 }}>{withSource('one_sentence', company.one_sentence)}</div>}
            {company.introduction
              ? <Paragraph style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{withSource('introduction', company.introduction)}</Paragraph>
              : <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>暂无企业简介</Text>}
            {PROFILE_GROUPS.map(group => {
              const fields = COMPANY_EDIT_FIELDS.filter(f => f.group === group && !['name', 'one_sentence', 'introduction'].includes(f.key));
              const filled = fields.filter(f => hasValue(company[f.key]));
              if (!filled.length) return null;
              const shortOnes = filled.filter(f => f.kind !== 'text');
              const longOnes = filled.filter(f => f.kind === 'text');
              return (
                <div key={group} style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.ink2, margin: '0 0 8px', borderLeft: `3px solid ${BRAND.primary}`, paddingLeft: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{group}</span>
                    {fields.length > filled.length && <Text type="secondary" style={{ fontWeight: 400 }}>空缺 {fields.length - filled.length} 项</Text>}
                  </div>
                  {shortOnes.length > 0 && (
                    <Descriptions column={1} size="small" styles={{ label: { width: 100 } }}>
                      {shortOnes.map(f => (
                        <Descriptions.Item key={f.key} label={f.label}>
                          {f.kind === 'url' ? link(f.key) : withSource(f.key, formatProfileValue(f.key, company[f.key]))}
                        </Descriptions.Item>
                      ))}
                    </Descriptions>
                  )}
                  {longOnes.map(f => (
                    <div key={f.key} style={{ margin: '8px 0 4px' }}>
                      <div style={{ fontSize: 12, color: BRAND.ink3, marginBottom: 2 }}>{f.label}{sources[f.key] && <a href={sources[f.key]} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: BRAND.ink4 }}><LinkOutlined /></a>}</div>
                      <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 13 }} ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}>{formatProfileValue(f.key, company[f.key])}</Paragraph>
                    </div>
                  ))}
                </div>
              );
            })}
            {!company.profile_crawled_at && <div style={{ marginTop: 12, fontSize: 12, color: BRAND.ink4 }}>行业位置、融资、动态、管理团队、口碑与舆情等要靠 <a onClick={() => router.push(toolCompanyHref)}>画像流水线</a> 补齐。</div>}
          </Card>
        </Col>

        <Col xs={24} xl={15}>
          <Card size="small" styles={{ body: { paddingTop: 4 } }}>
            <Tabs items={[
              {
                key: 'financings', label: `融资（${financings.length}）`,
                children: <Table rowKey="id" size="small" scroll={{ x: 760 }} dataSource={financings} columns={[...FINANCING_COLUMNS, entityActionCol('financings')]} pagination={false}
                  locale={{ emptyText: <Empty description={<span>还没有融资记录。<a onClick={() => router.push(toolCompanyHref)}>跑画像流水线</a>会检索融资历史。</span>} /> }} />,
              },
              {
                key: 'news', label: `近期动态（${news.length}）`,
                children: <Table rowKey="id" size="small" scroll={{ x: 760 }} dataSource={news} columns={[...NEWS_COLUMNS, entityActionCol('news')]} pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
                  locale={{ emptyText: <Empty description={<span>还没有动态。<a onClick={() => router.push(toolCompanyHref)}>跑画像流水线</a>会检索近 12 个月动态与舆情。</span>} /> }} />,
              },
              {
                key: 'executives', label: `管理团队（${executives.length}）`,
                children: <Table rowKey="id" size="small" scroll={{ x: 1000 }} dataSource={executives} columns={[...EXECUTIVE_COLUMNS, entityActionCol('executives')]} pagination={false}
                  locale={{ emptyText: <Empty description={<span>还没有管理团队。<a onClick={() => router.push(toolCompanyHref)}>跑画像流水线</a>会从官网与年报提取。</span>} /> }} />,
              },
              {
                key: 'jobs', label: `校招岗位（${jobs.length}）`,
                children: <Table rowKey="id" size="small" scroll={{ x: 900 }} dataSource={jobs} columns={jobColumns} pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
                  locale={{ emptyText: <Empty description={<span>还没有岗位。先<a onClick={() => router.push(toolUrlHref)}>找校招 URL</a>，再到<a onClick={() => router.push('/admin/tool-job')}>校招岗位提取</a>里跑任务。</span>} /> }} />,
              },
              {
                key: 'urls', label: `信息源（${urls.length}）`,
                children: (
                  <>
                    <Space size={4} wrap style={{ marginBottom: 8 }}>
                      {URL_TYPE_ORDER.map(t => { const n = urls.filter(u => u.type === t).length; return n ? <Tag key={t} color={URL_TYPES[t].color}>{URL_TYPES[t].label} {n}</Tag> : null; })}
                      <Button type="link" size="small" icon={<ApiOutlined />} onClick={() => router.push('/admin/tool-job')}>送去提取岗位</Button>
                    </Space>
                    <Table rowKey="id" size="small" scroll={{ x: 640 }} dataSource={urls} columns={urlColumns} pagination={{ pageSize: 15, size: 'small', showSizeChanger: false }}
                      locale={{ emptyText: <Empty description={<span>还没有信息源。<a onClick={() => router.push(toolUrlHref)}>用 URL 获取工具检索</a></span>} /> }} />
                  </>
                ),
              },
              {
                key: 'profileLogs', label: `画像日志（${profileLogs.length}）`,
                children: profileLogs.length === 0 ? <Empty description={<span>还没跑过画像流水线。<a onClick={() => router.push(toolCompanyHref)}>去跑一遍</a></span>} /> : (
                  <Table rowKey="id" size="small" dataSource={profileLogs} pagination={false}
                    columns={[
                      { title: '时间', dataIndex: 'created_at', width: 150, render: (t: string) => <span style={{ fontSize: 12 }}>{new Date(t).toLocaleString('zh-CN')}</span> },
                      { title: '状态', dataIndex: 'status', width: 80, render: (s: string, r: any) => <Tooltip title={r.error_message}><Tag color={s === 'success' ? 'success' : s === 'failed' ? 'error' : 'default'}>{s}</Tag></Tooltip> },
                      { title: '完整度', width: 100, render: (_: any, r: any) => r.completeness_after != null ? `${r.completeness_before ?? '-'} → ${r.completeness_after}` : '-' },
                      { title: '字段 / 融资 / 动态 / 高管', width: 170, render: (_: any, r: any) => r.status === 'success' ? `${(r.fields_filled || []).length} / ${r.financings_saved} / ${r.news_saved} / ${r.executives_saved}` : '-' },
                      { title: '成本', width: 90, render: (_: any, r: any) => r.llm_calls ? `$${Number(r.cost_usd).toFixed(4)}` : '-' },
                      { title: 'AI 摘要', dataIndex: 'ai_summary', ellipsis: true, render: (t: string) => <Tooltip title={t}><span style={{ fontSize: 12, color: BRAND.ink3 }}>{t || '-'}</span></Tooltip> },
                      { title: '', width: 50, render: () => <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => router.push('/admin/journal-company')} /> },
                    ]} />
                ),
              },
              {
                key: 'journals', label: `检索报告（${journals.length}）`,
                children: journals.length === 0 ? <Empty description="暂无 URL 检索报告" /> : (
                  <Table rowKey="id" size="small" dataSource={journals} pagination={false}
                    columns={[
                      { title: '时间', dataIndex: 'created_at', width: 170, render: (t: string) => new Date(t).toLocaleString('zh-CN') },
                      { title: '检索维度', dataIndex: 'search_type', width: 140, render: (t: string) => t === 'homepage' ? <Tag color="blue">企业官网 + 企业信息</Tag> : <Tag color="orange">校招 + 实习</Tag> },
                      { title: '业务线', dataIndex: 'unit', render: (t: string) => t || '整个企业' },
                      { title: '', width: 90, render: (_: any, r: any) => <Button type="link" size="small" onClick={() => setReport(r)}>查看报告</Button> },
                    ]} />
                ),
              },
            ]} />
          </Card>
        </Col>
      </Row>

      <Modal title="编辑企业" open={editOpen} onOk={saveEdit} onCancel={() => setEditOpen(false)} okText="保存" width={760} destroyOnHidden>
        <Form form={form} layout="vertical" style={{ maxHeight: '64vh', overflowY: 'auto', paddingRight: 8 }}>
          {Array.from(new Set(COMPANY_EDIT_FIELDS.map(f => f.group))).map(group => (
            <div key={group}>
              <div style={{ fontWeight: 600, color: BRAND.ink2, margin: '8px 0 12px', borderLeft: `3px solid ${BRAND.primary}`, paddingLeft: 8 }}>{group}</div>
              <Row gutter={12}>
                {COMPANY_EDIT_FIELDS.filter(f => f.group === group).map(f => (
                  <Col key={f.key} span={f.kind === 'text' || f.kind === 'url' || f.kind === 'tags' ? 24 : 12}>
                    <Form.Item name={f.key} label={f.label}
                      rules={[...(f.key === 'name' ? [{ required: true, message: '请输入企业名称' }] : []), ...(f.kind === 'url' ? [{ type: 'url' as const, message: '请输入完整链接' }] : [])]}>
                      {f.kind === 'text' ? <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} />
                        : f.kind === 'number' ? <InputNumber style={{ width: '100%' }} />
                        : f.kind === 'segment' ? <Select allowClear options={SEGMENT_OPTIONS} />
                        : f.kind === 'company_type' ? <Select allowClear options={COMPANY_TYPE_OPTIONS} />
                        : f.kind === 'kind' ? <Select allowClear options={KIND_OPTIONS} />
                        : f.kind === 'tags' ? <Select mode="tags" tokenSeparators={[',', '，']} open={false} suffixIcon={null} placeholder="输入后回车" />
                        : <Input />}
                    </Form.Item>
                  </Col>
                ))}
              </Row>
            </div>
          ))}
        </Form>
      </Modal>

      <Modal title="URL 检索报告" open={!!report} onCancel={() => setReport(null)} footer={null} width={860}>
        <div style={{ maxHeight: '68vh', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 13 }}>{report?.ai_overview}</div>
      </Modal>
    </div>
  );
}
