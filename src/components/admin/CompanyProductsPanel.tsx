'use client';

/**
 * 企业详情 · 核心产品页签（数据部门 11-20 赞灵）：
 *   单独编辑——逐条改、手动新增（人工填的字段锁定，流水线不覆盖）；
 *   从官网抓——官网提到的相关产品都入库，每条带抓取页面链接；也可以贴几个链接让 AI 只读这些页。
 */
import React, { useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, Modal, Select, Space, Switch, Table, Tooltip, Typography } from 'antd';
import { EditOutlined, GlobalOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { PRODUCT_COLUMNS } from '@/components/admin/CompanyRunView';
import { PRODUCT_KIND_LABELS, PRODUCT_STATUS_LABELS } from '@/lib/company-fields';
import { useModel } from '@/lib/model-context';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;
const KIND_OPTS = Object.entries(PRODUCT_KIND_LABELS).map(([value, v]) => ({ value, label: v.label }));
const STATUS_OPTS = Object.entries(PRODUCT_STATUS_LABELS).map(([value, v]) => ({ value, label: v.label }));
const kwList = (t: any): string[] => Array.isArray(t) ? t : String(t || '').split(/[；;,，]/).map(s => s.trim()).filter(Boolean);
const shortUrl = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/$/, '').slice(0, 48); } catch { return u.slice(0, 48); } };

interface Props {
  companyId: number;
  website?: string | null;
  products: any[];
  actionCol: any;
  onChanged: () => void;
}

