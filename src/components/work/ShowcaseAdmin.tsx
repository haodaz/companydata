'use client';

/**
 * 真活后台 · 任务库上架（2026-10-28）：任务库自己长——题目资产库里的好题（AI 基线 ≥ 70、已发布）列成候选，
 * 点「去头」让 AI 写成去掉企业名的展示题面，管理员看一眼（可改）再上架。人工整理的 25 道在 showcase.json，不在这里管。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, Input, Space, Tag, Typography } from 'antd';

const { Text } = Typography;
type Cand = { task_id: string; company_name: string; industry: string | null; role: string; title: string; signals: any; rating: number | null };

export function ShowcaseAdmin() {
  const { message } = App.useApp();
  const [d, setD] = useState<{ candidates: Cand[]; drafts: any[]; live: any[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [edit, setEdit] = useState<Record<string, any>>({});
  const load = useCallback(async () => {
    const j = await (await fetch('/api/admin/work/showcase', { cache: 'no-store' })).json();
    if (j.ok) { setD(j); setErr(''); } else setErr(j.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const deid = async (c: Cand) => {
    setBusy(c.task_id);
    try { const j = await (await fetch('/api/admin/work/showcase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: c.task_id }) })).json(); if (!j.ok) throw new Error(j.error); if (j.item.leak) message.warning('题面里可能还带着原企业名，上架前看一下', 6); else message.success('去好头了，看一眼再上架'); await load(); }
    catch (e: any) { message.error(e.message); } finally { setBusy(''); }
  };
  const save = async (id: string, patch: Record<string, any>) => {
    setBusy(id);
    try { const j = await (await fetch('/api/admin/work/showcase', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })).json(); if (!j.ok) throw new Error(j.error); message.success(patch.status === 'live' ? '已上架，任务库里看得到了' : patch.status === 'hidden' ? '不上了' : '已保存'); await load(); }
    catch (e: any) { message.error(e.message); } finally { setBusy(''); }
  };
  if (err) return <div style={{ padding: 16, color: '#b42318' }}>{err}</div>;
  if (!d) return <div style={{ padding: 16, color: '#999' }}>读取中…</div>;
  const drafts = d.drafts.filter(x => x.status === 'draft');
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7 }}>任务库自己长：题目资产库里 AI 基线 70 分以上、已发布的任务列成候选。点「去头」由 AI 去掉企业名、写好展示题面，看一眼没问题就上架。人工整理的 25 道不在这里。</div>
      {!!drafts.length && <section>
        <h4 style={{ margin: '0 0 8px' }}>待看 · {drafts.length}</h4>
        <div style={{ display: 'grid', gap: 12 }}>{drafts.map((x: any) => { const e = edit[x.id] || {}; return (
          <DraftCard key={x.id} x={x} busy={busy === x.id} e={e} setE={v => setEdit(s => ({ ...s, [x.id]: { ...e, ...v } }))} onSave={() => save(x.id, e)} onLive={() => save(x.id, { ...e, status: 'live' })} onHide={() => save(x.id, { status: 'hidden' })} />
        ); })}</div>
      </section>}
      <section>
        <h4 style={{ margin: '0 0 8px' }}>候选 · {d.candidates.length}</h4>
        {!d.candidates.length ? <Empty description="还没有够格的候选（AI 基线 ≥ 70 的已发布任务）" /> : <div style={{ display: 'grid', gap: 8 }}>{d.candidates.map(c => (
          <div key={c.task_id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', border: '1px solid #e8e9f0', borderRadius: 10, background: '#fff' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{c.title}</div>
              <Text type="secondary" style={{ fontSize: 12.5 }}>{c.company_name} · {c.role}{c.industry ? ` · ${c.industry}` : ''}</Text>
            </div>
            <Space size={4} wrap>
              <Tag color="purple">基线 {c.signals?.baseline_total ?? '—'}</Tag>
              {!!c.signals?.sessions && <Tag>做过 {c.signals.sessions} 次</Tag>}
              {!!c.signals?.score_spread && <Tag color="green">区分度 {c.signals.score_spread}</Tag>}
              {!!c.rating && <Tag color="gold">{c.rating} 星</Tag>}
            </Space>
            <Button size="small" type="primary" loading={busy === c.task_id} onClick={() => deid(c)}>去头</Button>
          </div>
        ))}</div>}
      </section>
      <section>
        <h4 style={{ margin: '0 0 8px' }}>已上架 · {d.live.length}<Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>（另有人工整理的 25 道）</Text></h4>
        {!d.live.length ? <Text type="secondary">还没有从这里上架的</Text> : <div style={{ display: 'grid', gap: 6 }}>{d.live.map((x: any) => (
          <div key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5 }}><Tag>{x.industry}</Tag><span style={{ flex: 1 }}>{x.title}</span><Button size="small" loading={busy === x.id} onClick={() => save(x.id, { status: 'hidden' })}>下架</Button></div>
        ))}</div>}
      </section>
    </div>
  );
}

/** 待看的一条：标题 / 要找的人 / 背景可改，上架或不上 */
function DraftCard({ x, busy, e, setE, onSave, onLive, onHide }: { x: any; busy: boolean; e: any; setE: (v: any) => void; onSave: () => void; onLive: () => void; onHide: () => void }) {
  const v = (k: string) => (e[k] ?? x?.[k] ?? '');
  return (
    <div style={{ padding: '14px 16px', border: '1px solid #d8d4ff', borderRadius: 12, background: '#faf9ff', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}><Input value={v('industry')} onChange={ev => setE({ industry: ev.target.value })} style={{ width: 130 }} placeholder="行业" /><Input value={v('direction')} onChange={ev => setE({ direction: ev.target.value })} style={{ width: 160 }} placeholder="方向" /><Input value={v('title')} onChange={ev => setE({ title: ev.target.value })} placeholder="标题" /></div>
      <Input value={v('role')} onChange={ev => setE({ role: ev.target.value })} placeholder="要找的人" />
      <Input.TextArea value={v('scenario')} onChange={ev => setE({ scenario: ev.target.value })} autoSize={{ minRows: 3, maxRows: 8 }} placeholder="任务背景（去头）" />
      {!!x?.deliverables?.length && <Text type="secondary" style={{ fontSize: 12.5 }}>交付：{x.deliverables.map((d: any) => `${d.title}（${d.module}）`).join(' / ')}</Text>}
      <Space><Button type="primary" loading={busy} onClick={onLive}>上架</Button><Button loading={busy} onClick={onSave}>保存</Button><Button danger type="text" onClick={onHide}>不上</Button></Space>
    </div>
  );
}
