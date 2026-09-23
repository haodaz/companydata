'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Progress, Row, Select, Table, Tag, Tooltip, Typography, App } from 'antd';
import { BankOutlined, DollarOutlined, HeartOutlined, PercentageOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { BRAND } from '@/lib/theme';
import { SEGMENT_LABELS, SEGMENT_OPTIONS, SUB_ENTITIES } from '@/lib/company-fields';
import { REVIEW_STATUS } from '@/lib/review-status';

const { Text } = Typography;

const rateColor = (r: number) => r >= 80 ? BRAND.success : r >= 50 ? '#fa8c16' : '#f5222d';

export default function HealthCompanyPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await (await fetch(`/api/admin/company-health?segment=${segment}`)).json();
      if (!json.ok) throw new Error(json.error);
      setData(json);
    } catch (e: any) { message.error(`加载失败: ${e.message}`); }
    finally { setLoading(false); }
  }, [segment]);
  useEffect(() => { load(); }, [load]);

  const groups: string[] = Array.from(new Set((data?.fields || []).map((f: any) => f.group)));
  const total = data?.total || 0;
  const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto' }}>
      <PageHeader icon={<HeartOutlined />} title="企业画像健康" description="每个字段的填充率、融资 / 动态 / 管理团队的覆盖、动态新鲜度、完整度分布、审核进度与画像成本。一眼看到哪块弱。"
        extra={<>
          <Select value={segment} style={{ width: 150 }} onChange={setSegment} options={[{ value: '', label: '全部分类' }, ...SEGMENT_OPTIONS, { value: 'none', label: '未分类' }]} />
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" onClick={() => router.push('/admin/tool-company')}>去跑画像 →</Button>
        </>} />

      <StatCards loading={loading} items={[
        { label: '企业总数', value: total, icon: <BankOutlined /> },
        { label: '跑过画像流水线', value: data?.crawled ?? 0, icon: <ThunderboltOutlined />, color: '#722ed1', hint: total ? `${pct(data?.crawled || 0)}%` : undefined },
        { label: '平均完整度', value: data?.avg_completeness != null ? `${data.avg_completeness}` : '—', icon: <PercentageOutlined />, color: BRAND.success, hint: '只算有分的企业' },
        { label: '有近期动态', value: data ? total - data.freshness.none : 0, icon: <HeartOutlined />, color: '#fa8c16', hint: data ? `3 个月内 ${data.freshness.within_3m} 家` : undefined },
        { label: '画像成本（USD）', value: data ? `$${data.cost.usd.toFixed(2)}` : '—', icon: <DollarOutlined />, color: '#eb2f96', hint: data?.cost.companies ? `${data.cost.companies} 家 · 均 $${data.cost.per_company.toFixed(3)}` : '还没跑过' },
      ]} />

      <Row gutter={16}>
        <Col xs={24} xl={15}>
          <Card title="字段填充率" size="small" style={{ marginBottom: 16 }} loading={loading}>
            {groups.map(g => (
              <div key={g} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.ink2, margin: '4px 0 6px', borderLeft: `3px solid ${BRAND.primary}`, paddingLeft: 8 }}>{g}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 20px' }}>
                  {(data?.fields || []).filter((f: any) => f.group === g).map((f: any) => (
                    <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <Tooltip title={`权重 ${f.weight} · ${f.filled}/${total}`}><span style={{ width: 90, color: BRAND.ink3, flexShrink: 0 }}>{f.label}</span></Tooltip>
                      <Progress percent={f.rate} size="small" strokeColor={rateColor(f.rate)} style={{ flex: 1, margin: 0 }} format={p => <span style={{ fontSize: 11 }}>{p}%</span>} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="子实体覆盖" size="small" style={{ marginBottom: 16 }} loading={loading}>
            {(Object.keys(SUB_ENTITIES) as (keyof typeof SUB_ENTITIES)[]).map(k => {
              const e = data?.entities?.[k] || { companies: 0, rows: 0 };
              return (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><Text strong>{SUB_ENTITIES[k].label}</Text><Text type="secondary">{e.companies} 家有记录 · 共 {e.rows} 条</Text></div>
                  <Progress percent={pct(e.companies)} size="small" strokeColor={rateColor(pct(e.companies))} />
                </div>
              );
            })}
          </Card>
          <Card title="动态新鲜度（最近一条动态距今）" size="small" style={{ marginBottom: 16 }} loading={loading}>
            {[['within_3m', '3 个月内', BRAND.success], ['within_12m', '3–12 个月', '#fa8c16'], ['older', '超过 12 个月', '#f5222d'], ['none', '没有动态', '#bfbfbf']].map(([k, l, c]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                <span style={{ width: 90, color: BRAND.ink3 }}>{l}</span>
                <Progress percent={pct(data?.freshness?.[k] || 0)} size="small" strokeColor={c as string} style={{ flex: 1, margin: 0 }} format={() => <span style={{ fontSize: 11 }}>{data?.freshness?.[k] || 0}</span>} />
              </div>
            ))}
          </Card>
          <Card title="完整度分布" size="small" style={{ marginBottom: 16 }} loading={loading}>
            {['81-100', '61-80', '41-60', '21-40', '0-20', 'none'].map(k => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                <span style={{ width: 90, color: BRAND.ink3 }}>{k === 'none' ? '未评分' : k}</span>
                <Progress percent={pct(data?.buckets?.[k] || 0)} size="small" strokeColor={k === 'none' ? '#bfbfbf' : rateColor(k === '81-100' ? 90 : k === '61-80' ? 70 : 30)} style={{ flex: 1, margin: 0 }} format={() => <span style={{ fontSize: 11 }}>{data?.buckets?.[k] || 0}</span>} />
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} xl={8}>
          <Card title="审核与分类" size="small" style={{ marginBottom: 16 }} loading={loading}>
            <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(data?.review || {}).map(([k, v]) => <Tag key={k} color={REVIEW_STATUS[k]?.color}>{REVIEW_STATUS[k]?.label || '未审核'} {v as number}</Tag>)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(data?.segments || []).map((s: any) => <Tag key={s.key} color={SEGMENT_LABELS[s.key]?.color}>{s.label} {s.count}</Tag>)}
            </div>
            <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 12 }}>流水线运行：{data?.runs?.total || 0} 次，成功 {data?.runs?.success || 0}，失败 {data?.runs?.failed || 0}</div>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="最弱的企业（完整度最低）" size="small" style={{ marginBottom: 16 }} loading={loading}>
            <Table size="small" rowKey="id" dataSource={data?.weakest || []} pagination={false}
              columns={[
                { title: '企业', dataIndex: 'name', render: (t: string, r: any) => <a onClick={() => router.push(`/admin/db-company/${r.id}`)} style={{ fontSize: 12, fontWeight: 600 }}>{t}</a> },
                { title: '完整度', dataIndex: 'completeness_score', width: 110, render: (n: number) => <Progress percent={n} size="small" strokeColor={rateColor(n)} /> },
                { title: '', width: 60, render: (_: any, r: any) => <a onClick={() => router.push(`/admin/tool-company?company=${r.id}&name=${encodeURIComponent(r.name)}`)} style={{ fontSize: 12 }}>补跑</a> },
              ]} />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="成本最高的企业" size="small" style={{ marginBottom: 16 }} loading={loading}>
            <Table size="small" rowKey="name" dataSource={data?.cost?.costliest || []} pagination={false}
              columns={[
                { title: '企业', dataIndex: 'name', render: (t: string) => <span style={{ fontSize: 12, fontWeight: 600 }}>{t}</span> },
                { title: '调用', dataIndex: 'calls', width: 60, align: 'center' as const },
                { title: 'Tokens', dataIndex: 'tokens', width: 90, render: (n: number) => <span style={{ fontSize: 12 }}>{(n || 0).toLocaleString()}</span> },
                { title: 'USD', dataIndex: 'cost', width: 80, render: (n: number) => <span style={{ fontSize: 12 }}>${(n || 0).toFixed(4)}</span> },
              ]} />
            <div style={{ fontSize: 12, color: BRAND.ink4, marginTop: 8 }}>总计 {data?.cost?.calls || 0} 次调用 · {(data?.cost?.tokens || 0).toLocaleString()} tokens。按企业明细见 Token 用量页（工具 company-pipeline）。</div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
