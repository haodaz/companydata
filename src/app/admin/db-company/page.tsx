'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Table, Tag, Space, Select, Modal, Form, Typography, Tooltip, InputNumber, Alert, Progress, App } from 'antd';
import { BankOutlined, PlusOutlined, RobotOutlined, ThunderboltOutlined, GlobalOutlined, FlagOutlined, TeamOutlined, ApartmentOutlined, ImportOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { useModel } from '@/lib/model-context';
import { SEGMENT_LABELS, SEGMENT_OPTIONS, COMPANY_TYPE_LABELS } from '@/lib/company-fields';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;

const LIST_PRESETS = [
  '中国互联网与科技大厂（校招规模大的）30 家',
  '中国四大行、头部券商与公募基金 30 家',
  '中国新能源汽车与动力电池龙头 20 家',
  '汽车行业中外合资企业 20 家',
  '中外合资银行、保险、证券、基金公司 20 家',
  '最新《财富》世界 500 强中总部不在中国的前 100 家',
  '在中国大陆有校招的外资快消、咨询、四大 30 家',
];

export default function DbCompanyPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { currentModel } = useModel();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importSegment, setImportSegment] = useState<string | undefined>();

  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState(LIST_PRESETS[0]);
  const [aiCount, setAiCount] = useState(30);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiList, setAiList] = useState<any[]>([]);
  const [aiPicked, setAiPicked] = useState<React.Key[]>([]);

  const [enrich, setEnrich] = useState<{ done: number; total: number; current: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, segment, withStats: '1' });
      const json = await (await fetch(`/api/db/companies?${qs}`)).json();
      if (!json.success) throw new Error(json.error);
      setData(json.data); setTotal(json.total); setStats(json.stats || {});
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [page, pageSize, search, segment]);

  useEffect(() => { load(); }, [load]);

  const createCompanies = async (companies: any[]) => {
    const json = await (await fetch('/api/db/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companies }) })).json();
    if (!json.success) { message.error(json.error); return false; }
    message.success(`新增 ${json.created} 家${json.skipped ? `，跳过 ${json.skipped} 家（已存在）` : ''}`);
    load();
    return true;
  };

  const handleAdd = async () => {
    try {
      const v = await addForm.validateFields();
      if (await createCompanies([v])) { setAddOpen(false); addForm.resetFields(); }
    } catch { /* 校验未通过 */ }
  };

  /** 粘贴导入：每行一家，「名称, 英文名, 官网」后两项可省 */
  const handleImport = async () => {
    const companies = importText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const [name, name_en, website] = l.split(/[,，\t]/).map(s => s.trim());
      return { name, name_en: name_en || undefined, website: /^https?:\/\//i.test(website || '') ? website : undefined, segment: importSegment };
    });
    if (!companies.length) { message.warning('请粘贴企业名单'); return; }
    if (await createCompanies(companies)) { setImportOpen(false); setImportText(''); }
  };

  const runAiList = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setAiList([]); setAiPicked([]);
    try {
      const json = await (await fetch('/api/agents/finder/company-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: aiQuery, count: aiCount, model: currentModel }) })).json();
      if (json.error) throw new Error(json.error);
      const list = (json.companies || []).map((c: any, i: number) => ({ ...c, _key: i }));
      setAiList(list);
      setAiPicked(list.filter((c: any) => !c.existing_id).map((c: any) => c._key));
    } catch (e: any) { message.error(`生成失败: ${e.message}`); }
    finally { setAiLoading(false); }
  };

  const importAiList = async () => {
    const companies = aiList.filter(c => aiPicked.includes(c._key)).map(({ name, name_en, segment, industry, hq_country, website, jv_partners }) => ({ name, name_en, segment, industry, hq_country, website, jv_partners }));
    if (await createCompanies(companies)) { setAiOpen(false); setAiList([]); }
  };

  /** 批量 AI 补全：逐家联网检索，只填空字段 */
  const runEnrich = async () => {
    const targets = data.filter(c => selected.includes(c.id));
    if (!targets.length) return;
    let filledTotal = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {
      setEnrich({ done: i, total: targets.length, current: targets[i].name });
      try {
        const json = await (await fetch(`/api/db/companies/${targets[i].id}/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel }) })).json();
        if (json.success) filledTotal += json.filled.length; else failed++;
      } catch { failed++; }
    }
    setEnrich(null); setSelected([]);
    message.success(`补全完成：${targets.length - failed} 家成功，共填入 ${filledTotal} 个字段${failed ? `，${failed} 家失败` : ''}`);
    load();
  };

  const columns = [
    {
      title: '企业', dataIndex: 'name', width: 260, fixed: 'left' as const,
      render: (name: string, r: any) => (
        <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/db-company/${r.id}`)}>
          <div style={{ fontWeight: 600, color: BRAND.primary }}>{name}</div>
          {r.name_en && r.name_en !== name && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.name_en}</div>}
        </div>
      ),
    },
    { title: '分类', dataIndex: 'segment', width: 100, render: (s: string) => s ? <Tag color={SEGMENT_LABELS[s]?.color}>{SEGMENT_LABELS[s]?.label || s}</Tag> : <Text type="secondary">未分类</Text> },
    { title: '行业', dataIndex: 'industry', width: 130, render: (t: string, r: any) => t ? <span>{t}{r.sub_industry && <span style={{ color: BRAND.ink3 }}> · {r.sub_industry}</span>}</span> : '-' },
    { title: '类型', dataIndex: 'company_type', width: 100, render: (t: string) => COMPANY_TYPE_LABELS[t] || '-' },
    { title: '总部', width: 140, render: (_: any, r: any) => [r.hq_country, r.hq_city].filter(Boolean).join(' · ') || '-' },
    { title: '500 强', dataIndex: 'fortune_global_rank', width: 80, align: 'center' as const, render: (n: number) => n ? `#${n}` : '-' },
    {
      title: '校招官网', dataIndex: 'campus_url', width: 90, align: 'center' as const,
      render: (u: string, r: any) => u ? <a href={u} target="_blank" rel="noreferrer">打开</a> : (r.careers_url ? <a href={r.careers_url} target="_blank" rel="noreferrer" style={{ color: BRAND.ink3 }}>招聘入口</a> : <Text type="secondary">—</Text>),
    },
    { title: '信息源', width: 80, align: 'center' as const, render: (_: any, r: any) => r.counts?.url_total || <Text type="secondary">0</Text> },
    {
      title: '校招岗位', width: 100, align: 'center' as const,
      render: (_: any, r: any) => r.counts?.jobs_total ? <span><Text strong style={{ color: BRAND.success }}>{r.counts.jobs_open}</Text><Text type="secondary"> / {r.counts.jobs_total}</Text></span> : <Text type="secondary">0</Text>,
    },
    { title: '画像', width: 80, align: 'center' as const, render: (_: any, r: any) => r.profile_updated_at ? <Tag color="success">已补全</Tag> : <Tag>待补全</Tag> },
    {
      title: '操作', width: 150, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => router.push(`/admin/db-company/${r.id}`)}>档案</Button>
          <Button type="link" size="small" onClick={() => router.push(`/admin/tool-url?company=${encodeURIComponent(r.name)}&companyId=${r.id}`)}>找 URL</Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader
        icon={<BankOutlined />}
        title="企业实体库"
        description="以企业为个体。目标：中国企业、中外合资企业、海外百强。名单可由 AI 从无到有生成，也可手动 / 粘贴导入；采集时遇到新企业会自动建档。"
        extra={<>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>粘贴导入</Button>
          <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>新增企业</Button>
          <Button type="primary" icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>AI 建名单</Button>
        </>}
      />

      <StatCards loading={loading && !total} items={[
        { label: '企业总数', value: stats.total || 0, icon: <BankOutlined /> },
        { label: '中国企业', value: stats.china || 0, icon: <FlagOutlined />, color: '#dc2626' },
        { label: '中外合资', value: stats.joint_venture || 0, icon: <ApartmentOutlined />, color: '#d97706' },
        { label: '海外百强', value: stats.overseas_top || 0, icon: <GlobalOutlined />, color: '#2f54eb' },
        { label: '未分类', value: stats.none || 0, icon: <TeamOutlined />, color: '#8a8fa3', hint: '用「AI 补全」自动判定' },
      ]} />

      <Panel padding={16}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input.Search placeholder="搜索企业名 / 英文名 / 行业" allowClear style={{ width: 300 }} onSearch={v => { setSearch(v); setPage(1); }} />
          <Select value={segment} style={{ width: 140 }} onChange={v => { setSegment(v); setPage(1); }}
            options={[{ value: '', label: '全部分类' }, ...SEGMENT_OPTIONS, { value: 'none', label: '未分类' }]} />
          <div style={{ flex: 1 }} />
          {selected.length > 0 && (
            <Tooltip title="逐家联网检索官网、校招官网、行业、分类、总部、规模、简介、校招概况，只填空字段">
              <Button type="primary" ghost icon={<ThunderboltOutlined />} onClick={runEnrich} disabled={!!enrich}>AI 补全画像（{selected.length} 家）</Button>
            </Tooltip>
          )}
        </div>
        {enrich && (
          <Alert type="info" style={{ marginBottom: 12 }} message={<div><div style={{ marginBottom: 4 }}>正在补全：{enrich.current}（{enrich.done + 1}/{enrich.total}）</div><Progress percent={Math.round((enrich.done / enrich.total) * 100)} size="small" /></div>} />
        )}
        <Table
          rowKey="id" size="small" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1400 }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 家`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
          locale={{ emptyText: <div style={{ padding: 40, color: BRAND.ink3 }}>企业库还是空的。点右上角「AI 建名单」从无到有生成第一批目标企业。</div> }}
        />
      </Panel>

      <Modal title="新增企业" open={addOpen} onOk={handleAdd} onCancel={() => setAddOpen(false)} okText="新增" destroyOnHidden>
        <Form form={addForm} layout="vertical">
          <Form.Item name="name" label="企业名称" rules={[{ required: true, message: '请输入企业名称' }]} help="中文常用名优先；其余信息可以之后用 AI 补全"><Input placeholder="例如：腾讯 / 上汽大众 / Procter & Gamble" /></Form.Item>
          <Form.Item name="name_en" label="英文名"><Input /></Form.Item>
          <Form.Item name="segment" label="目标分类"><Select allowClear options={SEGMENT_OPTIONS} placeholder="可留空，AI 补全时自动判定" /></Form.Item>
          <Form.Item name="website" label="官网" rules={[{ type: 'url', message: '请输入完整链接' }]}><Input placeholder="https://" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="粘贴导入企业名单" open={importOpen} onOk={handleImport} onCancel={() => setImportOpen(false)} okText="导入" width={600}>
        <div style={{ fontSize: 12, color: BRAND.ink3, marginBottom: 8 }}>每行一家：<code>名称, 英文名, 官网</code>（后两项可省略）。同名企业自动跳过。</div>
        <Input.TextArea rows={10} value={importText} onChange={e => setImportText(e.target.value)} placeholder={'腾讯, Tencent, https://www.tencent.com\n上汽大众\nProcter & Gamble'} />
        <Select allowClear style={{ width: 200, marginTop: 12 }} placeholder="统一设置目标分类（可选）" value={importSegment} onChange={setImportSegment} options={SEGMENT_OPTIONS} />
      </Modal>

      <Modal title="AI 建名单 · 从无到有生成目标企业" open={aiOpen} onCancel={() => setAiOpen(false)} width={1000}
        okText={`导入选中的 ${aiPicked.length} 家`} okButtonProps={{ disabled: aiPicked.length === 0 }} onOk={importAiList}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Input value={aiQuery} onChange={e => setAiQuery(e.target.value)} onPressEnter={runAiList} placeholder="描述你要的名单，例如：中国半导体设计公司 Top 20" />
          <InputNumber min={5} max={100} value={aiCount} onChange={v => setAiCount(v || 30)} addonAfter="家" style={{ width: 130 }} />
          <Button type="primary" icon={<RobotOutlined />} loading={aiLoading} onClick={runAiList}>生成</Button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {LIST_PRESETS.map(p => <Tag key={p} style={{ cursor: 'pointer' }} onClick={() => setAiQuery(p)}>{p}</Tag>)}
        </div>
        <Table size="small" rowKey="_key" loading={aiLoading} dataSource={aiList} pagination={false} scroll={{ y: 420 }}
          rowSelection={{ selectedRowKeys: aiPicked, onChange: setAiPicked, getCheckboxProps: (r: any) => ({ disabled: !!r.existing_id }) }}
          locale={{ emptyText: '联网检索榜单 / 权威来源后生成名单，确认后再导入。名单由大模型生成，导入前请过一眼。' }}
          columns={[
            { title: '企业', dataIndex: 'name', width: 200, render: (t: string, r: any) => <div><Text strong>{t}</Text>{r.name_en && r.name_en !== t && <div style={{ fontSize: 11, color: BRAND.ink3 }}>{r.name_en}</div>}</div> },
            { title: '分类', dataIndex: 'segment', width: 90, render: (s: string) => <Tag color={SEGMENT_LABELS[s]?.color}>{SEGMENT_LABELS[s]?.label}</Tag> },
            { title: '行业', dataIndex: 'industry', width: 110 },
            { title: '总部', dataIndex: 'hq_country', width: 80 },
            { title: '依据', dataIndex: 'reasoning', ellipsis: true, render: (t: string, r: any) => <Tooltip title={t}><span style={{ fontSize: 12 }}>{r.jv_partners ? `【${r.jv_partners}】` : ''}{t}</span></Tooltip> },
            { title: '', width: 80, render: (_: any, r: any) => r.existing_id ? <Tag>已在库</Tag> : null },
          ]} />
      </Modal>
    </div>
  );
}
