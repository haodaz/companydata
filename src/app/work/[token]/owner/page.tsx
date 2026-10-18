'use client';

/** 真活台 · 出题人管理页（凭 ?k=<owner_key>，不用登录）：看题、复制参与链接、发布 / 下架、重跑基线、看每个人的报告 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { App, Button, ConfigProvider, Space, Tag } from 'antd';
import { WorkTaskDetail, ENV_META } from '@/components/work/WorkTaskDetail';

export default function OwnerPage() {
  return <ConfigProvider theme={{ token: { colorPrimary: '#6055f5', borderRadius: 10 } }}><App><Inner /></App></ConfigProvider>;
}

function Inner() {
  const { token } = useParams<{ token: string }>();
  const k = useSearchParams().get('k') || '';
  const { message } = App.useApp();
  const [d, setD] = useState<{ task: any; sessions: any[] } | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(k)}`, { cache: 'no-store' })).json();
    if (!j.ok) { setErr(j.error); return; } setD(j);
  }, [token, k]);
  useEffect(() => { load(); }, [load]);
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const share = `${origin}/work/${token}`;
  const setStatus = async (status: string) => { await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(k)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); message.success(status === 'published' ? '已发布，链接可用' : '已下架'); load(); };
  const rerun = async () => { setBusy(true); try { const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(k)}`, { method: 'POST' })).json(); if (!j.ok) throw new Error(j.error); message.success(`AI 基线 ${j.total} 分`); load(); } catch (e: any) { message.error(e.message); } finally { setBusy(false); } };
  if (err) return <div style={{ padding: 40, color: '#c0392b' }}>{err}</div>;
  if (!d) return <div style={{ padding: 40, color: '#888' }}>加载中…</div>;
  const T = d.task;
  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 60px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>真活台 · 管理页（这个链接只给你）</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '6px 0 16px' }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>{T.task?.title}</h1>
          <Tag color={ENV_META[T.task?.env?.type]?.color}>{ENV_META[T.task?.env?.type]?.label}</Tag>
          <Tag color={T.status === 'published' ? 'green' : 'default'}>{T.status === 'published' ? '已发布' : T.status === 'archived' ? '已下架' : '未发布'}</Tag>
          <span style={{ color: '#888' }}>{T.company_name} · {T.role}</span>
          <Space style={{ marginLeft: 'auto' }}>
            <Button type="primary" onClick={() => { navigator.clipboard.writeText(share); message.success('参与链接已复制，甩出去就能做'); }}>复制参与链接</Button>
            {T.status === 'published' ? <Button onClick={() => setStatus('archived')}>下架</Button> : <Button onClick={() => setStatus('published')}>发布</Button>}
            <Button onClick={rerun} loading={busy}>重跑 AI 基线</Button>
          </Space>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '8px 18px 18px' }}>
          <WorkTaskDetail task={T} sessions={d.sessions} shareLink={share} notes={T.notes} />
        </div>
      </div>
    </div>
  );
}
