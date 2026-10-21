'use client';

/**
 * 科研仪器厂商（数据部门 10-21 #21）：企业实体库里有「仪器类目」的企业——用户定：企业实体库的筛选视图，带专门的统计卡便于核算。
 * 类目骨架 = 国发〔2014〕70 号的 15 类科研仪器 + 7 类试剂耗材；每类都要有国内厂商，缺的标红，去补搜。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { AppstoreOutlined, BankOutlined, ExperimentOutlined, FlagOutlined, GlobalOutlined, ShopOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { INSTRUMENT_CATEGORIES, INSTRUMENT_CATEGORY_NAMES, INSTRUMENT_EXHIBITIONS } from '@/lib/instrument-categories';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;

export default function DbSupplierPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>({});
  const [coverage, setCoverage] = useState<any[]>([]);
  const [byExhibition, setByExhibition] = useState<any[]>([]);
  const [f, setF] = useState({ category: '', scope: '', exhibition: '', search: '' });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '50', ...f });
      const j = await (await fetch(`/api/db/suppliers?${q}`)).json();
      if (!j.success) throw new Error(j.error);
      setData(j.data); setTotal(j.total); setStats(j.stats); setCoverage(j.coverage); setByExhibition(j.byExhibition);
    } catch (e: any) { message.error(`加载失败：${e.message}`); }
    finally { setLoading(false); }
  }, [page, f, message]);
  useEffect(() => { load(); }, [load]);
  const set = (p: Partial<typeof f>) => { setF(x => ({ ...x, ...p })); setPage(1); };

  return (
    <div>
      <PageHeader title="科研仪器厂商" icon={<ExperimentOutlined />}
        description="企业实体库里做科研仪器 / 试剂耗材的企业。类目按国发〔2014〕70 号的 15 类科研仪器 + 7 类试剂耗材，每类都要有国内厂商；展会展商名单是补充来源。" />

      <StatCards loading={loading && !stats.suppliers} items={[
        { label: '厂商', value: stats.suppliers, icon: <BankOutlined />, color: BRAND.primary, hint: `国内 ${stats.domestic ?? 0} · 海外 ${(stats.suppliers ?? 0) - (stats.domestic ?? 0)}` },
        { label: '类目覆盖', value: `${stats.categories_covered ?? 0} / ${stats.categories_total ?? 22}`, icon: <AppstoreOutlined />, color: '#0891b2', hint: stats.categories_missing_domestic?.length ? `${stats.categories_missing_domestic.length} 类还没有国内厂商` : '每类都有国内厂商' },
        { label: '产品', value: stats.products, icon: <ShopOutlined />, color: '#16a34a', hint: `${stats.suppliers_with_products ?? 0} 家厂商有产品` },
        { label: '来自展会名单', value: stats.from_exhibitions, icon: <FlagOutlined />, color: '#d97706', hint: '其余是按类目单独搜的' },
      ]} />

      {/* 22 类覆盖：每类几家、其中国内几家；没有国内厂商的标红 */}
      <Panel style={{ marginBottom: 16 }} padding={16}>
        <Text strong style={{ fontSize: 13 }}>类目覆盖</Text>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>点一下只看这一类；红色 = 还没有国内厂商</Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginTop: 10 }}>
          {coverage.map(c => {
            const on = f.category === c.key, warn = c.domestic === 0;
            return (
              <div key={c.key} onClick={() => set({ category: on ? '' : c.key })} style={{ cursor: 'pointer', borderRadius: 10, padding: '8px 10px', border: `1px solid ${on ? BRAND.primary : warn ? '#fca5a5' : BRAND.border}`, background: on ? '#eef2ff' : warn ? '#fef2f2' : '#fafafa' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: warn ? '#b91c1c' : BRAND.ink }}>{c.name}{c.type === 'reagent' && <Tag style={{ marginLeft: 4, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>试剂耗材</Tag>}</div>
                <div style={{ fontSize: 12, color: BRAND.ink3, marginTop: 2 }}>{c.suppliers} 家 · 国内 {c.domestic}{c.products ? ` · 产品 ${c.products}` : ''}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel padding={16}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="搜厂商名" allowClear style={{ width: 240 }} onSearch={v => set({ search: v })} />
          <Select value={f.category} style={{ width: 200 }} onChange={v => set({ category: v })} options={[{ value: '', label: '全部类目' }, ...INSTRUMENT_CATEGORIES.map(c => ({ value: c.key, label: c.name }))]} />
          <Select value={f.scope} style={{ width: 130 }} onChange={v => set({ scope: v })} options={[{ value: '', label: '国内 + 海外' }, { value: 'cn', label: '只看国内' }, { value: 'intl', label: '只看海外' }]} />
          <Select value={f.exhibition} style={{ width: 210 }} onChange={v => set({ exhibition: v })} popupMatchSelectWidth={false}
            options={[{ value: '', label: '全部来源' }, ...byExhibition.map(e => ({ value: e.name, label: `${e.name}（${e.suppliers}）` }))]} />
        </Space>
        <Table rowKey="id" size="small" loading={loading} dataSource={data}
          pagination={{ current: page, pageSize: 50, total, showSizeChanger: false, onChange: setPage, showTotal: t => `${t} 家` }}
          columns={[
            { title: '厂商', dataIndex: 'name', width: 260, render: (v: string, r: any) => (
              <div style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/db-company/${r.id}`)}>
                <div style={{ fontWeight: 600, color: BRAND.primary }}>{v}</div>
                {r.name_en && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.name_en}</div>}
              </div>) },
            { title: '国内 / 海外', dataIndex: 'domestic', width: 100, render: (d: boolean, r: any) => <Tag color={d ? 'red' : 'blue'} icon={d ? <FlagOutlined /> : <GlobalOutlined />}>{d ? '国内' : (r.country || '海外')}</Tag> },
            { title: '仪器类目', dataIndex: 'supplier_categories', render: (v: string[]) => <Space size={4} wrap>{(v || []).map(k => <Tag key={k}>{INSTRUMENT_CATEGORY_NAMES[k] || k}</Tag>)}</Space> },
            { title: '展会', dataIndex: 'supplier_exhibitions', width: 200, render: (v: string[]) => (v || []).length ? <Tooltip title={(v || []).map(n => INSTRUMENT_EXHIBITIONS.find(e => e.name === n)?.full || n).join('、')}><Text style={{ fontSize: 12 }}>{(v || []).join('、')}</Text></Tooltip> : <Text type="secondary" style={{ fontSize: 12 }}>按类目搜的</Text> },
            { title: '产品', dataIndex: 'products', width: 70, align: 'right' as const, render: (n: number) => n || <Text type="secondary">—</Text> },
            { title: '官网', dataIndex: 'official_website', width: 180, render: (u: string) => u ? <a href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12, wordBreak: 'break-all' }}>{u.replace(/^https?:\/\//, '').slice(0, 30)}</a> : '—' },
          ]} />
      </Panel>
    </div>
  );
}
