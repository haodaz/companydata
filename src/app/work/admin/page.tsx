'use client';

/**
 * 真活台 · 管理页 /work/admin（迁移 035）：出题（生成器是核心）→ AI 基线 → 复制参与链接甩出去 → 看每个人的报告。
 * 只给管理员（看 / 管全部）；普通用户进来转回 /work/mine，只管自己出的题（2026-10-23）。
 * 独立于 /lab 和数据实体后台（用户 10-18：管理端不要和数据实体管理掺合），只借后台的登录；数据后台里只留一个新窗口入口。
 */
import { ShowcaseAdmin } from '@/components/work/ShowcaseAdmin';
import { WorkTopBar } from '@/components/work/WorkTopBar';
import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, ConfigProvider, Drawer, Input, Popconfirm, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined, EyeOutlined, RocketOutlined, SendOutlined } from '@ant-design/icons';
import { PageHeader, Panel } from '@/components/admin/PageHeader';
import Link from 'next/link';
import { WorkTaskDetail } from '@/components/work/WorkTaskDetail';
import { CompanyRolePicker, type PickedCompany } from '@/components/work/CompanyRolePicker';
import { SamplesPanel } from '@/components/work/SamplesPanel';

const { Text } = Typography;
const ENV: Record<string, { label: string; color: string }> = { doc: { label: '文档 / 对账台', color: 'purple' }, code: { label: '代码台', color: 'geekblue' }, sheet: { label: '表格 / 数据台', color: 'cyan' }, design: { label: '设计台', color: 'orange' } };
const STATUS: Record<string, { label: string; color: string }> = { draft: { label: '生成中', color: 'default' }, ready: { label: '已出任务', color: 'blue' }, published: { label: '已发布', color: 'green' }, archived: { label: '已下架', color: 'default' } };

export default function WorkAdminPage() {
  return <ConfigProvider theme={{ token: { colorPrimary: '#6055f5', borderRadius: 10 } }}><App><Inner /></App></ConfigProvider>;
}

