'use client';

/** 真活台 · 出题人管理页（凭 ?k=<owner_key>，不用登录）：看题、复制参与链接、发布 / 下架、重跑基线、看每个人的报告 */
import { WorkTopBar } from '@/components/work/WorkTopBar';
import { Tour, type TourStep } from '@/components/work/Tour';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { App, Button, ConfigProvider, Input, Space, Tag } from 'antd';
import { WorkTaskDetail, ENV_META } from '@/components/work/WorkTaskDetail';
import { GenericCompare } from '@/components/work/GenericCompare';

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
  // 第一次进空间的引导（按浏览器记；顶栏「?」可重看）
  const [tour, setTour] = useState<number | null>(null);
  useEffect(() => { let seen = false; try { seen = localStorage.getItem('work-owner-tour-done') === '1'; } catch {} if (!seen) { const t = setTimeout(() => setTour(0), 900); return () => clearTimeout(t); } }, []);
  const OWNER_TOUR: TourStep[] = [
    { key: 'stats', title: '这是一道题的空间', text: '题名、企业、要找的人、建议时长，和四个数：多少人参与、多少人交了、平均分、AI 基线。这条链接带管理密钥，可以转给同事，别发给候选人。' },
    { key: 'share', title: '预览、发布、下架', text: '出好的题先是「待发布」。点「预览做题台」看候选人会看到什么；确认了点「发布」，参与链接才生效；之后随时下架。改过题记得「重跑 AI 基线」。' },
    { key: 'revise', title: '哪里不对，说一句就改', text: '把意见写在这里，AI 只改提到的部分，其余原样保留。改完这里会留一条修订记录。' },
    { key: 'detail', title: '题的全部', text: '问题与任务、推进步骤、材料包、评分标准、AI 基线、做题情况——分标签看。做题情况里点「看报告」，先看候选人交的原文，再看逐条评分。' },
  ];
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
      {tour != null && <Tour step={tour} steps={OWNER_TOUR} doneLabel="知道了" onStep={setTour} onDone={() => { setTour(null); try { localStorage.setItem('work-owner-tour-done', '1'); } catch {} }} />}
      <WorkTopBar active="mine" crumbs={[{ label: '我的真活', href: '/work/mine' }, { label: [T.company_name, T.task?.title || T.role].filter(Boolean).join(' · ') }]}
        crumbRight={<><span>真活空间 · 这条链接带管理密钥，可转给同事</span><button onClick={() => setTour(0)} title="界面说明" style={{ width: 26, height: 24, border: '1px solid #e0e0ee', background: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#666' }}>?</button></>} />
      {/* 封面头部：操作台界面做底 */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #2b2463, #0f6c7a)', color: '#fff' }}>
        <img src={`/work/shot-${env}.png`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: .35 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(10,12,30,.92) 0%, rgba(10,12,30,.75) 55%, rgba(10,12,30,.4) 100%)' }} />
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '30px 20px 26px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}><Tag color={ENV_META[env]?.color} style={{ margin: 0 }}>{ENV_META[env]?.label}</Tag><Tag color={T.status === 'published' ? 'green' : 'default'} style={{ margin: 0 }}>{T.status === 'published' ? '已发布' : T.status === 'archived' ? '已下架' : '待发布'}</Tag></div>
          <h1 style={{ fontSize: 30, margin: '0 0 6px', lineHeight: 1.25 }}>{T.task?.title}</h1>
          <div style={{ opacity: .85 }}>{T.company_name} · {T.role} · 建议 {T.task?.time_minutes} 分钟</div>
          <div data-tour="stats" style={{ display: 'flex', gap: 26, marginTop: 18, flexWrap: 'wrap' }}>
            {[[d.sessions.length, '参与'], [done.length, '交卷'], [avg ?? '–', '平均分'], [T.baseline?.result?.total ?? '–', 'AI 基线']].map(([n, l]) => <div key={String(l)}><div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 12, opacity: .8 }}>{l}</div></div>)}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '18px 20px 60px' }}>
        {/* 分享区 */}
        <div data-tour="share" style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>参与链接</div>
          {T.status === 'published' ? <code style={{ fontSize: 13, background: '#f7f8fc', padding: '6px 10px', borderRadius: 8, border: '1px solid #e8e9f0', wordBreak: 'break-all' }}>{share}</code> : <span style={{ fontSize: 13, color: '#8a5a00', background: '#fff7e6', border: '1px solid #ffd591', padding: '6px 10px', borderRadius: 8 }}>{T.status === 'archived' ? '已下架，候选人打不开；需要再开就重新发布' : '待发布：先预览做题台、哪里不对让 AI 改，确认后点「发布」，候选人才能做'}</span>}
          <Space style={{ marginLeft: 'auto' }}>
            <Button onClick={() => window.open(`/work/${token}?k=${encodeURIComponent(k)}`, '_blank')}>预览做题台</Button>
            {T.status === 'published' ? <><Button type="primary" onClick={() => { navigator.clipboard.writeText(share); message.success('参与链接已复制，发给候选人就能做'); }}>复制参与链接</Button><Button onClick={() => setStatus('archived')}>下架</Button></> : <Button type="primary" onClick={() => setStatus('published')}>发布</Button>}
            <Button onClick={rerun} loading={busy}>重跑 AI 基线</Button>
            <GenericCompare token={token} ownerKey={k} task={T} />
          </Space>
        </div>
        {/* 对题提意见：AI 按意见修订，没提到的不动；改完基线作废 */}
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
          <div data-tour="revise" style={{ fontWeight: 700, marginBottom: 6 }}>这道题哪里不对？说一句，按你的意见改</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Input.TextArea value={fb} onChange={e => setFb(e.target.value)} placeholder="比如：缺口补位那条标准太宽，要求按月给出具体调拨量；材料 m3 的良率改成 78%；时间压到 60 分钟；去掉邮件这个交付物" autoSize={{ minRows: 2, maxRows: 5 }} style={{ flex: 1, minWidth: 320 }} />
            <Button type="primary" loading={revising} onClick={revise} disabled={!fb.trim()}>按意见修订（约 1 分钟）</Button>
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>没提到的部分原样保留；改完 AI 基线作废，记得重跑。{T.task?.revisions?.length ? `已修订 ${T.task.revisions.length} 次。` : ''}{!T.baseline ? ' 现在没有基线。' : ''}</div>
          {!!T.task?.revisions?.length && <div style={{ marginTop: 10, fontSize: 12.5, color: '#444', background: '#fafbff', border: '1px solid #e8e9f0', borderRadius: 10, padding: '8px 12px' }}><b>修订记录</b>{T.task.revisions.slice(-3).reverse().map((r: any, i: number) => <div key={i} style={{ marginTop: 4 }}><span style={{ color: '#999' }}>{String(r.at).slice(5, 16).replace('T', ' ')}</span> · 意见：{r.feedback} <span style={{ color: '#6055f5' }}>→ {r.changelog}</span></div>)}</div>}
        </div>
        <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '8px 18px 18px' }}>
          <div data-tour="detail"><WorkTaskDetail task={T} sessions={d.sessions} shareLink={share} notes={T.notes} defaultTab={d.sessions.length ? 's' : 'p'} ownerKey={k} /></div>
        </div>
      </div>
    </div>
  );
}
