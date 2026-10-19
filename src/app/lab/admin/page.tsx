'use client';

/**
 * 百业后台（2026-10-12，用户：「得拆开，咱们最后大概率也会拆开代码」）：百业自己的管理后台，和数据工厂的 /admin 分开。
 * 首页是成本：创造（建空间 / 生一天 / 设计工位）· 使用（考试作答 / 评分 / 问问我）· 学习（老师傅访谈）· 评审 · 美术与 3D，
 * 按环节、按空间、按功能 | 环节、按模型；下面是价目表和明细。其他后台入口（素材库、360 上传、设计文档、母版试玩）在顶部。
 * 数据来自 /api/lab/admin/cost（只算百业的记账，口径见 src/lib/cost/products.ts）。要登录、要管理员。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Select, Table } from 'antd';
import { PricingCard } from '@/components/admin/PricingCard';

const USD_CNY = 7.2;
const STAGES: Record<string, { label: string; hint: string; color: string }> = {
  create: { label: '创造', hint: '建空间 · 生一天 · 设计工位', color: '#6a5cff' },
  use: { label: '使用', hint: '考试作答 · 评分 · 问问我', color: '#12a150' },
  learn: { label: '学习', hint: '老师傅访谈 · 蒸馏技能卡', color: '#ff8a3d' },
  review: { label: 'AI 评审', hint: '按规则给一整天打分', color: '#d6336c' },
  media: { label: '美术与 3D', hint: '出图 · 视频 · 全景识别', color: '#12b5cb' },
};
const LINKS: [string, string][] = [['/lab/admin', '成本'], ['/lab/admin/handover', '交接包'], ['/lab/assets', '素材库'], ['/lab/studio/pano', '360° 上传'], ['/lab/logic', '设计文档'], ['/lab/spaces', '百业工厂']];

export default function LabAdminPage() {
  const [days, setDays] = useState(30);
  const [cny, setCny] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);   // 统计要翻页拉全量、慢：只认最新那次请求
  const load = useCallback(async () => {
    const my = ++seq.current; setLoading(true); setErr('');
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '30', ...(days ? { days: String(days) } : {}) });
      const j = await (await fetch(`/api/lab/admin/cost?${q}`, { cache: 'no-store' })).json();
      if (my !== seq.current) return;
      if (!j.ok) throw new Error(j.error || '加载失败');
      setData(j);
    } catch (e: any) { if (my === seq.current) setErr(e.message); }
    finally { if (my === seq.current) setLoading(false); }
  }, [days, page]);
  useEffect(() => { load(); }, [load]);

  const money = (usd: number) => cny ? `¥${(usd * USD_CNY).toFixed(usd * USD_CNY < 1 ? 3 : 2)}` : `$${usd.toFixed(usd < 1 ? 4 : 2)}`;
  const tok = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);
  const s = data?.stats;
  const stages = Object.entries(s?.stage_stats || {}) as [string, any][];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>百业后台</h1>
        <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {LINKS.map(([href, t]) => <Link key={href} href={href} className={`lab-chip${href === '/lab/admin' ? '' : ' g'}`} style={{ textDecoration: 'none' }}>{t}</Link>)}
        </nav>
      </div>
      <p style={{ color: 'var(--ink2)', fontSize: 14, margin: '0 0 20px' }}>AI 百业从创造到使用全过程的 AI 成本：每一笔记到空间、章节、环节上。数据工厂（挖公司数据）的花费在它自己的后台，不算在这里。</p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Select size="small" value={days} style={{ width: 120 }} onChange={v => { setDays(v); setPage(1); }} options={[{ value: 7, label: '最近 7 天' }, { value: 30, label: '最近 30 天' }, { value: 90, label: '最近 90 天' }, { value: 0, label: '全部' }]} />
        <button className="lab-btn ghost sm" onClick={() => setCny(v => !v)}>{cny ? '¥ 人民币' : '$ 美元'}</button>
        <button className="lab-btn ghost sm" onClick={load} disabled={loading}>{loading ? '统计中…' : '刷新'}</button>
        {err && <span style={{ color: '#d6336c', fontSize: 13 }}>{err}</span>}
      </div>

      {s && <>
        {/* 总数 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[['总花费', money(s.total_cost_usd)], ['调用次数', s.total_tasks.toLocaleString()], ['Token', tok(s.total_tokens)], ['联网搜索', `${s.total_search_calls} 次 · ${money(s.total_search_cost_usd)}`]].map(([k, v]) => (
            <div key={k} className="lab-card" style={{ padding: '14px 16px' }}><div className="lab-cap">{k}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{v}</div></div>
          ))}
        </div>

        {/* 按流程环节 */}
        <div className="lab-card" style={{ padding: 16, marginBottom: 16 }}>
          <b>钱花在哪个环节</b>
          {!s.attribution_ready ? <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '8px 0 0' }}>按环节 / 按空间要先在 Supabase 跑迁移 <code>021_cost_attribution.sql</code>；跑之前的记录没有归属，之后的调用会自动带上。</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 10 }}>
              {Object.keys(STAGES).concat(stages.map(([k]) => k).filter(k => !STAGES[k])).map(k => {
                const v = s.stage_stats?.[k], c = STAGES[k] || { label: k, hint: '', color: '#8389a6' };
                return (
                  <div key={k} style={{ padding: '10px 12px', borderRadius: 12, borderLeft: `4px solid ${c.color}`, background: 'rgba(106,92,255,.04)' }}>
                    <div style={{ fontWeight: 800 }}>{c.label} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink3)' }}>{c.hint}</span></div>
                    <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>{v ? <>{v.count} 次{v.units ? ` · ${v.units} 件` : ''} · <b style={{ color: c.color }}>{money(v.cost)}</b></> : '—'}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 按空间 */}
        {!!s.space_stats?.length && (
          <div className="lab-card" style={{ padding: 16, marginBottom: 16 }}>
            <b>按空间（花得最多的 30 个）</b>
            <Table size="small" rowKey="space_id" pagination={false} style={{ marginTop: 10 }} dataSource={s.space_stats} scroll={{ x: 760 }}
              columns={[
                { title: '空间', dataIndex: 'title', render: (t: string, r: any) => <Link href={`/lab/${r.space_id}`}>{t}</Link> },
                ...Object.keys(STAGES).map(k => ({ title: STAGES[k].label, key: k, width: 90, render: (_: any, r: any) => r.byStage?.[k] ? money(r.byStage[k]) : '—' })),
                { title: '合计', dataIndex: 'cost', width: 100, render: (v: number) => <b>{money(v)}</b> },
              ]} />
          </div>
        )}

        {/* 按功能 | 环节 + 按模型 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
          <div className="lab-card" style={{ padding: 16 }}>
            <b>按功能 | 环节</b>
            <Table size="small" rowKey="key" pagination={{ pageSize: 12, size: 'small' }} style={{ marginTop: 10 }} dataSource={s.task_stats}
              columns={[{ title: '功能 | 环节', dataIndex: 'key' }, { title: '次数', dataIndex: 'count', width: 70 }, { title: 'Token', dataIndex: 'tokens', width: 90, render: tok }, { title: '花费', dataIndex: 'cost', width: 90, render: money }]} />
          </div>
          <div className="lab-card" style={{ padding: 16 }}>
            <b>按模型</b>
            {Object.entries(s.model_stats || {}).sort(([, a]: any, [, b]: any) => b.cost - a.cost).map(([m, v]: any) => (
              <div key={m} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <span className="lab-mono" style={{ letterSpacing: 0 }}>{m}</span><span style={{ color: 'var(--ink2)' }}>{v.count} 次 · <b>{money(v.cost)}</b></span>
              </div>
            ))}
          </div>
        </div>
      </>}

      <PricingCard />

      {data && (
        <div className="lab-card" style={{ padding: 16 }}>
          <b>明细</b>
          <Table size="small" rowKey={(r: any) => `${r.id}-${r.created_at}`} loading={loading} dataSource={data.logs} scroll={{ x: 900 }} style={{ marginTop: 10 }}
            pagination={{ current: page, pageSize: 30, total: data.total, size: 'small', onChange: setPage, showSizeChanger: false }}
            columns={[
              { title: '时间', dataIndex: 'created_at', width: 140, render: (v: string) => new Date(v).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) },
              { title: '功能', dataIndex: 'tool_name', width: 90 },
              { title: '环节', dataIndex: 'task_name' },
              { title: '归属', key: 'attr', width: 120, render: (_: any, r: any) => r.stage ? `${STAGES[r.stage]?.label || r.stage}${r.space_id ? ' · 空间' : ''}` : '—' },
              { title: '模型', dataIndex: 'model_id', width: 150 },
              { title: 'Token', dataIndex: 'total_tokens', width: 80, render: tok },
              { title: '花费', dataIndex: 'total_cost_usd', width: 90, render: money },
            ]} />
        </div>
      )}
    </div>
  );
}
