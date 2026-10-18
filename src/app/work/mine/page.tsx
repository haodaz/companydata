'use client';

/**
 * 我的真活 /work/mine：出真活、管真活、分享、看考评，一页搞定（C 端老板 / 带队的人，不用登录）。
 * 浏览器记住你在这里出过的题（localStorage: work:mine），换了设备可以粘贴管理链接找回。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, ConfigProvider, Drawer, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { CopyOutlined, EyeOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons';
import { WorkTaskDetail, ENV_META } from '@/components/work/WorkTaskDetail';

const { Text } = Typography;
type Mine = { token: string; key: string; title: string; company: string; role: string; env: string; at: string };
const KEY = 'work:mine';
const load = (): Mine[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = (m: Mine[]) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} };

export default function MinePage() {
  return <ConfigProvider theme={{ token: { colorPrimary: '#6055f5', borderRadius: 10 } }}><App><Inner /></App></ConfigProvider>;
}

function Inner() {
  const { message } = App.useApp();
  const [mine, setMine] = useState<Mine[]>([]);
  const [live, setLive] = useState<Record<string, { status: string; sessions: number; done: number; baseline: number | null }>>({});
  const [f, setF] = useState({ company: '', role: '', env: '', focus: '', name: '', contact: '' });
  const [busy, setBusy] = useState(''); const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<{ task: any; sessions: any[]; token: string; key: string } | null>(null);
  const [recover, setRecover] = useState('');
  const origin = typeof location !== 'undefined' ? location.origin : '';

  useEffect(() => {
    const m = load(); setMine(m);
    try { const saved = JSON.parse(localStorage.getItem('work:owner') || 'null'); if (saved) setF(x => ({ ...x, name: saved.name || '', contact: saved.contact || '' })); } catch {}
    // 每道题的实时状态（作答数 / 基线）
    m.forEach(async t => { const j = await (await fetch(`/api/work/${t.token}/owner?k=${encodeURIComponent(t.key)}`, { cache: 'no-store' })).json().catch(() => null); if (j?.ok) setLive(x => ({ ...x, [t.token]: { status: j.task.status, sessions: j.sessions.length, done: j.sessions.filter((s: any) => s.submitted_at).length, baseline: j.task.baseline?.result?.total ?? null } })); });
  }, []);

  const create = async () => {
    if (!f.company.trim() || !f.role.trim()) return message.warning('企业和岗位都要填');
    if (!f.name.trim() || !f.contact.trim()) return message.warning('留个称呼和联系方式');
    setBusy('在拼这家企业的材料、出题、做材料包、定标准、让 AI 先做一遍……约 2–3 分钟，别关页面');
    try {
      const j = await (await fetch('/api/work/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })).json();
      if (!j.ok) throw new Error(j.error);
      const row: Mine = { token: j.share_token, key: j.owner_key, title: j.title, company: f.company, role: f.role, env: j.env, at: new Date().toISOString() };
      const m = [row, ...load()]; save(m); setMine(m); try { localStorage.setItem('work:owner', JSON.stringify({ name: f.name, contact: f.contact })); } catch {}
      setLive(x => ({ ...x, [j.share_token]: { status: 'published', sessions: 0, done: 0, baseline: j.baseline } }));
      message.success(`题出好了：${j.title}${j.baseline != null ? `，AI 基线 ${j.baseline} 分` : ''}`);
      if (j.notes?.length) message.info(j.notes.join('；'), 8);
      setOpen(false); setF(x => ({ ...x, company: '', role: '', focus: '' }));
    } catch (e: any) { message.error(e.message); } finally { setBusy(''); }
  };
  const openDetail = async (t: Mine) => {
    const j = await (await fetch(`/api/work/${t.token}/owner?k=${encodeURIComponent(t.key)}`, { cache: 'no-store' })).json();
    if (!j.ok) return message.error(j.error); setDetail({ task: j.task, sessions: j.sessions, token: t.token, key: t.key });
  };
  const setStatus = async (t: Mine, status: string) => { await fetch(`/api/work/${t.token}/owner?k=${encodeURIComponent(t.key)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); setLive(x => ({ ...x, [t.token]: { ...(x[t.token] || { sessions: 0, done: 0, baseline: null }), status } })); message.success(status === 'published' ? '已发布' : '已下架'); };
  const copy = (t: Mine) => { navigator.clipboard.writeText(`${origin}/work/${t.token}`); message.success('参与链接已复制，甩出去就能做'); };
  const doRecover = () => { const m = /\/work\/([^/?]+)\/owner\?k=([^&\s]+)/.exec(recover.trim()); if (!m) return message.warning('粘贴管理链接（…/work/xxx/owner?k=…）'); const row: Mine = { token: m[1], key: decodeURIComponent(m[2]), title: '（找回的题）', company: '', role: '', env: '', at: new Date().toISOString() }; const all = [row, ...load().filter(x => x.token !== row.token)]; save(all); setMine(all); setRecover(''); openDetail(row).then(() => { const j = load(); setMine(j); }); };
  const remove = (t: Mine) => { const m = load().filter(x => x.token !== t.token); save(m); setMine(m); };

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 28px', background: '#fff', borderBottom: '1px solid #e8e9f0' }}>
        <Link href="/work" style={{ fontWeight: 800, color: '#1a1a2e', textDecoration: 'none' }}>百业AI<span style={{ color: '#6055f5' }}>｜</span>真活</Link>
        <span style={{ color: '#888', fontSize: 13 }}>我的真活</span>
        <div style={{ marginLeft: 'auto' }}><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>出一道真活</Button></div>
      </div>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 60px' }}>
        <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>我的真活</h1>
        <div style={{ color: '#666', marginBottom: 18 }}>出题、分享参与链接、看每个人的考评，都在这一页。浏览器会记住你在这里出过的题；换了设备就把管理链接贴回来。</div>
        {!mine.length && <div style={{ background: '#fff', border: '1px dashed #d9dbe6', borderRadius: 14, padding: '28px 24px', textAlign: 'center', marginBottom: 16 }}>
          <RocketOutlined style={{ fontSize: 28, color: '#6055f5' }} />
          <div style={{ fontWeight: 700, marginTop: 8 }}>还没有出过题</div>
          <div style={{ color: '#666', fontSize: 13, margin: '4px 0 14px' }}>填企业和岗位，两三分钟出一道带材料包、逐条标准和 AI 基线的真活</div>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setOpen(true)}>出一道真活</Button>
        </div>}
        {!!mine.length && <Table size="middle" rowKey="token" pagination={false} dataSource={mine} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}
          columns={[
            { title: '题', render: (_: any, t: Mine) => <a onClick={() => openDetail(t)}><b>{t.title}</b><div style={{ fontSize: 12, color: '#888' }}>{t.company}{t.role ? ' · ' + t.role : ''}</div></a> },
            { title: '操作台', width: 130, render: (_: any, t: Mine) => <Tag color={ENV_META[t.env]?.color}>{ENV_META[t.env]?.label || '—'}</Tag> },
            { title: '状态', width: 90, render: (_: any, t: Mine) => { const s = live[t.token]?.status; return <Tag color={s === 'published' ? 'green' : 'default'}>{s === 'published' ? '已发布' : s === 'archived' ? '已下架' : '…'}</Tag>; } },
            { title: 'AI 基线', width: 90, align: 'right' as const, render: (_: any, t: Mine) => live[t.token]?.baseline ?? '–' },
            { title: '作答', width: 100, render: (_: any, t: Mine) => live[t.token] ? `${live[t.token].done} / ${live[t.token].sessions}` : '…' },
            { title: '', width: 330, render: (_: any, t: Mine) => <Space size={4} wrap>
              <Button size="small" type="primary" icon={<CopyOutlined />} onClick={() => copy(t)}>复制参与链接</Button>
              <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(t)}>看考评</Button>
              {live[t.token]?.status === 'published' ? <Button size="small" onClick={() => setStatus(t, 'archived')}>下架</Button> : <Button size="small" onClick={() => setStatus(t, 'published')}>发布</Button>}
              <Button size="small" type="text" onClick={() => remove(t)}>移出列表</Button>
            </Space> },
          ]} />}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: '#888', fontSize: 13 }}>换了设备？粘贴管理链接找回：<Input value={recover} onChange={e => setRecover(e.target.value)} placeholder="https://…/work/xxx/owner?k=…" style={{ width: 360 }} /><Button onClick={doRecover}>找回</Button></div>
      </div>

      <Drawer open={open} onClose={() => !busy && setOpen(false)} width={Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 40 : 560)} title="出一道真活">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Input value={f.company} onChange={e => setF(x => ({ ...x, company: e.target.value }))} placeholder="企业：公司名，如 宁德时代" size="large" />
          <Input value={f.role} onChange={e => setF(x => ({ ...x, role: e.target.value }))} placeholder="岗位 / 职业：如 供应链计划、后端开发" size="large" />
          <Select value={f.env} onChange={v => setF(x => ({ ...x, env: v }))} size="large" style={{ width: '100%' }} options={[{ value: '', label: '操作台：按岗位自动选' }, ...Object.entries(ENV_META).map(([v, m]) => ({ value: v, label: m.label }))]} />
          <Input.TextArea value={f.focus} onChange={e => setF(x => ({ ...x, focus: e.target.value }))} placeholder="你想考什么（选填）：聚焦哪个问题、给谁做、难度" autoSize={{ minRows: 2, maxRows: 4 }} />
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}><Input value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} placeholder="你的称呼" /><Input value={f.contact} onChange={e => setF(x => ({ ...x, contact: e.target.value }))} placeholder="联系方式（手机 / 微信 / 邮箱）" /></Space>
          <Button type="primary" size="large" block icon={<RocketOutlined />} loading={!!busy} onClick={create}>出题（约 2–3 分钟）</Button>
          {busy && <Text style={{ color: '#4c43c9' }}>{busy}</Text>}
          <Text type="secondary" style={{ fontSize: 12 }}>每人每天 3 道。题出好即发布；参与链接谁都能做，管理链接只有你有。</Text>
        </Space>
      </Drawer>
      <Drawer open={!!detail} onClose={() => setDetail(null)} width={Math.min(1000, typeof window !== 'undefined' ? window.innerWidth - 40 : 1000)} title={detail ? <span>{detail.task.task?.title} <Tag color={ENV_META[detail.task.task?.env?.type]?.color}>{ENV_META[detail.task.task?.env?.type]?.label}</Tag></span> : ''}
        extra={detail && <Space><Button type="primary" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(`${origin}/work/${detail.token}`); message.success('参与链接已复制'); }}>复制参与链接</Button><Link href={`/work/${detail.token}/owner?k=${encodeURIComponent(detail.key)}`} target="_blank"><Button>管理页 ↗</Button></Link></Space>}>
        {detail && <WorkTaskDetail task={detail.task} sessions={detail.sessions} shareLink={`${origin}/work/${detail.token}`} notes={detail.task.notes} />}
      </Drawer>
    </div>
  );
}
