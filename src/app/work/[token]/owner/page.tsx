'use client';

/** 真活台 · 出题人管理页（凭 ?k=<owner_key>，不用登录）：看题、复制参与链接、发布 / 下架、重跑基线、看每个人的报告 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WorkLogo } from '@/components/work/WorkLogo';

import { App, Button, ConfigProvider, Input, Space, Tag } from 'antd';
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
  const [fb, setFb] = useState(''); const [revising, setRevising] = useState(false);
  const revise = async () => { if (!fb.trim()) return; setRevising(true); try { const j = await (await fetch(`/api/work/${token}/owner?k=${encodeURIComponent(k)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: fb }) })).json(); if (!j.ok) throw new Error(j.error); message.success(`改好了：${j.changelog}`, 8); setFb(''); load(); } catch (e: any) { message.error(e.message); } finally { setRevising(false); } };
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
  const done = d.sessions.filter(s => s.submitted_at); const scored = done.filter(s => s.score != null); const avg = scored.length ? Math.round(scored.reduce((a, s) => a + (Number(s.score) || 0), 0) / scored.length) : null;
  const env = T.task?.env?.type || 'doc';
  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 28px', background: '#fff', borderBottom: '1px solid #e8e9f0' }}>
        <WorkLogo size="md" />
        <Link href="/work/mine" style={{ color: '#6055f5', fontSize: 13 }}>← 我的真活</Link>
        <span style={{ color: '#999', fontSize: 12, marginLeft: 'auto' }}>真活空间 · 这条链接带管理密钥，可转给同事</span>
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
        {/* 对题提意见：AI 按意见修订，没提到的不动；改完基线作废 */}
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>这道题哪里不对？说一句，按你的意见改</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Input.TextArea value={fb} onChange={e => setFb(e.target.value)} placeholder="比如：缺口补位那条标准太宽，要求按月给出具体调拨量；材料 m3 的良率改成 78%；时间压到 60 分钟；去掉邮件这个交付物" autoSize={{ minRows: 2, maxRows: 5 }} style={{ flex: 1, minWidth: 320 }} />
            <Button type="primary" loading={revising} onClick={revise} disabled={!fb.trim()}>按意见修订（约 1 分钟）</Button>
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>没提到的部分原样保留；改完 AI 基线作废，记得重跑。{T.task?.revisions?.length ? `已修订 ${T.task.revisions.length} 次。` : ''}{!T.baseline ? ' 现在没有基线。' : ''}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '8px 18px 18px' }}>
          <WorkTaskDetail task={T} sessions={d.sessions} shareLink={share} notes={T.notes} defaultTab={d.sessions.length ? 's' : 'p'} />
        </div>
      </div>
    </div>
  );
}
