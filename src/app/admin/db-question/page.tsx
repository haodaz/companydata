'use client';

/**
 * 题目资产库（迁移 049）：每道出过的真活沉淀的题骨架 + 出题参数 + 质量信号。归数据资产，不是真活那边的「已出题管理」。
 *   人工打星（1–5）、标「别再参照」、写备注；出题时同企业 / 同行业的高分题自动当结构参照。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Input, Rate, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { DatabaseOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;
const FUNCS = ['投资', '投后', 'IR / 募资', '研究', '并购', '二级市场', '财务', '运营', '工程', '销售 / 市场', '人力'];

export default function DbQuestionPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<any[]>([]); const [stats, setStats] = useState<any>({}); const [inds, setInds] = useState<Record<string, number>>({}); const [fns, setFns] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ q: '', industry: '', fn: '' });
  const load = useCallback(async () => { setLoading(true); const p = new URLSearchParams(); if (f.q) p.set('q', f.q); if (f.industry) p.set('industry', f.industry); if (f.fn) p.set('fn', f.fn); const j = await (await fetch(`/api/admin/questions?${p}`)).json(); if (j.ok) { setData(j.data); setStats(j.stats); setInds(j.industries); setFns(j.functions); } else message.error(j.error); setLoading(false); }, [f, message]);
  useEffect(() => { load(); }, [load]);
  const patch = async (id: string, body: any) => { const j = await (await fetch('/api/admin/questions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })).json(); if (!j.ok) message.error(j.error); else setData(d => d.map(r => r.id === id ? { ...r, ...body } : r)); };
  const backfill = async () => { setBusy(true); const j = await (await fetch('/api/admin/questions', { method: 'POST' })).json(); setBusy(false); if (j.ok) { message.success(`沉淀了 ${j.banked} 道`); load(); } else message.error(j.error); };
  return (
    <div>
      <PageHeader title="题目资产库" icon={<DatabaseOutlined />} description="每道出过的真活沉淀一条：题骨架（推进结构 / 交付形态 / 评分依赖）+ 出题参数 + 质量信号（基线、做题人数、分差、修订次数）。打星、标参照，出题时同企业 / 同行业的高分题自动当结构参照。" extra={<Button icon={<ReloadOutlined />} loading={busy} onClick={backfill}>把已出的题全部沉淀一遍</Button>} />
      <StatCards loading={loading} items={[{ label: '题目', value: stats.total || 0 }, { label: '已打星', value: stats.rated || 0 }, { label: '4 星以上', value: stats.good || 0 }, { label: '有人做过', value: stats.done || 0 }, { label: '不再参照', value: stats.off || 0 }]} />
      <Panel>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search allowClear placeholder="题名 / 企业 / 要找的人" style={{ width: 280 }} onSearch={v => setF(x => ({ ...x, q: v }))} />
          <Select allowClear placeholder="行业" style={{ width: 180 }} value={f.industry || undefined} onChange={v => setF(x => ({ ...x, industry: v || '' }))} options={Object.entries(inds).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${k}（${n}）` }))} />
          <Select allowClear placeholder="职能" style={{ width: 160 }} value={f.fn || undefined} onChange={v => setF(x => ({ ...x, fn: v || '' }))} options={Object.entries(fns).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${k}（${n}）` }))} />
        </Space>
        <Table size="small" rowKey="id" loading={loading} dataSource={data} pagination={{ pageSize: 30, showSizeChanger: false }}
          expandable={{ expandedRowRender: (r: any) => { const k = r.skeleton || {}; return <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            <div><b>业务问题</b>：{k.problem_type}</div>
            {k.stages?.length > 0 && <div><b>推进</b>：{k.stages.map((s: any) => `${s.type} · ${s.question}`).join(' → ')}</div>}
            <div><b>交付</b>：{(k.deliverables || []).map((d: any) => `${d.title}（${d.format}）`).join('；')}</div>
            <div><b>评分</b>：{(k.rubric || []).map((x: any) => `${x.title} ${x.weight}${x.depends_on?.length ? `←${x.depends_on.join(',')}` : ''}`).join('；')}</div>
            <div><b>材料</b>：{(k.materials || []).map((m: any) => `${m.kind}·${m.title}`).join('；')}</div>
            <div><b>参数</b>：{JSON.stringify(r.params)}</div>
            <div style={{ marginTop: 6 }}><Input.TextArea defaultValue={r.note || ''} placeholder="备注：哪里好、哪里要改" autoSize={{ minRows: 1, maxRows: 4 }} onBlur={e => e.target.value !== (r.note || '') && patch(r.id, { note: e.target.value })} /></div>
          </div>; } }}
          columns={[
            { title: '题', dataIndex: 'title', render: (v: string, r: any) => <div><a href={`/work/${r.task_id}`} onClick={e => e.preventDefault()} style={{ color: BRAND.ink }}>{v}</a><div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.company_name} · 要找：{r.role}</div></div> },
            { title: '行业', dataIndex: 'industry', width: 110, render: (v: string) => v || <Text type="secondary">—</Text> },
            { title: '职能', dataIndex: 'job_function', width: 130, render: (v: string, r: any) => <Select size="small" allowClear value={v || undefined} placeholder="—" style={{ width: 120 }} options={FUNCS.map(x => ({ value: x }))} onChange={x => patch(r.id, { job_function: x || '' })} /> },
            { title: '参数', width: 150, render: (_: any, r: any) => <span style={{ fontSize: 12 }}>{r.params?.env} · {r.params?.minutes ?? '–'} 分钟{r.params?.steps ? ` · ${r.params.steps} 步` : ''}{r.params?.verbatim ? ' · 原题' : ''}</span> },
            { title: '信号', width: 220, render: (_: any, r: any) => { const s = r.signals || {}; return <Space size={4} wrap>{s.baseline_total != null && <Tag>基线 {s.baseline_total}</Tag>}{s.sessions > 0 && <Tag color="blue">{s.sessions} 人 · 均 {s.score_avg} · 差 {s.score_spread ?? '–'}</Tag>}{s.ai_sessions > 0 && <Tag color="purple">AI {s.ai_sessions} · 均 {s.ai_score_avg}</Tag>}{s.revisions > 0 && <Tag color="orange">改 {s.revisions} 次</Tag>}</Space>; } },
            { title: '星', width: 150, render: (_: any, r: any) => <Rate allowClear value={r.rating || 0} onChange={v => patch(r.id, { rating: v || null })} style={{ fontSize: 14 }} /> },
            { title: '参照', width: 70, render: (_: any, r: any) => <Switch size="small" checked={r.use_as_ref} onChange={v => patch(r.id, { use_as_ref: v })} /> },
            { title: '更新', dataIndex: 'updated_at', width: 100, render: (v: string) => String(v).slice(0, 10) },
          ]} />
      </Panel>
    </div>
  );
}
