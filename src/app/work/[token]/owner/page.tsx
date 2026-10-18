'use client';

/** 真活台 · 出题人管理页（凭 ?k=<owner_key>，不用登录）：看题、复制参与链接、发布 / 下架、重跑基线、看每个人的报告 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
  const done = d.sessions.filter(s => s.submitted_at); const avg = done.length ? Math.round(done.reduce((a, s) => a + (Number(s.score) || 0), 0) / done.length) : null;
  const env = T.task?.env?.type || 'doc';
  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 28px', background: '#fff', borderBottom: '1px solid #e8e9f0' }}>
        <Link href="/work" style={{ fontWeight: 800, color: '#1a1a2e', textDecoration: 'none' }}>百业AI<span style={{ color: '#6055f5' }}>｜</span>真活</Link>
        <Link href="/work/mine" style={{ color: '#6055f5', fontSize: 13 }}>← 我的真活</Link>
        <span style={{ color: '#999', fontSize: 12, marginLeft: 'auto' }}>这个链接只给你 · 真活空间</span>
      </div>
      {/* 封面头部：操作台界面做底 */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #2b2463, #0f6c7a)', color: '#fff' }}>
        <img src={`/work/shot-${env}.png`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: .35 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(10,12,30,.92) 0%, rgba(10,12,30,.75) 55%, rgba(10,12,30,.4) 100%)' }} />
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '30px 20px 26px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}><Tag color={ENV_META[env]?.color} style={{ margin: 0 }}>{ENV_META[env]?.label}</Tag><Tag color={T.status === 'published' ? 'green' : 'default'} style={{ margin: 0 }}>{T.status === 'published' ? '已发布' : T.status === 'archived' ? '已下架' : '未发布'}</Tag></div>
          <h1 style={{ fontSize: 30, margin: '0 0 6px', lineHeight: 1.25 }}>{T.task?.title}</h1>
          <div style={{ opacity: .85 }}>{T.company_name} · {T.role} · 建议 {T.task?.time_minutes} 分钟</div>
          <div style={{ display: 'flex', gap: 26, marginTop: 18, flexWrap: 'wrap' }}>
            {[[d.sessions.length, '参与'], [done.length, '交卷'], [avg ?? '–', '平均分'], [T.baseline?.result?.total ?? '–', 'AI 基线']].map(([n, l]) => <div key={String(l)}><div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, opacity: .8 }}>{l}</div></div>)}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '18px 20px 60px' }}>
        {/* 分享区 */}
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>参与链接</div>
          <code style={{ fontSize: 13, background: '#f7f8fc', padding: '6px 10px', borderRadius: 8, border: '1px solid #e8e9f0', wordBreak: 'break-all' }}>{share}</code>
          <Space style={{ marginLeft: 'auto' }}>
            <Button type="primary" onClick={() => { navigator.clipboard.writeText(share); message.success('参与链接已复制，甩出去就能做'); }}>复制参与链接</Button>
            {T.status === 'published' ? <Button onClick={() => setStatus('archived')}>下架</Button> : <Button onClick={() => setStatus('published')}>发布</Button>}
            <Button onClick={rerun} loading={busy}>重跑 AI 基线</Button>
          </Space>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '8px 18px 18px' }}>
          <WorkTaskDetail task={T} sessions={d.sessions} shareLink={share} notes={T.notes} defaultTab={d.sessions.length ? 's' : 'p'} />
        </div>
      </div>
    </div>
  );
}
