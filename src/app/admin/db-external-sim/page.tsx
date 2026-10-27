'use client';

/**
 * 外部模拟参照（迁移 051，10-26）：Forage 等平台的公开职业模拟，只收外层——谁家、什么岗位、扮演谁干什么活、练什么技能、学员评价、任务结构。
 *   不收题目正文。出题时当行业 / 职能的结构参照；每条都带原页链接，可溯源。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Drawer, Input, Select, Space, Table, Tag, Typography } from 'antd';
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
  const [open, setOpen] = useState<any>(null);   // 点一行：右侧抽屉看细节（概览 / 每个任务 / 评价原文）
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
          onRow={(r: any) => ({ onClick: () => setOpen(r), style: { cursor: 'pointer' } })}
          columns={[
            { title: '模拟', dataIndex: 'title', width: 300, render: (v: string, r: any) => <div><span style={{ color: BRAND.ink, fontWeight: 600 }}>{v}</span><div style={{ fontSize: 12, color: BRAND.ink3 }}>{r.tagline}</div></div> },
            { title: '企业', dataIndex: 'company_name', width: 200, render: (v: string, r: any) => r.company_id ? <a href={`/admin/db-company/${r.company_id}`} onClick={e => e.stopPropagation()}>{v}</a> : <span>{v}</span> },
            { title: '职业方向', dataIndex: 'career_areas', width: 170, render: (v: string[]) => <Space size={4} wrap>{(v || []).map(c => <Tag key={c} style={{ margin: 0 }}>{c}</Tag>)}</Space> },
            { title: '难度 / 时长', width: 130, render: (_: any, r: any) => <span>{r.difficulty ? <Tag color={DIFF[r.difficulty]?.color}>{DIFF[r.difficulty]?.label || r.difficulty}</Tag> : null}<span style={{ fontSize: 12 }}>{r.time_guidance}</span></span> },
            { title: '任务', width: 60, align: 'center' as const, render: (_: any, r: any) => (r.task_structure || []).filter((t: any) => t.type === 'normal').length },
            { title: '技能', dataIndex: 'skills', width: 260, render: (v: string[]) => <span style={{ fontSize: 12, color: BRAND.ink2 }}>{(v || []).slice(0, 6).join(' · ')}{(v || []).length > 6 ? ` 等 ${v.length} 项` : ''}</span> },
            { title: '评分', dataIndex: 'rating', width: 70, render: (v: number) => v != null ? <span style={{ color: '#d97706' }}><StarFilled /> {v}</span> : <Text type="secondary">—</Text> },
          ]} />
      </Panel>
      <Drawer open={!!open} onClose={() => setOpen(null)} size={760} title={open?.title} destroyOnHidden
        extra={open && <a href={open.url} target="_blank" rel="noreferrer"><LinkOutlined /> 原页</a>}>
        {open && <SimDetail r={open} />}
      </Drawer>
    </div>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, margin: '18px 0 8px', borderLeft: `3px solid ${BRAND.primary}`, paddingLeft: 8 }}>{children}</div>;
const Pre = ({ text }: { text?: string | null }) => text ? <div style={{ whiteSpace: 'pre-wrap', color: BRAND.ink2, fontSize: 13, lineHeight: 1.75 }}>{text}</div> : <Text type="secondary">—</Text>;

/** 抽屉：一条模拟的全部外层——概览、角色与目标、每个任务（会学到 / 要做 / 步骤标题）、学员评价原文、来源 */
function SimDetail({ r }: { r: any }) {
  const tasks = (r.task_structure || []).filter((t: any) => t.type === 'normal');
  return (
    <div style={{ fontSize: 13 }}>
      <Space size={[6, 6]} wrap>
        {r.company_id ? <a href={`/admin/db-company/${r.company_id}`}><Tag color="blue" style={{ margin: 0 }}>{r.company_name}</Tag></a> : <Tag style={{ margin: 0 }}>{r.company_name}</Tag>}
        {(r.career_areas || []).map((c: string) => <Tag key={c} style={{ margin: 0 }}>{c}</Tag>)}
        {r.difficulty && <Tag color={DIFF[r.difficulty]?.color} style={{ margin: 0 }}>{DIFF[r.difficulty]?.label || r.difficulty}</Tag>}
        {r.time_guidance && <Tag style={{ margin: 0 }}>{r.time_guidance}</Tag>}
        {r.rating != null && <Tag color="gold" style={{ margin: 0 }}><StarFilled /> {r.rating}</Tag>}
        <Tag style={{ margin: 0 }}>{tasks.length} 个任务</Tag>
      </Space>
      {r.tagline && <div style={{ marginTop: 10, color: BRAND.ink2 }}>{r.tagline}</div>}

      <H>概览</H>
      <Pre text={r.meta?.overview || r.meta?.intro} />
      {(r.role_summary || r.goal_summary) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div style={{ background: BRAND.borderSoft, borderRadius: 8, padding: '10px 12px' }}><b>你的角色</b><Pre text={r.role_summary} /></div>
          <div style={{ background: BRAND.borderSoft, borderRadius: 8, padding: '10px 12px' }}><b>你的目标</b><Pre text={r.goal_summary} /></div>
        </div>
      )}

      <H>任务（{tasks.length}）</H>
      {tasks.map((t: any) => (
        <div key={t.position + t.title} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <b>{t.position}. {t.title}</b>
            <span style={{ fontSize: 12, color: BRAND.ink3, whiteSpace: 'nowrap' }}>{[t.time, t.difficulty && (DIFF[t.difficulty]?.label || t.difficulty), t.steps && `${t.steps} 步`].filter(Boolean).join(' · ')}</span>
          </div>
          {t.tagline && <div style={{ color: BRAND.ink2, marginTop: 2 }}>{t.tagline}</div>}
          {(t.skills || []).length > 0 && <Space size={4} wrap style={{ marginTop: 6 }}>{t.skills.map((k: string, i: number) => <Tag key={k + i} color="purple" style={{ margin: 0 }}>{k}</Tag>)}</Space>}
          {t.learn && <div style={{ marginTop: 8 }}><b style={{ fontSize: 12 }}>会学到</b><Pre text={t.learn} /></div>}
          {t.do && <div style={{ marginTop: 6 }}><b style={{ fontSize: 12 }}>要做的事</b><Pre text={t.do} /></div>}
          {(t.step_titles || []).length > 0 && <div style={{ marginTop: 6, fontSize: 12, color: BRAND.ink3 }}>步骤：{t.step_titles.map((x: any) => x.title).join(' → ')}</div>}
        </div>
      ))}

      <H>学员评价{r.rating != null ? `（${r.rating}）` : ''}</H>
      {(r.review_samples || []).length ? r.review_samples.map((v: any, i: number) => (
        <div key={i} style={{ background: BRAND.borderSoft, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ color: BRAND.ink2, lineHeight: 1.75 }}>{v.text}</div>
          <div style={{ fontSize: 12, color: BRAND.ink3, marginTop: 4 }}>—— 学生，{v.school || '—'}</div>
        </div>
      )) : <Text type="secondary">—</Text>}

      <H>其他</H>
      <div style={{ lineHeight: 1.9 }}>
        <div><b>技能</b>：{(r.skills || []).join('、') || '—'}</div>
        <div><b>面向专业</b>：{(r.target_majors || []).join('、') || '—'}</div>
        <div><b>完成可得</b>：{(r.achievements || []).join('、') || '—'}</div>
        <div><b>企业类型</b>：{r.company_type || '—'}{r.launch_date ? ` · ${String(r.launch_date).slice(0, 10)} 上线` : ''}</div>
        <div><b>来源</b>：<a href={r.url} target="_blank" rel="noreferrer">{r.url}</a>{r.fetched_at && <span style={{ color: BRAND.ink3 }}>（{String(r.fetched_at).slice(0, 10)} 抓取）</span>}</div>
      </div>
    </div>
  );
}