function Inner() {
  const { message } = App.useApp();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [form, setForm] = useState({ company: '', role: '', env: '', focus: '' });
  const [picked, setPicked] = useState<PickedCompany>(null);
  const [busy, setBusy] = useState('');
  const [detail, setDetail] = useState<{ task: any; sessions: any[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/admin/work/tasks', { cache: 'no-store' }); if (r.status === 401) { setNeedLogin(true); return; } const j = await r.json(); if (!j.ok) throw new Error(j.error); if (j.role !== 'admin') { location.replace('/work/mine'); return; } setList(j.tasks); }
    catch (e: any) { message.error(e.message); } finally { setLoading(false); }
  }, [message]);
  useEffect(() => { load(); }, [load]);

  const link = (t: any) => `${location.origin}/work/${t.share_token}`;
  const copy = async (t: any) => { await navigator.clipboard.writeText(link(t)); message.success('参与链接已复制，甩出去就能做'); };

  const create = async () => {
    if (!form.company.trim() || !form.role.trim()) return message.warning('企业和岗位都要填');
    setBusy('出任务中（拼材料 → 问题 → 任务 → 材料包 → rubric，约 1–2 分钟）…');
    try {
      const j = await (await fetch('/api/admin/work/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: form.company, company_id: picked?.id, role: form.role, env: form.env || undefined, focus: form.focus || undefined }) })).json();
      if (!j.ok) throw new Error(j.error);
      if (j.notes?.length) message.info(j.notes.join('；'), 6);
      setBusy('题出好了，AI 先做一遍当基线（约 1 分钟）…');
      const b = await (await fetch(`/api/admin/work/tasks/${j.id}/baseline`, { method: 'POST' })).json();
      if (!b.ok) message.warning(`基线没跑成：${b.error}（可在详情里重跑）`); else message.success(`任务出好了，AI 基线 ${b.baseline.total} 分`);
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
  if (needLogin) return <div style={{ padding: 40, textAlign: 'center' }}>这页要先登录。<Link href="/work/login?next=/work/admin">去登录</Link></div>;
  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb' }}>
      <WorkTopBar active="admin" />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 24px 60px' }}>
      <PageHeader title="真活台 · 管理" icon={<RocketOutlined />} description="拿一家企业的真实业务问题出任务：问题 → 任务 → 材料包 → 带依赖的 rubric → AI 基线。链接甩出去，对方做完就有报告（结果逐条 + 过程高光 / 风险 + 和 AI 的差距）。独立于 /lab 和数据后台。" />
      <Tabs defaultActiveKey="tasks" items={[
        { key: 'tasks', label: `题库（${list.length}）`, children: <div>
      <Panel style={{ marginBottom: 16 }}>
        <Space wrap align="start">
          <div style={{ display: 'grid', gap: 8, width: 520 }}><CompanyRolePicker size="middle" company={form.company} role={form.role} onCompany={(name, p) => { setForm(f => ({ ...f, company: name })); setPicked(p); }} onRole={r => setForm(f => ({ ...f, role: r }))} /></div>
          <Select value={form.env} onChange={v => setForm(f => ({ ...f, env: v }))} style={{ width: 170 }} options={[{ value: '', label: '操作台：按岗位自动选' }, ...Object.entries(ENV).map(([v, x]) => ({ value: v, label: x.label }))]} />
          <Input.TextArea value={form.focus} onChange={e => setForm(f => ({ ...f, focus: e.target.value }))} placeholder="出任务的人额外要求（选填：聚焦哪个问题、给谁看、难度）" autoSize={{ minRows: 1, maxRows: 3 }} style={{ width: 360 }} />
          <Button type="primary" icon={<RocketOutlined />} loading={!!busy} onClick={create}>出一道真活</Button>
        </Space>
        {busy && <div style={{ marginTop: 8, color: '#6055f5' }}>{busy}</div>}
      </Panel>
      <Panel padding={0}>
        <Table size="small" rowKey="id" loading={loading} dataSource={list} pagination={{ pageSize: 20 }}
          columns={[
            { title: '题', dataIndex: ['task', 'title'], render: (v: string, t: any) => <a onClick={() => open(t.id)}><b>{v || '（未命名）'}</b></a> },
            { title: '企业 · 岗位', render: (_: any, t: any) => <span>{t.company_name} <Text type="secondary">· {t.role}</Text>{t.owner?.name && <Tag style={{ marginLeft: 6 }}>自助 · {t.owner.name}</Tag>}</span> },
            { title: '操作台', dataIndex: ['task', 'env', 'type'], width: 120, render: (v: string) => <Tag color={ENV[v]?.color}>{ENV[v]?.label || v || 'doc'}</Tag> },
            { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS[v]?.color}>{STATUS[v]?.label || v}</Tag> },
            { title: 'AI 基线', dataIndex: ['baseline', 'total'], width: 90, align: 'right' as const, render: (v: number) => (v == null ? <Text type="secondary">–</Text> : <b>{v}</b>) },
            { title: '作答', width: 90, render: (_: any, t: any) => `${t.sessions.done} / ${t.sessions.n}` },
            { title: '出任务时间', dataIndex: 'created_at', width: 150, render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false }) },
            { title: '', width: 300, render: (_: any, t: any) => <Space size={4}>
              <Button size="small" icon={<CopyOutlined />} onClick={() => copy(t)}>复制链接</Button>
              <Button size="small" icon={<EyeOutlined />} onClick={() => open(t.id)}>详情</Button>
              {t.status !== 'published' ? <Button size="small" type="primary" ghost icon={<SendOutlined />} onClick={() => setStatus(t, 'published')}>发布</Button> : <Button size="small" onClick={() => setStatus(t, 'archived')}>下架</Button>}
              <Popconfirm title="删除这道题和所有作答？" onConfirm={() => remove(t)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
            </Space> },
          ]} />
      </Panel>

        </div> },
        { key: 'samples', label: '样本库 · 训练素材', children: <SamplesPanel /> },
        { key: 'showcase', label: '任务库上架', children: <ShowcaseAdmin /> },
      ]} />

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={Math.min(980, typeof window !== 'undefined' ? window.innerWidth - 40 : 980)} title={T ? <span>{T.task?.title} <Tag color={ENV[T.task?.env?.type]?.color}>{ENV[T.task?.env?.type]?.label}</Tag></span> : ''}
        extra={T && <Space><Button icon={<CopyOutlined />} onClick={() => copy(T)}>复制参与链接</Button><Button onClick={() => rerunBaseline(T)} loading={!!busy}>重跑 AI 基线</Button></Space>}>
        {T && <WorkTaskDetail task={T} sessions={detail!.sessions} shareLink={link(T)} notes={T.context?.notes} />}
      </Drawer>
      </div>
    </div>
  );
}
