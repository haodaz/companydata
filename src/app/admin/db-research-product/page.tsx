'use client';

/**
 * 科研产品库（数据部门 10-21 #21；用户 10-21：服务于仪器设备服务的评价 + 资源推荐平台）：
 * 仪器设备 / 试剂耗材 / 服务，每条挂在企业实体库的厂商上；产品手册、规格书、操作手册等资料一并带回（百业虚拟工位也要用）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Checkbox, Descriptions, Drawer, Empty, Image, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { AppstoreOutlined, DatabaseOutlined, FileTextOutlined, FlagOutlined, ProfileOutlined, ShopOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { INSTRUMENT_CATEGORIES, INSTRUMENT_CATEGORY_NAMES } from '@/lib/instrument-categories';
import { DOC_TYPE_NAMES, PRODUCT_TYPES, kindOf } from '@/lib/research-products';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;
const TYPE_NAME: Record<string, string> = Object.fromEntries(PRODUCT_TYPES.map(t => [t.value, t.name]));
const TYPE_COLOR: Record<string, string> = { instruments_and_equipment: 'geekblue', reagents_and_consumables: 'green', software: 'purple', services: 'orange' };
const split = (s: any) => String(s || '').split(/[；;]/).map(x => x.trim()).filter(Boolean);
const size = (b?: number | null) => !b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export default function DbResearchProductPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>({});
  const [f, setF] = useState({ type: '', category: '', origin: '', supplier: '', search: '', doc: false, price: false });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '50', type: f.type, category: f.category, origin: f.origin, supplier: f.supplier, search: f.search, doc: f.doc ? '1' : '', price: f.price ? '1' : '' });
      const j = await (await fetch(`/api/db/research-products?${q}`)).json();
      if (!j.success) throw new Error(j.error);
      setData(j.data); setTotal(j.total); setStats(j.stats);
    } catch (e: any) { message.error(`加载失败：${e.message}`); }
    finally { setLoading(false); }
  }, [page, f, message]);
  // ?supplier= 从厂商页跳过来（不用 useSearchParams，免得整页要包 Suspense）
  useEffect(() => { const s = new URLSearchParams(window.location.search).get('supplier'); if (s) setF(x => ({ ...x, supplier: s })); }, []);
  useEffect(() => { load(); }, [load]);
  const set = (p: Partial<typeof f>) => { setF(x => ({ ...x, ...p })); setPage(1); };
  const open = async (id: number) => {
    setDetail({ loading: true });
    const j = await (await fetch(`/api/db/research-products?id=${id}`)).json();
    setDetail(j.success ? j.data : null);
  };
  const byType = (v: string) => stats.byType?.find((t: any) => t.value === v)?.n ?? 0;
  const pct = (n: number) => (stats.products ? `${Math.round((n / stats.products) * 100)}%` : '—');

  return (
    <div>
      <PageHeader title="科研产品库" icon={<DatabaseOutlined />}
        description="科研仪器设备、试剂耗材和服务，每条挂在企业实体库的厂商上。产品手册、规格书、操作手册有的一并带回；信息只取自厂商官网原文。" />

      <StatCards loading={loading && !stats.products} items={[
        { label: '产品 / 服务', value: stats.products, icon: <AppstoreOutlined />, color: BRAND.primary, hint: `仪器 ${byType('instruments_and_equipment')} · 试剂耗材 ${byType('reagents_and_consumables')} · 软件 ${byType('software')} · 服务 ${byType('services')}` },
        { label: '厂商', value: stats.suppliers, icon: <ShopOutlined />, color: '#0891b2', hint: `覆盖 ${stats.categories_covered ?? 0} / ${stats.categories_total ?? 22} 类` },
        { label: '带资料的产品', value: stats.with_docs, icon: <FileTextOutlined />, color: '#16a34a', hint: `资料 ${stats.docs ?? 0} 份${(stats.docsByType || []).length ? '：' + stats.docsByType.map((d: any) => `${DOC_TYPE_NAMES[d.key] || d.key} ${d.n}`).join(' · ') : ''}` },
        { label: '有规格参数', value: stats.with_specs, icon: <ProfileOutlined />, color: '#7c3aed', hint: `占 ${pct(stats.with_specs || 0)} · 有产品图 ${stats.with_images ?? 0} · 有明码价格 ${stats.with_price ?? 0}` },
        { label: '国产', value: stats.domestic, icon: <FlagOutlined />, color: '#d97706', hint: `占 ${pct(stats.domestic || 0)}` },
      ]} />

      <Panel padding={16}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="搜产品 / 品牌 / 型号 / 标签 / 厂商" allowClear style={{ width: 280 }} onSearch={v => set({ search: v })} />
          <Select value={f.type} style={{ width: 130 }} onChange={v => set({ type: v })} options={[{ value: '', label: '全部类型' }, ...PRODUCT_TYPES.map(t => ({ value: t.value, label: t.name }))]} />
          <Select value={f.category} style={{ width: 200 }} onChange={v => set({ category: v })} options={[{ value: '', label: '全部类目' }, ...INSTRUMENT_CATEGORIES.map(c => ({ value: c.key, label: c.name }))]} />
          <Select value={f.origin} style={{ width: 130 }} onChange={v => set({ origin: v })} options={[{ value: '', label: '国产 + 进口' }, { value: 'domestic', label: '只看国产' }, { value: 'imported', label: '只看进口' }]} />
          <Checkbox checked={f.doc} onChange={e => set({ doc: e.target.checked })}>有资料</Checkbox>
          <Checkbox checked={f.price} onChange={e => set({ price: e.target.checked })}>有明码价格</Checkbox>
          {f.supplier && <Tag closable onClose={() => set({ supplier: '' })}>只看厂商 #{f.supplier}</Tag>}
        </Space>
        <Table rowKey="id" size="small" loading={loading} dataSource={data}
          locale={{ emptyText: <Empty description="还没有产品——先从厂商官网抓一批" /> }}
          onRow={r => ({ onClick: () => open(r.id), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: 50, total, showSizeChanger: false, onChange: setPage, showTotal: t => `${t} 条` }}
          columns={[
            { title: '', dataIndex: 'image', width: 64, render: (src: string) => src
              ? <img src={src} alt="" referrerPolicy="no-referrer" style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 6, background: '#f8fafc', border: `1px solid ${BRAND.border}` }} />
              : <div style={{ width: 52, height: 52, borderRadius: 6, background: '#f8fafc', border: `1px dashed ${BRAND.border}` }} /> },
            { title: '名称', dataIndex: 'name', width: 260, render: (v: string, r: any) => (
              <div>
                <div style={{ fontWeight: 600, color: BRAND.primary }}>{v}</div>
                <div style={{ fontSize: 12, color: BRAND.ink3 }}>{[r.brand, r.model_no].filter(Boolean).join(' · ')}</div>
              </div>) },
            { title: '类型', dataIndex: 'type', width: 110, render: (t: string, r: any) => <Tag color={TYPE_COLOR[t]}>{kindOf(r.kind)?.name || TYPE_NAME[t] || t}</Tag> },
            { title: '类目', dataIndex: 'category', width: 140, render: (c: string) => c ? <Text style={{ fontSize: 12 }}>{INSTRUMENT_CATEGORY_NAMES[c] || c}</Text> : '—' },
            { title: '标签', dataIndex: 'labels', render: (v: string) => <Space size={4} wrap>{split(v).map(x => <Tag key={x} style={{ fontSize: 11 }}>{x}</Tag>)}</Space> },
            { title: '厂商', dataIndex: 'supplier', width: 180, render: (s: any) => s ? <a onClick={e => { e.stopPropagation(); router.push(`/admin/db-company/${s.id}`); }} style={{ fontSize: 12 }}>{s.name}</a> : '—' },
            { title: '资料', dataIndex: 'docs', width: 150, render: (d: string[]) => d.length ? <Space size={2} wrap>{[...new Set(d)].map(k => <Tag key={k} color="green" style={{ fontSize: 11 }}>{DOC_TYPE_NAMES[k] || k}{d.filter(x => x === k).length > 1 ? ` ×${d.filter(x => x === k).length}` : ''}</Tag>)}</Space> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text> },
            { title: '参数', dataIndex: 'specs_count', width: 60, align: 'right' as const, render: (n: number) => n || <Text type="secondary">—</Text> },
            { title: '价格', dataIndex: 'price', width: 100, render: (p: string) => p ? <Text style={{ fontSize: 12 }}>{p}</Text> : <Text type="secondary">—</Text> },
          ]} />
      </Panel>

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={720} loading={detail?.loading}
        title={detail && !detail.loading ? <span>{detail.name} <Tag color={TYPE_COLOR[detail.type]} style={{ marginLeft: 6 }}>{kindOf(detail.kind)?.name || TYPE_NAME[detail.type]}</Tag></span> : '产品'}>
        {detail && !detail.loading && (
          <div>
            {detail.images?.length > 0 && (
              <Image.PreviewGroup>
                <Space wrap style={{ marginBottom: 12 }}>
                  {detail.images.map((g: any, i: number) => <Image key={i} src={g.src} alt={g.alt || ''} width={i === 0 ? 220 : 100} height={i === 0 ? 220 : 100} referrerPolicy="no-referrer" style={{ objectFit: 'contain', background: '#f8fafc', borderRadius: 8, border: `1px solid ${BRAND.border}` }} />)}
                </Space>
              </Image.PreviewGroup>
            )}
            <Descriptions size="small" column={2} bordered items={[
              { key: 'brand', label: '品牌', children: detail.brand || '—' },
              { key: 'model', label: '型号', children: detail.model_no || '—' },
              { key: 'sup', label: '厂商', children: detail.supplier ? <a onClick={() => router.push(`/admin/db-company/${detail.supplier.id}`)}>{detail.supplier.name}</a> : '—' },
              { key: 'origin', label: '国产 / 进口', children: detail.brand_origin === 'domestic' ? '国产' : detail.brand_origin === 'imported' ? '进口' : '—' },
              { key: 'cat', label: '类目', children: INSTRUMENT_CATEGORY_NAMES[detail.category] || '—' },
              { key: 'price', label: '价格', children: detail.price || '—' },
              { key: 'spec', label: '规格', span: 2, children: detail.specification || '—' },
              { key: 'lab', label: '标签', span: 2, children: split(detail.labels).map((x: string) => <Tag key={x}>{x}</Tag>) },
              { key: 'dis', label: '适用学科', span: 2, children: split(detail.disciplines).join('、') || '—' },
              { key: 'app', label: '应用场景', span: 2, children: split(detail.applications).join('、') || '—' },
              ...(detail.type === 'services' ? [{ key: 'mode', label: '服务方式', children: detail.service_mode || '—' }, { key: 'reg', label: '服务地区', children: detail.service_region || '—' }] : []),
              { key: 'ext', label: '编号', children: <Text code style={{ fontSize: 12 }}>{detail.external_id}</Text> },
              { key: 'src', label: '来源', children: detail.source_url ? <a href={detail.source_url} target="_blank" rel="noreferrer">产品页</a> : '—' },
            ]} />
            {detail.description && <>
              <Text strong style={{ display: 'block', margin: '16px 0 6px' }}>简介</Text>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: BRAND.ink }} dangerouslySetInnerHTML={{ __html: detail.description }} />
            </>}
            {detail.specs && Object.keys(detail.specs).length > 0 && <>
              <Text strong style={{ display: 'block', margin: '16px 0 6px' }}>规格参数</Text>
              <Table size="small" pagination={false} rowKey="k" dataSource={Object.entries(detail.specs).map(([k, v]) => ({ k, v: String(v) }))}
                columns={[{ title: '参数', dataIndex: 'k', width: 220 }, { title: '值', dataIndex: 'v' }]} />
            </>}
            <Text strong style={{ display: 'block', margin: '16px 0 6px' }}>资料（{detail.docs.length}）</Text>
            {detail.docs.length ? detail.docs.map((d: any) => (
              <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${BRAND.border}` }}>
                <Tag color="green">{DOC_TYPE_NAMES[d.doc_type] || d.doc_type}</Tag>
                <a href={`/api/db/research-products/doc?id=${d.id}`} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 13 }}>{d.title || d.url}</a>
                <Text type="secondary" style={{ fontSize: 12 }}>{[d.file_type?.toUpperCase(), d.pages ? `${d.pages} 页` : '', size(d.size_bytes), d.storage_path ? '已存档' : '仅链接'].filter(Boolean).join(' · ')}</Text>
              </div>
            )) : <Text type="secondary">官网没找到手册 / 规格书</Text>}
          </div>
        )}
      </Drawer>
    </div>
  );
}
