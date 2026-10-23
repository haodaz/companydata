'use client';

/** 真活台 · 一道题的详情（后台和出题人管理页共用）：问题与任务 / 材料包 / rubric / AI 基线 / 作答 */
import React, { useState } from 'react';
import { Button, Descriptions, Drawer, Space, Table, Tabs, Tag, Typography, App } from 'antd';
import { WorkReport } from '@/components/work/WorkReport';

const { Text, Paragraph } = Typography;
export const ENV_META: Record<string, { label: string; color: string }> = { doc: { label: '文档 / 对账台', color: 'purple' }, code: { label: '代码台', color: 'geekblue' }, sheet: { label: '表格 / 数据台', color: 'cyan' }, design: { label: '设计台', color: 'orange' }, plugin: { label: '真活插件 · 自己的工具', color: 'magenta' }, open: { label: '自己录制电脑操作', color: 'green' } };

export function WorkTaskDetail({ task: T, sessions, shareLink, notes, defaultTab }: { task: any; sessions: any[]; shareLink: string; notes?: string[]; defaultTab?: string }) {
  // 出题人是不是用一句话说的要找什么样的人（和 lib/work/generator.ts 的 isNeedText 同一判断；那边是服务端模块，这里不能直接引）
  const isNeed = String(T.role || '').trim().length > 14 || /[，,。、]|要一个|能看懂|能把|的人/.test(String(T.role || ''));
  const { message } = App.useApp();
  const [report, setReport] = useState<any>(null);
  return (
    <>
      <Tabs defaultActiveKey={defaultTab || 'p'} items={[
        { key: 'p', label: '问题与任务', children: <div>
          <Descriptions column={1} size="small" bordered items={[
            { key: 'c', label: isNeed ? '企业 · 要找的人' : '企业 · 岗位', children: `${T.company_name} · ${T.role}` },
            { key: 'link', label: '参与链接', children: <Space><code>{shareLink}</code><Button size="small" onClick={() => { navigator.clipboard.writeText(shareLink); message.success('已复制'); }}>复制</Button></Space> },
            { key: 's', label: '业务问题', children: T.problem?.statement },
            { key: 'w', label: '为什么是现在', children: T.problem?.why_now },
            { key: 'e', label: '依据', children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.problem?.evidence || []).map((x: any, i: number) => <li key={i}>{x.text} <Text type="secondary">— {x.source}</Text></li>)}</ul> },
            { key: 'd', label: '交付物', children: <ol style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.deliverables || []).map((d: any) => <li key={d.id}>{d.title} <Text type="secondary">{d.format}</Text></li>)}</ol> },
            { key: 'r', label: '规则', children: <ul style={{ margin: 0, paddingLeft: 18 }}>{(T.task?.rules || []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul> },
            { key: 'm', label: '时间与操作台', children: `建议 ${T.task?.time_minutes} 分钟 · 操作台 ${ENV_META[T.task?.env?.type]?.label || '文档'}` },
          ]} />
          <Paragraph style={{ marginTop: 12, whiteSpace: 'pre-wrap', background: '#fafbff', padding: 12, borderRadius: 10 }}>{T.task?.brief}</Paragraph>
          {T.task?.env?.type === 'code' && <Paragraph><b>自测用例</b>：{(T.task.env.tests || []).map((t: any) => t.name).join('、') || '无'}</Paragraph>}
          {notes?.length ? <Paragraph type="warning">材料缺口：{notes.join('；')}</Paragraph> : null}
          {T.sources && <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: '#f3fbf6', border: '1px solid #cfe9d8' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>取材清单 · 这道题从库里拿了什么</div>
            <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              {T.sources.company && <div><Tag color="green">企业画像</Tag>{T.sources.company.name}{T.sources.company.industry ? `（${T.sources.company.industry}）` : ''} · 用到字段：{T.sources.company.fields.join('、') || '—'}</div>}
              <div><Tag color="green">子实体</Tag>产品 {T.sources.products.length} 个{T.sources.products.length ? `（${T.sources.products.slice(0, 5).join('、')}${T.sources.products.length > 5 ? '…' : ''}）` : ''} · 近期动态 {T.sources.news} 条 · 高管 {T.sources.executives} 位</div>
              {!!T.sources.deep?.length && <div><Tag color="geekblue">深度画像</Tag>{T.sources.deep.join('、')}</div>}
              {!!T.sources.related?.length && <div><Tag color="cyan">关联主体</Tag>{T.sources.related.join('；')}</div>}
              {/* 出题人用一句话说要找什么样的人时，不查职业库、不配在招岗位：这两行不显示 */}
              {(T.sources.jobs.length > 0 || !isNeed) && <div><Tag color="purple">在招岗位</Tag>{T.sources.jobs.length ? T.sources.jobs.join('、') : '没有对口岗位'}</div>}
              {(T.sources.occupation || !isNeed) && <div><Tag color="blue">职业画像</Tag>{T.sources.occupation || '职业库里没有这个职业'}{T.sources.typical_tasks.length ? ` · 典型任务：${T.sources.typical_tasks.slice(0, 4).join('、')}` : ''}</div>}
              <div><Tag color="gold">行业标准</Tag>{T.sources.standards.length ? T.sources.standards.slice(0, 4).join('；') : '没有挂到的标准'}</div>
            </div>
          </div>}
          {!!T.task?.revisions?.length && <div style={{ marginTop: 12 }}><div style={{ fontWeight: 700, marginBottom: 4 }}>修订记录</div>{T.task.revisions.map((r: any, i: number) => <div key={i} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid #f0f0f5' }}><Text type="secondary">{new Date(r.at).toLocaleString('zh-CN', { hour12: false })}</Text> · 意见：{r.feedback}<div style={{ color: '#12a150' }}>改动：{r.changelog}</div></div>)}</div>}
        </div> },
        ...(T.task?.stages?.length ? [{ key: 'q', label: `推进步骤（${T.task.stages.length}）`, children: <div>
          <Paragraph type="secondary" style={{ fontSize: 13 }}>照深度样本出的案例推进式真活：候选人一步一步看信息、作答；参考答案和算式只有这里和评卷 AI 看得到。测算的数都由平台按算式重算过。</Paragraph>
          {T.task.stages.map((st: any) => <div key={st.id} style={{ marginBottom: 16, padding: '12px 14px', background: '#fafbff', borderRadius: 10 }}>
            <div><Tag color="purple">{st.id}</Tag><Tag>{({ structuring: '搭框架', judgement: '判断与洞察', numeracy: '测算', creativity: '出主意', synthesis: '综合建议' } as any)[st.type] || st.type}</Tag><b>{st.question}</b></div>
            {st.reveal && <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer', color: '#6055f5', fontSize: 13 }}>这一步给候选人的信息</summary><Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 6 }}>{st.reveal}</Paragraph></details>}
            <div style={{ marginTop: 6, fontSize: 13 }}><Text type="secondary">参考答案：</Text><span style={{ whiteSpace: 'pre-wrap' }}>{st.expected}</span></div>
            {!!st.calc?.length && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{st.calc.map((c: any, i: number) => <li key={i}>{c.label}：<code>{c.expr}</code> = <b>{c.value}</b>{c.verified === false && <Tag color="orange" style={{ marginLeft: 6 }}>算式没核上</Tag>}</li>)}</ul>}
          </div>)}
        </div> }] : []),
        { key: 'm', label: `材料包（${(T.materials || []).length}）`, children: (T.materials || []).map((m: any) => <div key={m.id} style={{ marginBottom: 14 }}><b>{m.id} {m.title}</b> <Tag>{m.kind}</Tag><Tag color={m.source === 'db' ? 'green' : m.source === 'generated' ? 'orange' : 'gold'}>{m.source === 'db' ? '来自材料' : m.source === 'generated' ? '补写' : '混合'}</Tag>{m.basis && <Text type="secondary"> 依据：{m.basis}</Text>}<pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#fafbff', padding: 10, borderRadius: 8, fontSize: 13 }}>{m.content}</pre></div>) },
        { key: 'r', label: `rubric（${(T.rubric || []).length}）`, children: <Table size="small" rowKey="id" pagination={false} dataSource={T.rubric || []} columns={[
          { title: '#', dataIndex: 'id', width: 50 }, { title: '条目', dataIndex: 'title', render: (v: string, r: any) => <div><b>{v}</b><div style={{ fontSize: 12, color: '#666' }}>{r.desc}</div></div> },
          { title: '权重', dataIndex: 'weight', width: 60 }, { title: '依赖', dataIndex: 'depends_on', width: 80, render: (v: string[]) => v?.join('、') || '–' },
          { title: '依据', dataIndex: 'basis', width: 200, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
          { title: 'BARS', dataIndex: 'levels', width: 320, render: (l: any) => <div style={{ fontSize: 12 }}>{['L1', 'L2', 'L3', 'L4'].map(k => <div key={k}><b>{k}</b> {l?.[k]}</div>)}</div> },
        ]} /> },
        { key: 'b', label: `AI 基线${T.baseline ? ` · ${T.baseline.result?.total} 分` : ''}`, children: T.baseline ? <div><Paragraph>AI 先做了一遍，用同一套 rubric 评：<b>{T.baseline.result?.total}</b> 分。{T.baseline.result?.summary}</Paragraph><Table size="small" rowKey="id" pagination={false} dataSource={T.baseline.result?.items || []} columns={[{ title: '条目', dataIndex: 'title' }, { title: '等级', dataIndex: 'level', width: 60 }, { title: '分', dataIndex: 'score', width: 60 }, { title: '证据 / 说明', render: (_: any, i: any) => <span style={{ fontSize: 12 }}>{i.evidence && <i>“{i.evidence}” </i>}{i.note}</span> }]} /><details style={{ marginTop: 12 }}><summary>AI 的答卷</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#fafbff', padding: 10, borderRadius: 8 }}>{T.baseline.answer}</pre></details></div> : <Text type="secondary">还没跑 AI 基线</Text> },
        { key: 's', label: `做题情况与评分（${sessions.length}）`, children: <Table size="small" rowKey="id" pagination={false} dataSource={sessions} columns={[
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
