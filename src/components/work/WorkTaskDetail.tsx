'use client';

/** 真活台 · 一道题的详情（后台和出题人管理页共用）：问题与任务 / 材料包 / rubric / AI 基线 / 作答 */
import React, { useState } from 'react';
import { Button, Descriptions, Drawer, Space, Table, Tabs, Tag, Typography, App } from 'antd';
import { WorkReport } from '@/components/work/WorkReport';

const { Text, Paragraph } = Typography;
export const ENV_META: Record<string, { label: string; color: string }> = { doc: { label: '文档 / 对账台', color: 'purple' }, code: { label: '代码台', color: 'geekblue' }, sheet: { label: '表格 / 数据台', color: 'cyan' }, design: { label: '设计台', color: 'orange' } };

export function WorkTaskDetail({ task: T, sessions, shareLink, notes }: { task: any; sessions: any[]; shareLink: string; notes?: string[] }) {
  const { message } = App.useApp();
  const [report, setReport] = useState<any>(null);
  return (
    <>
      <Tabs items={[
        { key: 'p', label: '问题与任务', children: <div>
          <Descriptions column={1} size="small" bordered items={[
            { key: 'c', label: '企业 · 岗位', children: `${T.company_name} · ${T.role}` },
            { key: 'link', label: '参与链接', children: <Space><code>{shareLink}</code><Button size="small" onClick={() => { navigator.clipboard.writeText(shareLink); message.success('已复制'); }}>复制</Button></Space> },
            { key: 's', label: '业务问题', children: T.problem?.statement },
            { key: 'w', label: '为什么是现在', children: T.problem?.why_now },
            { key: 'e', label: '依据', children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.problem?.evidence || []).map((x: any, i: number) => <li key={i}>{x.text} <Text type="secondary">— {x.source}</Text></li>)}</ul> },
            { key: 'd', label: '交付物', children: <ol style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.deliverables || []).map((d: any) => <li key={d.id}>{d.title} <Text type="secondary">{d.format}</Text></li>)}</ol> },
            { key: 'r', label: '规则', children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.rules || []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul> },
            { key: 'm', label: '出题模型', children: `${T.model} · 建议 ${T.task?.time_minutes} 分钟 · 操作台 ${ENV_META[T.task?.env?.type]?.label || '文档'}` },
          ]} />
          <Paragraph style={{ marginTop: 12, whiteSpace: 'pre-wrap', background: '#fafbff', padding: 12, borderRadius: 10 }}>{T.task?.brief}</Paragraph>
          {T.task?.env?.type === 'code' && <Paragraph><b>自测用例</b>：{(T.task.env.tests || []).map((t: any) => t.name).join('、') || '无'}</Paragraph>}
          {notes?.length ? <Paragraph type="warning">材料缺口：{notes.join('；')}</Paragraph> : null}
        </div> },
        { key: 'm', label: `材料包（${(T.materials || []).length}）`, children: (T.materials || []).map((m: any) => <div key={m.id} style={{ marginBottom: 14 }}><b>{m.id} {m.title}</b> <Tag>{m.kind}</Tag><Tag color={m.source === 'db' ? 'green' : m.source === 'generated' ? 'orange' : 'gold'}>{m.source === 'db' ? '来自材料' : m.source === 'generated' ? '补写' : '混合'}</Tag>{m.basis && <Text type="secondary"> 依据：{m.basis}</Text>}<pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#fafbff', padding: 10, borderRadius: 8, fontSize: 13 }}>{m.content}</pre></div>) },
        { key: 'r', label: `rubric（${(T.rubric || []).length}）`, children: <Table size="small" rowKey="id" pagination={false} dataSource={T.rubric || []} columns={[
          { title: '#', dataIndex: 'id', width: 50 }, { title: '条目', dataIndex: 'title', render: (v: string, r: any) => <div><b>{v}</b><div style={{ fontSize: 12, color: '#666' }}>{r.desc}</div></div> },
          { title: '权重', dataIndex: 'weight', width: 60 }, { title: '依赖', dataIndex: 'depends_on', width: 80, render: (v: string[]) => v?.join('、') || '–' },
          { title: '依据', dataIndex: 'basis', width: 200, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: 'BARS', dataIndex: 'levels', width: 320, render: (l: any) => <div style={{ fontSize: 12 }}>{['L1', 'L2', 'L3', 'L4'].map(k => <div key={k}><b>{k}</b> {l?.[k]}</div>)}</div> },
        ]} /> },
        { key: 'b', label: `AI 基线${T.baseline ? ` · ${T.baseline.result?.total} 分` : ''}`, children: T.baseline ? <div><Paragraph><b>{T.baseline.model}</b> 先做了一遍，用同一套 rubric 评：<b>{T.baseline.result?.total}</b> 分。{T.baseline.result?.summary}</Paragraph><Table size="small" rowKey="id" pagination={false} dataSource={T.baseline.result?.items || []} columns={[{ title: '条目', dataIndex: 'title' }, { title: '等级', dataIndex: 'level', width: 60 }, { title: '分', dataIndex: 'score', width: 60 }, { title: '证据 / 说明', render: (_: any, i: any) => <span style={{ fontSize: 12 }}>{i.evidence && <i>“{i.evidence}” </i>}{i.note}</span> }]} /><details style={{ marginTop: 12 }}><summary>AI 的答卷</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#fafbff', padding: 10, borderRadius: 8 }}>{T.baseline.answer}</pre></details></div> : <Text type="secondary">还没跑 AI 基线</Text> },
        { key: 's', label: `作答（${sessions.length}）`, children: <Table size="small" rowKey="id" pagination={false} dataSource={sessions} columns={[
          { title: '谁', render: (_: any, s: any) => <span>{s.participant?.name} <Text type="secondary">{s.participant?.contact}</Text></span> },
          { title: '开始', dataIndex: 'started_at', render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
          { title: '交卷', dataIndex: 'submitted_at', render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : <Text type="secondary">做着呢</Text>) },
          { title: '结果', dataIndex: 'score', width: 70, render: (v: number) => (v == null ? '–' : <b>{v}</b>) },
          { title: '', width: 180, render: (_: any, s: any) => <Space>{s.report && <Button size="small" type="primary" ghost onClick={() => setReport(s)}>看报告</Button>}<Button size="small" onClick={() => { navigator.clipboard.writeText(`${shareLink}?s=${s.id}`); message.success('报告链接已复制'); }}>报告链接</Button></Space> },
        ]} /> },
      ]} />
      <Drawer open={!!report} onClose={() => setReport(null)} width={Math.min(900, typeof window !== 'undefined' ? window.innerWidth - 60 : 900)} title={report ? `${report.participant?.name} 的报告` : ''}>
        {report && <WorkReport report={report.report} participant={report.participant} />}
      </Drawer>
    </>
  );
}
