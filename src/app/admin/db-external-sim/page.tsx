'use client';

/**
 * 外部模拟参照（迁移 051，10-26）：Forage 等平台的公开职业模拟，只收外层——谁家、什么岗位、扮演谁干什么活、练什么技能、学员评价、任务结构。
 *   不收题目正文。出题时当行业 / 职能的结构参照；每条都带原页链接，可溯源。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { DatabaseOutlined, LinkOutlined, StarFilled } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import { StatCards } from '@/components/admin/StatCards';
import { BRAND } from '@/lib/theme';

const { Text } = Typography;
const DIFF: Record<string, { label: string; color: string }> = { introductory: { label: '入门', color: 'green' }, intermediate: { label: '中级', color: 'blue' }, advanced: { label: '高级', color: 'purple' } };

export default function DbExternalSimPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<any[]>([]); const [stats, setStats] = useState<any>({}); const [careers, setCareers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ q: '', career: '', difficulty: '' });
  const load = useCallback(async () => { setLoading(true); const p = new URLSearchParams(); if (f.q) p.set('q', f.q); if (f.career) p.set('career', f.career); if (f.difficulty) p.set('difficulty', f.difficulty); const j = await (await fetch(`/api/admin/external-sims?${p}`)).json(); if (j.ok) { setData(j.data); setStats(j.stats); setCareers(j.careers); } else message.error(j.error); setLoading(false); }, [f, message]);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <PageHeader title="外部模拟参照" icon={<DatabaseOutlined />} description="Forage 等平台公开的企业职业模拟，只收外层：谁家、什么岗位、扮演谁干什么活、练什么技能、学员评价、任务结构（不收题目正文）。出题时按行业 / 职能当结构参照，每条都能点回原页溯源。" />
      <StatCards loading={loading} items={[{ label: '模拟', value: stats.total || 0 }, { label: '企业', value: stats.companies || 0 }, { label: '对上企业库', value: stats.linked || 0 }, { label: '职业方向', value: stats.careers || 0 }, { label: '任务', value: stats.tasks || 0 }, { label: '平均评分', value: stats.rating != null ? Number(stats.rating).toFixed(1) : '—' }]} />
      <Panel>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search allowClear placeholder="模拟名 / 企业" style={{ width: 280 }} onSearch={v => setF(x => ({ ...x, q: v }))} />
          <Select allowClear placeholder="职业方向" style={{ width: 200 }} value={f.career || undefined} onChange={v => setF(x => ({ ...x, career: v || '' }))} options={Object.entries(careers).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${k}（${n}）` }))} />
          <Select allowClear placeholder="难度" style={{ width: 120 }} value={f.difficulty || undefined} onChange={v => setF(x => ({ ...x, difficulty: v || '' }))} options={Object.entries(DIFF).map(([k, d]) => ({ value: k, label: d.label }))} />
        </Space>
        <Table size="small" rowKey="id" loading={loading} dataSource={data} scroll={{ x: 1200 }} pagination={{ pageSize: 30, showSizeChanger: false }}
          expandable={{ expandedRowRender: (r: any) => (
            <div style={{ fontSize: 12.5, lineHeight: 1.75, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
              <div>
                {r.role_summary && <div style={{ marginBottom: 6 }}><b>你的角色</b><div style={{ whiteSpace: 'pre-wrap', color: BRAND.ink2 }}>{r.role_summary}</div></div>}
                {r.goal_summary && <div style={{ marginBottom: 6 }}><b>你的目标</b><div style={{ whiteSpace: 'pre-wrap', color: BRAND.ink2 }}>{r.goal_summary}</div></div>}
                {!r.role_summary && r.meta?.intro && <div style={{ marginBottom: 6 }}><b>介绍</b><div style={{ color: BRAND.ink2 }}>{r.meta.intro}</div></div>}
                <div><b>任务结构</b></div>
                {(r.task_structure || []).filter((t: any) => t.type === 'normal').map((t: any) => (
                  <div key={t.position + t.title} style={{ marginTop: 4 }}>
                    <Text strong>{t.position}. {t.title}</Text> <Text type="secondary">{t.tagline}</Text>
                    <div style={{ fontSize: 12, color: BRAND.ink3 }}>{[t.time, t.steps && `${t.steps} 步`, (t.skills || []).join(' / ')].filter(Boolean).join(' · ')}</div>
                  </div>
                ))}
              </div>
              <div>
                <div><b>学员评价</b>{r.rating != null && <span style={{ marginLeft: 6, color: '#d97706' }}><StarFilled /> {r.rating}</span>}</div>
                {(r.review_samples || []).map((v: any, i: number) => <div key={i} style={{ marginTop: 4, color: BRAND.ink2 }}>「{v.text}」<span style={{ color: BRAND.ink3 }}>—— {v.school || '学员'}</span></div>)}
                <div style={{ marginTop: 8 }}><b>面向专业</b>：{(r.target_majors || []).join('、') || '—'}</div>
                <div><b>完成可得</b>：{(r.achievements || []).join('、') || '—'}</div>
                <div><b>来源</b>：<a href={r.url} target="_blank" rel="noreferrer"><LinkOutlined /> {r.url}</a>{r.fetched_at && <span style={{ color: BRAND.ink3 }}>（{String(r.fetched_at).slice(0, 10)} 抓取）</span>}</div>
              </div>
            </div>
          ) }}
          columns={[
            { title: '模拟', dataIndex: 'title', width: 300, render: (v: string, r: any) => <div><a href={r.url} target="_blank" rel="noreferrer" style={{ color: BRAND.ink, fontWeight: 600 }}>{v}</a><div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.tagline}</div></div> },
            { title: '企业', dataIndex: 'company_name', width: 200, render: (v: string, r: any) => r.company_id ? <a href={`/admin/db-company/${r.company_id}`}>{v}</a> : <span>{v}</span> },
            { title: '职业方向', dataIndex: 'career_areas', width: 170, render: (v: string[]) => <Space size={4} wrap>{(v || []).map(c => <Tag key={c} style={{ margin: 0 }}>{c}</Tag>)}</Space> },
            { title: '难度 / 时长', width: 130, render: (_: any, r: any) => <span>{r.difficulty ? <Tag color={DIFF[r.difficulty]?.color}>{DIFF[r.difficulty]?.label || r.difficulty}</Tag> : null}<span style={{ fontSize: 12 }}>{r.time_guidance}</span></span> },
            { title: '任务', width: 60, align: 'center' as const, render: (_: any, r: any) => (r.task_structure || []).filter((t: any) => t.type === 'normal').length },
            { title: '技能', dataIndex: 'skills', width: 260, render: (v: string[]) => <span style={{ fontSize: 12, color: BRAND.ink2 }}>{(v || []).slice(0, 6).join(' · ')}{(v || []).length > 6 ? ` 等 ${v.length} 项` : ''}</span> },
            { title: '评分', dataIndex: 'rating', width: 70, render: (v: number) => v != null ? <span style={{ color: '#d97706' }}><StarFilled /> {v}</span> : <Text type="secondary">—</Text> },
          ]} />
      </Panel>
    </div>
  );
}
