'use client';

/**
 * 真活台 · 后台（迁移 035）：出题（生成器是核心）→ AI 基线 → 复制参与链接甩出去 → 看每个人的报告。
 * 独立于 /lab；题从数据底座长出来（企业画像 / 岗位 / 职业典型任务 / 行业规范）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Descriptions, Drawer, Input, Popconfirm, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined, EyeOutlined, RocketOutlined, SendOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { WorkReport } from '@/components/work/WorkReport';

const { Text, Paragraph } = Typography;
const ENV: Record<string, { label: string; color: string }> = { doc: { label: '文档 / 对账台', color: 'purple' }, code: { label: '代码台', color: 'geekblue' }, sheet: { label: '表格 / 数据台', color: 'cyan' }, design: { label: '设计台', color: 'orange' } };
const STATUS: Record<string, { label: string; color: string }> = { draft: { label: '生成中', color: 'default' }, ready: { label: '已出题', color: 'blue' }, published: { label: '已发布', color: 'green' }, archived: { label: '已下架', color: 'default' } };

export default function AdminWorkPage() {
  const { message } = App.useApp();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ company: '', role: '', env: '', focus: '' });
  const [busy, setBusy] = useState('');
  const [detail, setDetail] = useState<{ task: any; sessions: any[] } | null>(null);
  const [report, setReport] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const j = await (await fetch('/api/admin/work/tasks', { cache: 'no-store' })).json(); if (!j.ok) throw new Error(j.error); setList(j.tasks); }
    catch (e: any) { message.error(e.message); } finally { setLoading(false); }
  }, [message]);
  useEffect(() => { load(); }, [load]);

  const link = (t: any) => `${location.origin}/work/${t.share_token}`;
  const copy = async (t: any) => { await navigator.clipboard.writeText(link(t)); message.success('参与链接已复制，甩出去就能做'); };

  const create = async () => {
    if (!form.company.trim() || !form.role.trim()) return message.warning('企业和岗位都要填');
    setBusy('出题中（拼材料 → 问题 → 任务 → 材料包 → rubric，约 1–2 分钟）…');
    try {
      const j = await (await fetch('/api/admin/work/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: form.company, role: form.role, env: form.env || undefined, focus: form.focus || undefined }) })).json();
      if (!j.ok) throw new Error(j.error);
      if (j.notes?.length) message.info(j.notes.join('；'), 6);
      setBusy('题出好了，AI 先做一遍当基线（约 1 分钟）…');
      const b = await (await fetch(`/api/admin/work/tasks/${j.id}/baseline`, { method: 'POST' })).json();
      if (!b.ok) message.warning(`基线没跑成：${b.error}（可在详情里重跑）`); else message.success(`出题完成，AI 基线 ${b.baseline.total} 分`);
      setForm(f => ({ ...f, focus: '' }));
      await load();
    } catch (e: any) { message.error(e.message); } finally { setBusy(''); }
  };

  const open = async (id: string) => {
    const j = await (await fetch(`/api/admin/work/tasks/${id}`, { cache: 'no-store' })).json();
    if (!j.ok) return message.error(j.error);
    setDetail({ task: j.task, sessions: j.sessions });
  };
  const setStatus = async (t: any, status: string) => { await fetch(`/api/admin/work/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); message.success(status === 'published' ? '已发布' : '已更新'); load(); };
  const remove = async (t: any) => { await fetch(`/api/admin/work/tasks/${t.id}`, { method: 'DELETE' }); message.success('已删除'); load(); };
  const rerunBaseline = async (t: any) => { setBusy('AI 基线重跑中…'); try { const b = await (await fetch(`/api/admin/work/tasks/${t.id}/baseline`, { method: 'POST' })).json(); if (!b.ok) throw new Error(b.error); message.success(`AI 基线 ${b.baseline.total} 分`); await open(t.id); await load(); } catch (e: any) { message.error(e.message); } finally { setBusy(''); } };

  const T = detail?.task;
  return (
    <div>
      <PageHeader title="真活台" icon={<RocketOutlined />} description="拿一家企业的真实业务问题出题：问题 → 任务 → 材料包 → 带依赖的 rubric → AI 基线。链接甩出去，对方做完就有报告（结果逐条 + 过程高光 / 风险 + 和 AI 的差距）。独立于 /lab。" />
      <Panel style={{ marginBottom: 16 }}>
        <Space wrap align="start">
          <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="企业（名字或编号，库里有的最好）" style={{ width: 260 }} />
          <Input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="岗位 / 职业（如 供应链分析师）" style={{ width: 220 }} />
          <Select value={form.env} onChange={v => setForm(f => ({ ...f, env: v }))} style={{ width: 170 }} options={[{ value: '', label: '操作台：按岗位自动选' }, ...Object.entries(ENV).map(([v, x]) => ({ value: v, label: x.label }))]} />
          <Input.TextArea value={form.focus} onChange={e => setForm(f => ({ ...f, focus: e.target.value }))} placeholder="出题人额外要求（选填：聚焦哪个问题、给谁看、难度）" autoSize={{ minRows: 1, maxRows: 3 }} style={{ width: 360 }} />
          <Button type="primary" icon={<RocketOutlined />} loading={!!busy} onClick={create}>出一道真活</Button>
        </Space>
        {busy && <div style={{ marginTop: 8, color: '#6055f5' }}>{busy}</div>}
      </Panel>
      <Panel padding={0}>
        <Table size="small" rowKey="id" loading={loading} dataSource={list} pagination={{ pageSize: 20 }}
          columns={[
            { title: '题', dataIndex: ['task', 'title'], render: (v: string, t: any) => <a onClick={() => open(t.id)}><b>{v || '（未命名）'}</b></a> },
            { title: '企业 · 岗位', render: (_: any, t: any) => <span>{t.company_name} <Text type="secondary">· {t.role}</Text></span> },
            { title: '操作台', dataIndex: ['task', 'env', 'type'], width: 120, render: (v: string) => <Tag color={ENV[v]?.color}>{ENV[v]?.label || v || 'doc'}</Tag> },
            { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS[v]?.color}>{STATUS[v]?.label || v}</Tag> },
            { title: 'AI 基线', dataIndex: ['baseline', 'total'], width: 90, align: 'right' as const, render: (v: number) => (v == null ? <Text type="secondary">–</Text> : <b>{v}</b>) },
            { title: '作答', width: 90, render: (_: any, t: any) => `${t.sessions.done} / ${t.sessions.n}` },
            { title: '出题时间', dataIndex: 'created_at', width: 150, render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
            { title: '', width: 300, render: (_: any, t: any) => <Space size={4}>
              <Button size="small" icon={<CopyOutlined />} onClick={() => copy(t)}>复制链接</Button>
              <Button size="small" icon={<EyeOutlined />} onClick={() => open(t.id)}>详情</Button>
              {t.status !== 'published' ? <Button size="small" type="primary" ghost icon={<SendOutlined />} onClick={() => setStatus(t, 'published')}>发布</Button> : <Button size="small" onClick={() => setStatus(t, 'archived')}>下架</Button>}
              <Popconfirm title="删除这道题和所有作答？" onConfirm={() => remove(t)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
            </Space> },
          ]} />
      </Panel>

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={Math.min(980, typeof window !== 'undefined' ? window.innerWidth - 40 : 980)} title={T ? <span>{T.task?.title} <Tag color={ENV[T.task?.env?.type]?.color}>{ENV[T.task?.env?.type]?.label}</Tag></span> : ''}
        extra={T && <Space><Button icon={<CopyOutlined />} onClick={() => copy(T)}>复制参与链接</Button><Button onClick={() => rerunBaseline(T)} loading={!!busy}>重跑 AI 基线</Button></Space>}>
        {T && <Tabs items={[
          { key: 'p', label: '问题与任务', children: <div>
            <Descriptions column={1} size="small" bordered items={[
              { key: 'c', label: '企业 · 岗位', children: `${T.company_name} · ${T.role}` },
              { key: 'link', label: '参与链接', children: <code>{link(T)}</code> },
              { key: 's', label: '业务问题', children: T.problem?.statement },
              { key: 'w', label: '为什么是现在', children: T.problem?.why_now },
              { key: 'e', label: '依据', children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.problem?.evidence || []).map((x: any, i: number) => <li key={i}>{x.text} <Text type="secondary">— {x.source}</Text></li>)}</ul> },
              { key: 'd', label: '交付物', children: <ol style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.deliverables || []).map((d: any) => <li key={d.id}>{d.title} <Text type="secondary">{d.format}</Text></li>)}</ol> },
              { key: 'r', label: '规则', children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.rules || []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul> },
              { key: 'm', label: '出题模型', children: `${T.model} · 建议 ${T.task?.time_minutes} 分钟` },
            ]} />
            <Paragraph style={{ marginTop: 12, whiteSpace: 'pre-wrap', background: '#fafbff', padding: 12, borderRadius: 10 }}>{T.task?.brief}</Paragraph>
            {T.task?.env?.type === 'code' && <Paragraph><b>自测用例</b>：{(T.task.env.tests || []).map((t: any) => t.name).join('、') || '无'}</Paragraph>}
            {T.context?.notes?.length ? <Paragraph type="warning">材料缺口：{T.context.notes.join('；')}</Paragraph> : null}
          </div> },
          { key: 'm', label: `材料包（${(T.materials || []).length}）`, children: (T.materials || []).map((m: any) => <div key={m.id} style={{ marginBottom: 14 }}><b>{m.id} {m.title}</b> <Tag>{m.kind}</Tag><Tag color={m.source === 'db' ? 'green' : m.source === 'generated' ? 'orange' : 'gold'}>{m.source === 'db' ? '来自材料' : m.source === 'generated' ? '补写' : '混合'}</Tag>{m.basis && <Text type="secondary"> 依据：{m.basis}</Text>}<pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#fafbff', padding: 10, borderRadius: 8, fontSize: 13 }}>{m.content}</pre></div>) },
          { key: 'r', label: `rubric（${(T.rubric || []).length}）`, children: <Table size="small" rowKey="id" pagination={false} dataSource={T.rubric || []} columns={[
            { title: '#', dataIndex: 'id', width: 50 }, { title: '条目', dataIndex: 'title', render: (v: string, r: any) => <div><b>{v}</b><div style={{ fontSize: 12, color: '#666' }}>{r.desc}</div></div> },
            { title: '权重', dataIndex: 'weight', width: 60 }, { title: '依赖', dataIndex: 'depends_on', width: 80, render: (v: string[]) => v?.join('、') || '–' },
            { title: '依据', dataIndex: 'basis', width: 200, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
            { title: 'BARS', dataIndex: 'levels', width: 320, render: (l: any) => <div style={{ fontSize: 12 }}>{['L1', 'L2', 'L3', 'L4'].map(k => <div key={k}><b>{k}</b> {l?.[k]}</div>)}</div> },
          ]} /> },
          { key: 'b', label: `AI 基线${T.baseline ? ` · ${T.baseline.result?.total} 分` : ''}`, children: T.baseline ? <div><Paragraph><b>{T.baseline.model}</b> 先做了一遍，用同一套 rubric 评：<b>{T.baseline.result?.total}</b> 分。{T.baseline.result?.summary}</Paragraph><Table size="small" rowKey="id" pagination={false} dataSource={T.baseline.result?.items || []} columns={[{ title: '条目', dataIndex: 'title' }, { title: '等级', dataIndex: 'level', width: 60 }, { title: '分', dataIndex: 'score', width: 60 }, { title: '证据 / 说明', render: (_: any, i: any) => <span style={{ fontSize: 12 }}>{i.evidence && <i>“{i.evidence}” </i>}{i.note}</span> }]} /><details style={{ marginTop: 12 }}><summary>AI 的答卷</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#fafbff', padding: 10, borderRadius: 8 }}>{T.baseline.answer}</pre></details></div> : <Text type="secondary">还没跑，点右上「重跑 AI 基线」</Text> },
          { key: 's', label: `作答（${detail!.sessions.length}）`, children: <Table size="small" rowKey="id" pagination={false} dataSource={detail!.sessions} columns={[
            { title: '谁', render: (_: any, s: any) => <span>{s.participant?.name} <Text type="secondary">{s.participant?.contact}</Text></span> },
            { title: '开始', dataIndex: 'started_at', render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
            { title: '交卷', dataIndex: 'submitted_at', render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : <Text type="secondary">做着呢</Text>) },
            { title: '结果', dataIndex: 'score', width: 70, render: (v: number) => (v == null ? '–' : <b>{v}</b>) },
            { title: '', width: 120, render: (_: any, s: any) => <Space>{s.report && <Button size="small" onClick={() => setReport({ ...s })}>看报告</Button>}<Button size="small" onClick={() => { navigator.clipboard.writeText(`${link(T)}?s=${s.id}`); message.success('报告链接已复制'); }}>报告链接</Button></Space> },
          ]} /> },
        ]} />}
      </Drawer>
      <Drawer open={!!report} onClose={() => setReport(null)} width={Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 60 : 900)} title={report ? `${report.participant?.name} 的报告` : ''}>
        {report && <WorkReport report={report.report} participant={report.participant} />}
      </Drawer>
    </div>
  );
}
