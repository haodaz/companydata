'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Input, InputNumber, Select, Table, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useUser } from '@/lib/user-context';

const { Text } = Typography;

/**
 * 价目表（记账用）：token 单价 + 每千次联网搜索价 + 按件计价（出图每张、视频每秒，迁移 021）。管理员对照真实账单直接改，改完之后的新调用按新价记账。
 * 以前的费用低估主要是联网搜索没算——这里每个能联网的模型都要填搜索价。
 */
export function PricingCard() {
  const { message } = App.useApp();
  const { user } = useUser();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [need, setNeed] = useState(false);
  const [saving, setSaving] = useState('');
  // 平时只读（卡片），点「编辑」才出输入框，免得一打开页面就是一张可改的大表
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch('/api/admin/model-pricing', { cache: 'no-store' })).json();
      if (!j.ok) { setNeed(!!j.needMigration); throw new Error(j.error); }
      setRows(j.pricing);
    } catch (e: any) { if (!need) message.error(`价目表加载失败：${e.message}`); }
    finally { setLoading(false); }
  }, [message, need]);
  useEffect(() => { load(); }, [load]);

  const patch = (id: string, p: Record<string, any>) => setRows(rs => rs.map(r => r.model_id === id ? { ...r, ...p, _dirty: true } : r));
  const save = async (r: any) => {
    setSaving(r.model_id);
    try {
      const j = await (await fetch('/api/admin/model-pricing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) })).json();
      if (!j.ok) throw new Error(j.error);
      message.success(`${r.model_id} 已保存，之后的调用按新价记账`);
      patch(r.model_id, { _dirty: false });
    } catch (e: any) { message.error(`保存失败：${e.message}`); }
    finally { setSaving(''); }
  };

  const canEdit = isAdmin && editing;
  const num = (key: string, step: number) => (v: number, r: any) => canEdit
    ? <InputNumber size="small" min={0} step={step} value={v} style={{ width: 90 }} onChange={x => patch(r.model_id, { [key]: x ?? 0 })} />
    : <span>{v}</span>;

  return (
    <Card size="small" style={{ marginBottom: 24, borderRadius: 12 }} loading={loading}
      extra={isAdmin && !need ? (editing
        ? <Button size="small" type="primary" disabled={rows.some(r => r._dirty)} onClick={() => setEditing(false)}>{rows.some(r => r._dirty) ? '有改动没保存' : '完成'}</Button>
        : <Button size="small" onClick={() => setEditing(true)}>编辑</Button>) : null}
      title={<span style={{ fontSize: 13 }}><InfoCircleOutlined style={{ color: '#8c8c8c', marginRight: 6 }} />价目表（记账用）<Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>　token 按每百万、联网搜索按每千次；对照真实账单改，改完之后的调用按新价算</Text></span>}>
      {need ? <Text type="secondary">价目表还没建：请先在 Supabase 执行迁移 <code>014_cost_ledger.sql</code>。</Text> : (
        !editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {rows.map(r => {
              const cur = r.currency === 'CNY' ? '¥' : '$';
              return (
                <div key={r.model_id} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: '8px 12px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b style={{ fontSize: 13 }}>{r.model_id}</b><Text type="secondary" style={{ fontSize: 11 }}>{r.provider}</Text></div>
                  <div style={{ fontSize: 12, marginTop: 4, color: '#595959' }}>
                    {r.unit && r.unit_price ? <>按件 {cur}{r.unit_price} / {r.unit === 'image' ? '张' : '秒'}</>
                      : <>输入 {cur}{r.input_per_m} · 输出 {cur}{r.output_per_m}<Text type="secondary" style={{ fontSize: 11 }}> / 百万</Text>{r.search_per_k ? <><br />搜索 {cur}{r.search_per_k}<Text type="secondary" style={{ fontSize: 11 }}> / 千次</Text></> : null}</>}
                  </div>
                  {r.note ? <Tooltip title={r.note}><Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</Text></Tooltip> : null}
                </div>
              );
            })}
          </div>
        ) :
        <Table rowKey="model_id" size="small" dataSource={rows} pagination={false} scroll={{ x: 900 }}
          columns={[
            { title: '模型', dataIndex: 'model_id', width: 170, render: (v: string, r: any) => <span><b>{v}</b> <Text type="secondary" style={{ fontSize: 12 }}>{r.provider}</Text></span> },
            { title: '币种', dataIndex: 'currency', width: 90, render: (v: string, r: any) => canEdit ? <Select size="small" value={v} style={{ width: 75 }} options={[{ value: 'USD', label: '美元' }, { value: 'CNY', label: '人民币' }]} onChange={x => patch(r.model_id, { currency: x })} /> : (v === 'CNY' ? '人民币' : '美元') },
            { title: '输入 / 百万 token', dataIndex: 'input_per_m', width: 120, render: num('input_per_m', 0.1) },
            { title: '输出 / 百万 token', dataIndex: 'output_per_m', width: 120, render: num('output_per_m', 0.1) },
            { title: '联网搜索 / 千次', dataIndex: 'search_per_k', width: 120, render: num('search_per_k', 1) },
            { title: '按件（张 / 秒）', dataIndex: 'unit_price', width: 150, render: (v: number, r: any) => r.unit_price === undefined && !r.unit ? <Text type="secondary" style={{ fontSize: 12 }}>迁移 021</Text>
              : <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{num('unit_price', 0.01)(v || 0, r)}<Text type="secondary" style={{ fontSize: 12 }}>{r.unit === 'image' ? '/张' : r.unit === 'second' ? '/秒' : ''}</Text></span> },
            { title: '说明', dataIndex: 'note', render: (v: string, r: any) => canEdit ? <Input size="small" value={v || ''} onChange={e => patch(r.model_id, { note: e.target.value })} /> : <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
            ...(canEdit ? [{ title: '', key: 'op', width: 70, render: (_: any, r: any) => <Button size="small" type={r._dirty ? 'primary' : 'default'} disabled={!r._dirty} loading={saving === r.model_id} onClick={() => save(r)}>保存</Button> }] : []),
          ]} />
      )}
    </Card>
  );
}
