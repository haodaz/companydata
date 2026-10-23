'use client';

/**
 * 真活后台 · 样本库（2026-10-23，内部训练素材）：老王给的好题（商学院 / 咨询案例、内部考题）在这里入库；
 * 出题时生成器在后台按岗位、题型自动挑 0–2 份当参照（用户看不见）。这里能看骨架、删。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Drawer, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { Panel } from '@/components/admin/PageHeader';
import { SampleUpload, type SampleRow } from '@/components/work/SampleUpload';
import { Md } from '@/components/ws/Md';

const { Text, Paragraph } = Typography;
const TYPE_CN: Record<string, string> = { structuring: '搭框架', judgement: '判断与洞察', numeracy: '测算', creativity: '出主意', synthesis: '综合建议', other: '其它' };

export function SamplesPanel() {
  const { message } = App.useApp();
  const [list, setList] = useState<SampleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState<SampleRow | null>(null);
  const load = useCallback(async () => { setLoading(true); try { const j = await (await fetch('/api/admin/work/samples', { cache: 'no-store' })).json(); if (j.ok) setList(j.samples); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const remove = async (s: SampleRow) => { const j = await (await fetch(`/api/admin/work/samples?id=${s.id}`, { method: 'DELETE' })).json(); if (!j.ok) return message.error(j.error); message.success('已删'); load(); };
  const k = cur?.skeleton;
  return (
    <Panel style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>样本库 · 内部训练素材</div>
          <div style={{ fontSize: 12.5, color: '#888', marginTop: 2 }}>交一道公认的好题（商学院案例、咨询面试案例、内部考题），AI 拆成推进步骤、每步给的信息、参考答案和要算的数。之后每一道真活出题时，生成器都会在后台按岗位和题型自动挑最像的当参照——用户看不见这层。标「参考资料」的是出题人自己交的，只用于他自己出题。</div>
        </div>
        <SampleUpload shared onDone={() => load()} size="small" />
      </div>
      <Table size="small" rowKey="id" loading={loading} dataSource={list} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
        { title: '题', dataIndex: 'title', render: (v: string, s: SampleRow) => <a onClick={() => setCur(s)}><b>{v}</b></a> },
        { title: '行业 · 类型', render: (_: any, s: SampleRow) => <span>{s.industry || '—'} <Text type="secondary">· {s.problem_type || '—'}</Text></span> },
        { title: '难度', dataIndex: 'difficulty', width: 70 },
        { title: '步数', dataIndex: 'stages', width: 60, align: 'right' as const },
        { title: '形式', dataIndex: 'format', width: 130, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
        { title: '', width: 90, render: (_: any, s: SampleRow) => (s.shared ? <Tag color="purple">训练素材</Tag> : <Tag>参考资料</Tag>) },
        { title: '谁交的', dataIndex: 'created_by', width: 200, render: (v: string, s: SampleRow) => <Text type="secondary" style={{ fontSize: 12 }}>{v} · {s.created_at ? new Date(s.created_at).toLocaleDateString('zh-CN') : ''}</Text> },
        { title: '', width: 110, render: (_: any, s: SampleRow) => <Space size={4}><Button size="small" icon={<EyeOutlined />} onClick={() => setCur(s)} /><Popconfirm title="删掉这份？" onConfirm={() => remove(s)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
      ]} />
      <Drawer open={!!cur} onClose={() => setCur(null)} width={Math.min(860, typeof window !== 'undefined' ? window.innerWidth - 40 : 860)} title={cur?.title}>
        {k && <div>
          <Paragraph><Tag>{k.problem_type}</Tag><Tag>{k.industry}</Tag><Tag>难度 {k.difficulty}</Tag><Tag>{k.format}</Tag>{k.summary}</Paragraph>
          {!!k.style_notes?.length && <div style={{ marginBottom: 14 }}><b>好在哪（出题时保留的手法）</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{k.style_notes.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
          {(k.stages || []).map((st: any) => <div key={st.id} style={{ marginBottom: 14, padding: '12px 14px', background: '#fafbff', borderRadius: 10 }}>
            <div><Tag color="purple">{st.id}</Tag><Tag>{TYPE_CN[st.type] || st.type}</Tag><b>{st.question}</b></div>
            {st.reveal && <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer', color: '#6055f5', fontSize: 13 }}>这一步给的信息</summary><div style={{ fontSize: 13, marginTop: 6 }}><Md text={st.reveal} /></div></details>}
            <div style={{ marginTop: 6, fontSize: 13 }}><Text type="secondary">参考答案</Text><Md text={st.expected} /></div>
            {!!st.calc?.length && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{st.calc.map((c: any, i: number) => <li key={i}>{c.label}：<code>{c.expr}</code> = <b>{c.value}</b>{c.verified === false && <Tag color="orange" style={{ marginLeft: 6 }}>算式没核上</Tag>}</li>)}</ul>}
          </div>)}
          {!!k.exhibits?.length && <div><b>图表</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{k.exhibits.map((e: any, i: number) => <li key={i}>{e.title} <Text type="secondary">{e.desc}</Text></li>)}</ul></div>}
        </div>}
      </Drawer>
    </Panel>
  );
}
