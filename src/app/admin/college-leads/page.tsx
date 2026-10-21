'use client';

/**
 * AI 大学申请线索（迁移 045）：/college 上「申请模型入学」「人才培养需求」提交的申请。
 * 提交了就算收集到一个客户；这里看详情、改跟进状态、写备注。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Input, Segmented, Select, Table, Tag, Typography } from 'antd';
import { BankOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';

const { Text } = Typography;
const KIND: Record<string, { label: string; color: string }> = { enroll: { label: '模型入学', color: 'purple' }, hire: { label: '人才培养', color: 'gold' } };
const STATUS: Record<string, { label: string; color: string }> = {
  new: { label: '新线索', color: 'blue' }, contacted: { label: '已联系', color: 'orange' }, won: { label: '已签约', color: 'green' }, closed: { label: '已关闭', color: 'default' },
};
// payload 里的字段名 → 中文（两张表单的字段）
const LABEL: Record<string, string> = {
  role: '职务', model_source: '模型来源', api_style: '接口形式', endpoint: '接口地址', target: '训练目标', usage: '使用场景', note: '其他',
  industry: '行业', size: '规模', city: '城市', contact_title: '联系人职务', headcount: '需要几位', mode: '接入方式', jd: '岗位职责与要求',
  tasks: '希望干的真活', materials: '可提供材料', timeline: '期望上岗时间',
};

export default function CollegeLeads() {
  const { message } = App.useApp();
  const [kind, setKind] = useState<string>('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    const j = await (await fetch(`/api/admin/college-leads${kind ? `?kind=${kind}` : ''}`)).json().catch(() => ({ ok: false, error: '读取失败' }));
    if (j.ok) { setRows(j.data); setErr(''); } else setErr(j.error);
    setLoading(false);
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    const j = await (await fetch('/api/admin/college-leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })).json();
    if (j.ok) { message.success('已保存'); setRows(r => r.map(x => (x.id === id ? { ...x, ...body } : x))); } else message.error(j.error);
  };

  return (
    <div>
      <PageHeader title="AI 大学申请" icon={<BankOutlined />} description="/college 上提交的「申请模型入学」和「人才培养需求」。提交即线索，由同事联系跟进。" />
      <Panel>
        <Segmented value={kind} onChange={v => setKind(String(v))} style={{ marginBottom: 14 }}
          options={[{ label: '全部', value: '' }, { label: '模型入学', value: 'enroll' }, { label: '人才培养', value: 'hire' }]} />
        {err ? <Text type="danger">{err}</Text> : (
          <Table size="small" rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 30, showSizeChanger: false }}
            expandable={{
              expandedRowRender: (r: any) => (
                <div style={{ display: 'grid', gap: 8, maxWidth: 900 }}>
                  {Object.entries(r.payload || {}).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><Text type="secondary">{LABEL[k] || k}：</Text><span style={{ whiteSpace: 'pre-wrap' }}>{String(v)}</span></div>
                  ))}
                  {r.source && <div><Text type="secondary">来源：</Text>{r.source}</div>}
                  <Input.TextArea rows={2} defaultValue={r.note || ''} placeholder="跟进备注（内部）" onBlur={e => e.target.value !== (r.note || '') && patch(r.id, { note: e.target.value })} />
                </div>
              ),
            }}
            columns={[
              { title: '提交时间', dataIndex: 'created_at', width: 150, render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }).slice(0, 16) },
              { title: '类型', dataIndex: 'kind', width: 90, render: (v: string) => <Tag color={KIND[v]?.color}>{KIND[v]?.label || v}</Tag> },
              { title: '机构 / 企业', dataIndex: 'org' },
              { title: '模型 / 岗位', dataIndex: 'title' },
              { title: '联系人', dataIndex: 'contact', width: 100 },
              { title: '联系方式', dataIndex: 'phone', width: 140 },
              { title: '账号', dataIndex: 'email', width: 180, ellipsis: true },
              { title: '状态', dataIndex: 'status', width: 120, render: (v: string, r: any) => (
                <Select size="small" value={v} style={{ width: 100 }} onChange={s => patch(r.id, { status: s })}
                  options={Object.entries(STATUS).map(([value, x]) => ({ value, label: <Tag color={x.color} style={{ margin: 0 }}>{x.label}</Tag> }))} />
              ) },
            ]} />
        )}
      </Panel>
    </div>
  );
}
