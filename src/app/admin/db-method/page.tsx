'use client';

/**
 * 实验方法库（迁移 058，2026-11-02）：仪器 / 试剂 ↔ 方法 ↔ 学科 / 百业科研空间的中间层。
 * 一个方法 = 研究生能说「我会做 XX」的一类实验手艺；带操作指南（步骤、常见坑、安全、练的本事）、
 * 用到的通用仪器（百业工具设备库）、挂上的科研产品（科研产品库里真实的型号）。指南是 AI 按通用实验常识写的，待审核。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Descriptions, Drawer, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ApartmentOutlined, AppstoreOutlined, ExperimentOutlined, LinkOutlined, ReadOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { REVIEW_STATUS } from '@/lib/review-status';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;
const LEVEL_COLOR: Record<string, string> = { 入门: 'green', 进阶: 'blue', 专精: 'purple' };
const split = (s: any) => String(s || '').split(/[；;]/).map(x => x.trim()).filter(Boolean);

export default function DbMethodPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [f, setF] = useState({ field: '', level: '', search: '' });
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch('/api/db/research-methods')).json();
      if (!j.success) throw new Error(j.error);
      setData(j.data); setStats(j.stats);
    } catch (e: any) { message.error(`加载失败：${e.message}`); }
    finally { setLoading(false); }
  }, [message]);
  useEffect(() => { load(); }, [load]);
  const open = async (id: number) => {
    setDetail({ loading: true });
    const j = await (await fetch(`/api/db/research-methods?id=${id}`)).json();
    setDetail(j.success ? j.data : null);
  };
  // ?id= 直接打开某个方法（从工具设备详情跳过来）
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get('id')); if (id) open(id); }, []);

  const rows = useMemo(() => data.filter(m => (!f.field || m.field === f.field) && (!f.level || m.level === f.level)
    && (!f.search || `${m.name} ${m.name_en || ''} ${(m.aliases || []).join(' ')} ${m.disciplines || ''} ${(m.generic_instruments || []).join(' ')}`.toLowerCase().includes(f.search.toLowerCase()))), [data, f]);

  return (
    <div>
      <PageHeader title="实验方法库" icon={<ExperimentOutlined />}
        description="连接科研产品（仪器 / 试剂）和学科、百业科研空间的中间层：一个方法一份操作指南、常见坑和用到的设备。方法清单参考科研产品库真实的产品分布；指南是 AI 按通用实验常识写的，待审核。" />

      <StatCards loading={loading && !stats.methods} items={[
        { label: '实验方法', value: stats.methods, icon: <ExperimentOutlined />, color: BRAND.primary, hint: (stats.fields || []).map((x: any) => `${x.field} ${x.n}`).join(' · ') },
        { label: '有操作指南', value: stats.with_guide, icon: <ReadOutlined />, color: '#16a34a', hint: '步骤 + 常见坑（现象 → 原因 → 怎么判断）+ 安全 + 练的本事' },
        { label: '挂上方法的科研产品', value: stats.linked, icon: <AppstoreOutlined />, color: '#0891b2', hint: `科研产品库共 ${stats.products ?? '—'} 条` },
        { label: '方法 → 工具设备', value: stats.item_links, icon: <ApartmentOutlined />, color: '#d97706', hint: '通用仪器进了百业工具设备库，百业空间和台面能直接用' },
      ]} />

      <Panel padding={16}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="搜方法 / 学科 / 仪器" allowClear style={{ width: 260 }} onSearch={v => setF(x => ({ ...x, search: v }))} />
          <Select value={f.field} style={{ width: 150 }} onChange={v => setF(x => ({ ...x, field: v }))} options={[{ value: '', label: '全部大类' }, ...(stats.fields || []).map((x: any) => ({ value: x.field, label: `${x.field}（${x.n}）` }))]} />
          <Select value={f.level} style={{ width: 120 }} onChange={v => setF(x => ({ ...x, level: v }))} options={[{ value: '', label: '全部难度' }, ...['入门', '进阶', '专精'].map(l => ({ value: l, label: l }))]} />
        </Space>
        <Table rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50, showSizeChanger: false, showTotal: t => `${t} 个` }}
          locale={{ emptyText: <Empty description="还没有方法——跑 scripts/research-methods.mts" /> }}
          onRow={r => ({ onClick: () => open(r.id), style: { cursor: 'pointer' } })}
          columns={[
            { title: '方法', dataIndex: 'name', width: 260, render: (v: string, r: any) => <div><div style={{ fontWeight: 600, color: BRAND.primary }}>{v}</div>{r.name_en && <div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.name_en}</div>}</div> },
            { title: '大类', dataIndex: 'field', width: 100 },
            { title: '难度', dataIndex: 'level', width: 70, render: (l: string) => l ? <Tag color={LEVEL_COLOR[l]}>{l}</Tag> : '—' },
            { title: '适用学科', dataIndex: 'disciplines', render: (v: string) => <span style={{ fontSize: 12 }}>{split(v).join('、')}</span> },
            { title: '用到的仪器', dataIndex: 'generic_instruments', render: (v: string[]) => <Space size={4} wrap>{(v || []).map(x => <Tag key={x} style={{ fontSize: 11 }}>{x}</Tag>)}</Space> },
            { title: '产品', dataIndex: 'product_count', width: 70, align: 'right' as const, sorter: (a: any, b: any) => a.product_count - b.product_count, render: (n: number) => n || <Text type="secondary">—</Text> },
            { title: '指南', width: 110, render: (_: any, r: any) => r.steps_n ? <span style={{ fontSize: 12 }}>{r.steps_n} 步 · {r.pitfalls_n} 个坑</span> : <Text type="secondary">—</Text> },
          ]} />
      </Panel>

      <Drawer open={!!detail} onClose={() => setDetail(null)} size="large" loading={detail?.loading}
        title={detail && !detail.loading ? <span>{detail.name}{detail.level && <Tag color={LEVEL_COLOR[detail.level]} style={{ marginLeft: 8 }}>{detail.level}</Tag>}<Tag color={REVIEW_STATUS[detail.human_review_status]?.color}>{REVIEW_STATUS[detail.human_review_status]?.label || '待审核'}</Tag></span> : '方法'}>
        {detail && !detail.loading && (
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            {detail.summary && <div style={{ padding: '10px 12px', background: '#f6f5ff', borderRadius: 8, marginBottom: 12 }}>{detail.summary}</div>}
            <Descriptions size="small" column={1} bordered items={[
              { key: 'f', label: '大类', children: detail.field || '—' },
              { key: 'd', label: '适用学科', children: split(detail.disciplines).join('、') || '—' },
              { key: 'a', label: '也叫', children: (detail.aliases || []).join('、') || '—' },
              { key: 'i', label: '用到的设备', children: detail.items?.length
                ? <Space size={4} wrap>{detail.items.map((it: any) => <Tag key={it.id} color={it.lab_bench ? 'orange' : 'default'} style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/db-item/${it.id}`)}>{it.name}{it.lab_bench ? ' · 可体验' : ''}</Tag>)}</Space>
                : (detail.generic_instruments || []).join('、') || '—' },
            ]} />
            {!!detail.typical_experiments?.length && <><Text strong style={{ display: 'block', margin: '16px 0 6px' }}>典型实验</Text>{detail.typical_experiments.map((x: any, i: number) => <div key={i}>· <b>{x.name}</b>　<span style={{ color: BRAND.ink3 }}>{x.goal}</span></div>)}</>}
            {!!detail.steps?.length && <><Text strong style={{ display: 'block', margin: '16px 0 6px' }}>操作指南</Text>
              <ol style={{ margin: 0, paddingLeft: 20 }}>{detail.steps.map((x: any, i: number) => <li key={i} style={{ marginBottom: 4 }}><b>{x.title}</b>：{x.detail}</li>)}</ol></>}
            {!!detail.pitfalls?.length && <><Text strong style={{ display: 'block', margin: '16px 0 6px' }}>常见坑（模拟台面出「异常」的素材）</Text>
              <Table size="small" pagination={false} rowKey="k" dataSource={detail.pitfalls.map((x: any, i: number) => ({ ...x, k: i }))} columns={[
                { title: '看到什么', dataIndex: 'symptom', width: '30%' }, { title: '常见原因', dataIndex: 'cause', width: '30%' }, { title: '怎么判断 / 处理', dataIndex: 'check' },
              ]} /></>}
            {detail.safety && <><Text strong style={{ display: 'block', margin: '16px 0 6px' }}>安全要点</Text><div>{detail.safety}</div></>}
            {!!detail.skills?.length && <><Text strong style={{ display: 'block', margin: '16px 0 6px' }}>练的本事</Text><Space wrap>{detail.skills.map((x: any, i: number) => <Tag key={i} color="geekblue" title={x.why}>{x.name}</Tag>)}</Space></>}
            <Text strong style={{ display: 'block', margin: '16px 0 6px' }}>科研产品库里对上的产品（{detail.products_total}）</Text>
            {detail.products?.length ? <Table size="small" pagination={false} rowKey="id" dataSource={detail.products} columns={[
              { title: '产品', dataIndex: 'name', render: (v: string, r: any) => <a onClick={() => router.push(`/admin/db-research-product?id=${r.id}`)}>{v}</a> },
              { title: '品牌 / 型号', render: (_: any, r: any) => <span style={{ fontSize: 12 }}>{[r.brand, r.model_no].filter(Boolean).join(' · ') || '—'}</span> },
              { title: '厂商', dataIndex: 'supplier', render: (s: any) => s ? <a style={{ fontSize: 12 }} onClick={() => router.push(`/admin/db-company/${s.id}`)}>{s.name}</a> : '—' },
            ]} /> : <Text type="secondary">还没有产品挂到这个方法上</Text>}
            {detail.products_total > 40 && <div style={{ marginTop: 6 }}><a onClick={() => router.push(`/admin/db-research-product?method=${detail.key}`)}><LinkOutlined /> 在科研产品库里看全部 {detail.products_total} 条</a></div>}
            <div style={{ color: BRAND.ink3, fontSize: 12, marginTop: 16 }}>{detail.source}</div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