export function CompanyProductsPanel({ companyId, website, products, actionCol, onChanged }: Props) {
  const { message } = App.useApp();
  const { currentModel } = useModel();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<any | null>(null);   // {} = 新增
  const [saving, setSaving] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [links, setLinks] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [lastRun, setLastRun] = useState<{ pages: { url: string; ok: boolean; products: number }[]; found: number; saved: number } | null>(null);

  const openEdit = (row: any | null) => {
    form.setFieldsValue(row ? { ...row, tech_keywords: kwList(row.tech_keywords) } : { name: '', status: 'active', is_flagship: false, tech_keywords: [] });
    setEditing(row || {});
  };
  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const body = { entity: 'products', ...(editing?.id ? { id: editing.id } : { companyId }), ...v, tech_keywords: (v.tech_keywords || []).join('；') };
      const json = await (await fetch('/api/db/company-entities', { method: editing?.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (!json.success) throw new Error(json.error);
      message.success(editing?.id ? '已保存，改过的字段已锁定' : '已新增');
      setEditing(null); onChanged();
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  const crawl = async (urls: string[]) => {
    setCrawling(true); setLastRun(null);
    const hide = message.loading(urls.length ? `AI 正在读 ${urls.length} 个链接…` : 'AI 正在读官网的产品页，约 1–3 分钟…', 0);
    try {
      const json = await (await fetch(`/api/db/companies/${companyId}/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls, model: currentModel }) })).json();
      if (!json.success) throw new Error(json.error);
      setLastRun(json); setLinkOpen(false); setLinks('');
      message.success(`读了 ${json.pages.length} 页，找到 ${json.found} 个产品，新增 / 补全 ${json.saved} 条`);
      onChanged();
    } catch (e: any) { message.error(`抓取失败：${e.message}`); }
    finally { hide(); setCrawling(false); }
  };

  const columns = [
    PRODUCT_COLUMNS[0],
    // 抓取页面的链接放在产品名旁边，一眼能点（数据部门 11-20）
    { title: '来源页', dataIndex: 'source_url', width: 190, render: (u: string) => u ? <a href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12, wordBreak: 'break-all' }}><LinkOutlined /> {shortUrl(u)}</a> : <Text type="secondary">-</Text> },
    ...PRODUCT_COLUMNS.slice(1, -1),
    { title: '', width: 44, fixed: 'right' as const, render: (_: any, r: any) => <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip> },
    actionCol,
  ];

  return (
    <div>
      <Space wrap style={{ marginBottom: 10 }}>
        <Button type="primary" icon={<GlobalOutlined />} loading={crawling && !linkOpen} disabled={crawling || !website} onClick={() => crawl([])}>从官网抓取</Button>
        <Button icon={<LinkOutlined />} disabled={crawling} onClick={() => setLinkOpen(true)}>贴链接让 AI 抓</Button>
        <Button icon={<PlusOutlined />} onClick={() => openEdit(null)}>手动新增</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>{website ? '官网提到的产品都会抓进来，每条带来源页；已有的只补空，人工改过 / 删过的不动。' : '还没有官网：先在档案里填官网，或者直接贴产品页链接。'}</Text>
      </Space>
      {lastRun && (
        <Alert type="info" showIcon closable onClose={() => setLastRun(null)} style={{ marginBottom: 10 }}
          message={`这次读了 ${lastRun.pages.length} 页，找到 ${lastRun.found} 个产品，新增 / 补全 ${lastRun.saved} 条`}
          description={<div style={{ fontSize: 12, maxHeight: 140, overflowY: 'auto' }}>{lastRun.pages.map(p => <div key={p.url}>{p.ok ? `${p.products} 个` : '打不开'} · <a href={p.url} target="_blank" rel="noreferrer">{shortUrl(p.url)}</a></div>)}</div>} />
      )}
      <Table rowKey="id" size="small" scroll={{ x: 1200 }} dataSource={products} columns={columns} pagination={false}
        locale={{ emptyText: <Empty description="还没有核心产品。点「从官网抓取」，或贴产品页链接让 AI 抓。" /> }} />

      <Modal title={editing?.id ? `编辑产品 · ${editing.name}` : '手动新增产品'} open={!!editing} onOk={save} confirmLoading={saving} onCancel={() => setEditing(null)} okText="保存" width={640} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="产品名" rules={[{ required: true, message: '请输入产品名' }, { max: 80, message: '80 字以内' }]}><Input /></Form.Item>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="category" label="品类" style={{ width: 200 }}><Input /></Form.Item>
            <Form.Item name="kind" label="类型" style={{ width: 150 }}><Select allowClear options={KIND_OPTS} /></Form.Item>
            <Form.Item name="status" label="状态" style={{ width: 130 }}><Select options={STATUS_OPTS} /></Form.Item>
            <Form.Item name="is_flagship" label="拳头产品" valuePropName="checked"><Switch /></Form.Item>
          </Space>
          <Form.Item name="tech_keywords" label="技术关键词"><Select mode="tags" tokenSeparators={[',', '，', '；', ';']} open={false} suffixIcon={null} placeholder="输入后回车" /></Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></Form.Item>
          <Form.Item name="source_url" label="来源页链接" rules={[{ type: 'url', message: '请输入完整链接' }]}><Input placeholder="https://" /></Form.Item>
        </Form>
        {editing?.id && <div style={{ fontSize: 12, color: BRAND.ink4 }}>改过的字段会锁定，以后跑画像 / 抓官网都不再覆盖。</div>}
      </Modal>

      <Modal title="贴链接让 AI 抓产品" open={linkOpen} onOk={() => crawl(links.split(/\s+/).filter(u => /^https?:\/\//.test(u)))} okText="开始抓" confirmLoading={crawling}
        okButtonProps={{ disabled: !links.split(/\s+/).some(u => /^https?:\/\//.test(u)) }} onCancel={() => { if (!crawling) setLinkOpen(false); }} width={600}>
        <div style={{ fontSize: 12.5, color: BRAND.ink3, marginBottom: 8 }}>一行一个：产品中心、产品分类页、单个产品页都行（最多 12 个）。AI 只读这些页，页上提到的产品都入库，来源记这一页。</div>
        <Input.TextArea value={links} onChange={e => setLinks(e.target.value)} autoSize={{ minRows: 5, maxRows: 12 }} placeholder={'https://www.example.com/products\nhttps://www.example.com/product/a1'} />
      </Modal>
    </div>
  );
}
