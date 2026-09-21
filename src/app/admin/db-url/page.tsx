'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Table, Tag, Space, Select, Modal, Form, Typography, Popconfirm, Tooltip, App } from 'antd';
import { LinkOutlined, PlusOutlined, DeleteOutlined, EditOutlined, HeartOutlined, GlobalOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { CompanyPicker, PickedCompany } from '@/components/admin/CompanyPicker';
import { URL_TYPES, URL_TYPE_ORDER, URL_TYPE_OPTIONS, subtypeOptions, subtypeLabel, urlTypeMeta } from '@/lib/url-types';
import { SEGMENT_LABELS } from '@/lib/company-fields';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;

const HEALTH: Record<string, { label: string; color: string }> = {
  alive: { label: '可访问', color: 'success' }, redirect: { label: '跳转', color: 'warning' },
  dead: { label: '失效', color: 'error' }, unknown: { label: '未检查', color: 'default' },
};

function DbUrlInner() {
  const { message } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [health, setHealth] = useState('');
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [checking, setChecking] = useState(false);

  const [editing, setEditing] = useState<any | null>(null); // {} = 新增
  const [form] = Form.useForm();
  const formType = Form.useWatch('type', form);
  const [company, setCompany] = useState('');
  const [picked, setPicked] = useState<PickedCompany | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, type, health, withStats: '1' });
      const json = await (await fetch(`/api/admin/db-url?${qs}`)).json();
      if (!json.ok) throw new Error(json.error);
      setData(json.data); setTotal(json.total); setStats(json.stats || {});
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [page, pageSize, search, type, health]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (row: any | null) => {
    setEditing(row || {});
    form.resetFields();
    form.setFieldsValue(row || { type: 'campus' });
    setCompany(row?.company || '');
    setPicked(row?.company_id ? { id: row.company_id, name: row.company, name_en: null } : null);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      if (!company.trim()) { message.warning('请填写企业'); return; }
      const body = { ...values, company: company.trim(), company_id: picked?.id, ...(editing?.id ? { id: editing.id } : {}) };
      const json = await (await fetch('/api/admin/db-url', { method: editing?.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (!json.ok) throw new Error(json.error);
      message.success(editing?.id ? '已保存' : '已新增');
      setEditing(null);
      load();
    } catch (e: any) { if (e?.message) message.error(e.message); }
  };

  const remove = async (ids: React.Key[]) => {
    const json = await (await fetch(`/api/admin/db-url?ids=${ids.join(',')}`, { method: 'DELETE' })).json();
    if (!json.ok) { message.error(json.error); return; }
    message.success(`已删除 ${json.deleted} 条`); setSelected([]); load();
  };

  /** 健康检查：纯 HTTP，不耗 Token。选中则查选中的，否则查当前页 */
  const runHealthCheck = async () => {
    const ids = selected.length ? selected : data.map(r => r.id);
    if (!ids.length) return;
    setChecking(true);
    try {
      let alive = 0, redirect = 0, dead = 0;
      for (let i = 0; i < ids.length; i += 40) {
        const json = await (await fetch('/api/admin/db-url/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(i, i + 40) }) })).json();
        if (!json.ok) throw new Error(json.error);
        alive += json.summary.alive; redirect += json.summary.redirect; dead += json.summary.dead;
      }
      message.success(`检查完成：可访问 ${alive}，跳转 ${redirect}，失效 ${dead}`);
      load();
    } catch (e: any) { message.error(`检查失败: ${e.message}`); }
    finally { setChecking(false); }
  };

  const columns = [
    {
      title: '企业', dataIndex: 'company', width: 190,
      render: (t: string, r: any) => (
        <div>
          <a onClick={() => r.company_id && router.push(`/admin/db-company/${r.company_id}`)} style={{ fontWeight: 600 }}>{t}</a>
          {r.company_ref?.segment && <Tag color={SEGMENT_LABELS[r.company_ref.segment]?.color} style={{ marginLeft: 6, fontSize: 11, lineHeight: '16px' }}>{SEGMENT_LABELS[r.company_ref.segment]?.label}</Tag>}
          {r.unit && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.unit}</div>}
        </div>
      ),
    },
    { title: '类型', width: 170, render: (_: any, r: any) => <Space size={2} wrap><Tag color={urlTypeMeta(r.type).color}>{urlTypeMeta(r.type).label}</Tag>{r.subtype && <Tag>{subtypeLabel(r.type, r.subtype)}</Tag>}</Space> },
    { title: '标题', dataIndex: 'title', width: 280, ellipsis: true, render: (t: string) => t || '-' },
    { title: 'URL', dataIndex: 'url', ellipsis: true, render: (u: string) => <a href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{u}</a> },
    { title: '说明', dataIndex: 'reasoning', width: 260, ellipsis: true, render: (t: string) => <Tooltip title={t}><Text type="secondary" style={{ fontSize: 12 }}>{t || '-'}</Text></Tooltip> },
    {
      title: '健康', dataIndex: 'health_status', width: 90,
      render: (h: string, r: any) => {
        const m = HEALTH[h] || HEALTH.unknown;
        const tip = r.url_health ? `HTTP ${r.url_health.httpCode || '-'} · ${r.url_health.latencyMs}ms${r.url_health.redirectUrl ? ` → ${r.url_health.redirectUrl}` : ''}${r.url_health.error ? ` · ${r.url_health.error}` : ''}` : '';
        return <Tooltip title={tip}><Tag color={m.color}>{m.label}</Tag></Tooltip>;
      },
    },
    { title: '入库时间', dataIndex: 'created_at', width: 110, render: (t: string) => <Text type="secondary" style={{ fontSize: 12 }}>{new Date(t).toLocaleDateString('zh-CN')}</Text> },
    {
      title: '操作', width: 90, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="删除这条 URL？" onConfirm={() => remove([r.id])} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const totalAll = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div style={{ maxWidth: 1700, margin: '0 auto' }}>
      <PageHeader
        icon={<LinkOutlined />}
        title="信息源库"
        description="所有企业的官方 URL：官网、企业信息、校招与实习、岗位详情、招聘总入口。校招类 URL 可在「校招岗位提取」里直接选用。"
        extra={<>
          <Button icon={<HeartOutlined />} loading={checking} onClick={runHealthCheck}>健康检查（{selected.length ? `选中 ${selected.length} 条` : '当前页'}）</Button>
          <Button icon={<PlusOutlined />} onClick={() => openEdit(null)}>新增 URL</Button>
          <Button type="primary" icon={<GlobalOutlined />} onClick={() => router.push('/admin/tool-url')}>AI 检索 URL</Button>
        </>}
      />

      <StatCards loading={loading && !totalAll} items={[
        { label: 'URL 总数', value: totalAll, icon: <LinkOutlined /> },
        ...URL_TYPE_ORDER.map(t => ({ label: URL_TYPES[t].label, value: stats[t] || 0 })),
      ]} />

      <Panel padding={16}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input.Search placeholder="搜索企业 / 标题 / 业务线 / URL" allowClear style={{ width: 320 }} onSearch={v => { setSearch(v); setPage(1); }} />
          <Select value={type} style={{ width: 150 }} onChange={v => { setType(v); setPage(1); }} options={[{ value: '', label: '全部类型' }, ...URL_TYPE_OPTIONS]} />
          <Select value={health} style={{ width: 130 }} onChange={v => { setHealth(v); setPage(1); }} options={[{ value: '', label: '全部健康状态' }, ...Object.entries(HEALTH).map(([value, m]) => ({ value, label: m.label }))]} />
          <div style={{ flex: 1 }} />
          {selected.length > 0 && (
            <Popconfirm title={`删除选中的 ${selected.length} 条 URL？`} onConfirm={() => remove(selected)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
              <Button danger icon={<DeleteOutlined />}>删除选中</Button>
            </Popconfirm>
          )}
        </div>
        <Table
          rowKey="id" size="small" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1500 }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        />
      </Panel>

      <Modal title={editing?.id ? '编辑 URL' : '新增 URL'} open={!!editing} onOk={save} onCancel={() => setEditing(null)} okText="保存" width={600} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item label="企业" required help="库里没有的企业会自动建档">
            <CompanyPicker size="middle" value={company} onChange={setCompany} picked={picked} onPick={setPicked} />
          </Form.Item>
          <Form.Item name="url" label="URL" rules={[{ required: true, message: '请输入 URL' }, { type: 'url', message: '请输入完整的 http(s) 链接' }]}><Input placeholder="https://" /></Form.Item>
          <Space style={{ display: 'flex' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="type" label="类型" rules={[{ required: true }]}><Select options={URL_TYPE_OPTIONS} onChange={() => form.setFieldValue('subtype', undefined)} /></Form.Item>
            <Form.Item name="subtype" label="细分类"><Select allowClear options={subtypeOptions(formType)} disabled={!subtypeOptions(formType).length} /></Form.Item>
          </Space>
          <Form.Item name="title" label="标题"><Input /></Form.Item>
          <Form.Item name="unit" label="业务线 / 子公司 / 地区"><Input placeholder="适用于整个企业则留空" /></Form.Item>
          <Form.Item name="reasoning" label="说明"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function DbUrlPage() {
  return <Suspense><DbUrlInner /></Suspense>;
}
