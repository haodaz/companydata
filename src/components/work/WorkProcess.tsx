'use client';

/**
 * 真活台 · 答题历程（2026-11-04，潜历反馈「想看原始答题内容、上传的附件，和整个做题过程」）：
 *   交付文件（候选人上传的原文件，可下载）+ 时间轴（像会议记录一样，每个时间点做了什么）。
 *   颗粒度：打开材料 / 切交付物 / 问 AI（问答原文）/ 采纳 / 粘贴 / 上传 / 录屏画面 / 离开 / 交卷各一条；
 *   连续改稿合成一条「写作 +N 字」；每 3 分钟一份稿子快照，点开看那一刻写成什么样。
 *   出题人「看报告」抽屉和报告页共用；数据来自 GET /api/work/<token>/sessions/<sid>?full=1（交卷后才给）。
 */
import React, { useMemo, useState } from 'react';

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
type Ev = { t: number; type: string; [k: string]: any };
type Chat = { t: number; q: string; a: string };
type Row = { t: number; to?: number; kind: string; color: string; label: string; body?: React.ReactNode; detail?: string; link?: { href: string; text: string } };

const C = { mat: '#12b5cb', ai: '#6055f5', write: '#16a34a', paste: '#f59e0b', file: '#0ea5e9', away: '#b0b4c6', draft: '#8b5cf6', end: '#1a1a2e', screen: '#64748b' };
const FILTERS: [string, string][] = [['all', '全部'], ['ai', '问 AI'], ['mat', '材料与文件'], ['draft', '稿子快照']];

export function WorkProcess({ events, aiChat, materials, deliverables }: { events: Ev[]; aiChat: Chat[]; materials?: { id: string; title: string }[]; deliverables?: { id: string; title: string }[] }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const matName = (id: string) => materials?.find(m => m.id === id)?.title || '';
  const partName = (id: string) => deliverables?.find(d => d.id === id)?.title || id;
  const files = events.filter(e => e.type === 'file' && e.url);
  const recs = events.filter(e => e.type === 'recording' && e.url);

  const rows = useMemo(() => {
    const ev = [...events].sort((a, b) => a.t - b.t);
    const out: Row[] = [];
    const hasChat = aiChat.length > 0;
    for (const e of ev) {
      const last = out[out.length - 1];
      switch (e.type) {
        case 'start': out.push({ t: e.t, kind: 'end', color: C.end, label: '开始作答' }); break;
        case 'open_material': if (last?.kind === 'mat' && last.label.includes(` ${e.id}`)) break; out.push({ t: e.t, kind: 'mat', color: C.mat, label: `打开材料 ${e.id}${matName(e.id) ? `《${matName(e.id)}》` : ''}` }); break;
        case 'download': out.push({ t: e.t, kind: 'mat', color: C.mat, label: `下载材料 ${e.id}${matName(e.id) ? `《${matName(e.id)}》` : ''}` }); break;
        case 'switch_part': out.push({ t: e.t, kind: 'other', color: C.screen, label: `切到交付物「${partName(e.id)}」` }); break;
        case 'stage_unlock': out.push({ t: e.t, kind: 'other', color: C.screen, label: `解锁第 ${String(e.id).replace(/\D/g, '') || e.id} 步` }); break;
        case 'open_stage': break;
        case 'edit': {
          const d = Number(e.delta) || 0;
          if (last?.kind === 'write' && e.t - (last.to ?? last.t) <= 90) { last.to = e.t; (last as any).plus += Math.max(0, d); (last as any).minus += Math.max(0, -d); }
          else out.push({ t: e.t, to: e.t, kind: 'write', color: C.write, label: '', plus: Math.max(0, d), minus: Math.max(0, -d) } as any);
          break;
        }
        case 'paste': out.push({ t: e.t, kind: 'paste', color: C.paste, label: `粘贴 ${e.chars || 0} 字` }); break;
        case 'adopt': out.push({ t: e.t, kind: 'ai', color: C.ai, label: `把 AI 的回答采纳进稿子（${e.chars || 0} 字）` }); break;
        case 'ai_ask': if (!hasChat) out.push({ t: e.t, kind: 'ai', color: C.ai, label: `问 AI（${e.chars || 0} 字）` }); break;
        case 'idle': out.push({ t: e.t, kind: 'away', color: C.away, label: '两分钟没有操作' }); break;
        case 'leave': out.push({ t: e.t, kind: 'away', color: C.away, label: '离开了作答页（切到别的窗口 / 标签）' }); break;
        case 'file': out.push({ t: e.t, kind: 'mat', color: C.file, label: `上传文件 ${e.name}（${kb(e.size || 0)}）`, link: { href: e.url, text: '下载' } }); break;
        case 'recording': out.push({ t: e.t, kind: 'mat', color: C.file, label: `上传录屏${e.duration ? `（${fmt(e.duration)}）` : ''}`, link: { href: e.url, text: '播放' } }); break;
        case 'rec_start': out.push({ t: e.t, kind: 'other', color: C.screen, label: '开始录屏' }); break;
        case 'rec_stop': out.push({ t: e.t, kind: 'other', color: C.screen, label: '停止录屏' }); break;
        case 'screen': out.push({ t: e.t, kind: 'screen', color: C.screen, label: '录屏画面（AI 看图记的）', body: String(e.note || '') }); break;
        case 'draft': out.push({ t: e.t, kind: 'draft', color: C.draft, label: `稿子快照 · ${e.chars || String(e.text || '').length} 字`, detail: String(e.text || '') }); break;
        case 'next_step': out.push({ t: e.t, kind: 'end', color: C.end, label: '最后一问：如果再给一天，先改哪里', body: String(e.text || '') }); break;
        case 'submit': out.push({ t: e.t, kind: 'end', color: C.end, label: `交卷（交付物 ${e.chars || 0} 字）` }); break;
        default: if (/^plugin_/.test(e.type) || e.note) out.push({ t: e.t, kind: 'other', color: C.screen, label: `${e.type.replace(/^plugin_/, '插件 · ')}${e.host ? ` · ${e.host}` : ''}`, body: e.note ? String(e.note) : undefined });
      }
    }
    for (const c of aiChat) out.push({ t: c.t, kind: 'ai', color: C.ai, label: '问 AI', body: c.q, detail: c.a });
    for (const r of out) if (r.kind === 'write') { const x = r as any; r.label = `写作${r.to && r.to > r.t ? ` ${fmt(r.t)}–${fmt(r.to)}` : ''}：+${x.plus} 字${x.minus ? ` / 删 ${x.minus} 字` : ''}`; }
    return out.filter(r => r.kind !== 'write' || (r as any).plus || (r as any).minus).sort((a, b) => a.t - b.t);
  }, [events, aiChat]); // eslint-disable-line react-hooks/exhaustive-deps

  const real = Math.max(0, ...rows.map(r => r.to ?? r.t)), end = Math.max(60, real);   // end 只用来画总览条
  const shown = rows.filter(r => filter === 'all' || (filter === 'ai' ? r.kind === 'ai' : filter === 'mat' ? r.kind === 'mat' : r.kind === 'draft'));
  const n = (k: string) => rows.filter(r => r.kind === k).length;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {(files.length > 0 || recs.length > 0) && <div style={box}>
        <div style={head}>交付文件（候选人上传的原文件）</div>
        <div style={{ padding: '6px 12px 10px' }}>{[...files, ...recs].map((f, i) => <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: i ? '1px solid #f1f2f6' : 0, fontSize: 13.5 }}>
          <span>{f.type === 'recording' ? '🎬' : '📎'}</span><span style={{ flex: 1, wordBreak: 'break-all' }}>{f.type === 'recording' ? '录屏' : f.name}</span>
          <span style={{ color: '#8a8fa8', fontSize: 12 }}>{fmt(f.t)} · {kb(f.size || 0)}</span>
          <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#6055f5', fontWeight: 700 }}>{f.type === 'recording' ? '播放' : '下载'}</a>
        </div>)}</div>
      </div>}
      <div style={box}>
        <div style={{ ...head, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>答题历程</span><span style={{ fontWeight: 400, color: '#8a8fa8', fontSize: 12 }}>用时 {fmt(real)} · 问 AI {n('ai')} 条 · 材料 / 文件 {n('mat')} 次 · 稿子快照 {n('draft')} 份</span>
          <span style={{ flex: 1 }} />
          {FILTERS.map(([k, t]) => <button key={k} onClick={() => setFilter(k)} style={{ border: '1px solid ' + (filter === k ? '#6055f5' : '#e3e4ec'), background: filter === k ? '#f1efff' : '#fff', color: filter === k ? '#4c43c9' : '#555', borderRadius: 999, padding: '2px 10px', fontSize: 12, cursor: 'pointer' }}>{t}</button>)}
        </div>
        {/* 总览条：每条记录在整段用时上的位置 */}
        <div style={{ position: 'relative', height: 18, margin: '10px 12px 2px', background: '#f4f5f9', borderRadius: 9 }}>
          {rows.map((r, i) => <span key={i} title={`${fmt(r.t)} ${r.label}`} style={{ position: 'absolute', top: 3, left: `calc(${(r.t / end) * 100}% - 2px)`, width: r.to ? `max(4px, ${((r.to - r.t) / end) * 100}%)` : 4, height: 12, borderRadius: 3, background: r.color, opacity: r.kind === 'away' ? .5 : .9 }} />)}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: '#8a8fa8', margin: '0 12px 6px' }}>{[['材料 / 文件', C.mat], ['问 AI', C.ai], ['写作', C.write], ['粘贴', C.paste], ['稿子快照', C.draft], ['离开 / 空闲', C.away]].map(([t, c]) => <span key={t}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: c, marginRight: 4 }} />{t}</span>)}</div>
        <div style={{ maxHeight: 520, overflow: 'auto', padding: '0 12px 10px' }}>
          {!shown.length && <div style={{ color: '#999', fontSize: 13, padding: '10px 0' }}>{rows.length ? '这一类没有记录' : '这次作答没有过程记录（AI 学员，或旧版本作答）'}</div>}
          {shown.map((r, i) => { const k = rows.indexOf(r); const can = !!r.detail; return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '54px 10px 1fr', gap: 8, padding: '7px 0', borderTop: i ? '1px solid #f3f3f7' : 0, fontSize: 13.5, lineHeight: 1.6 }}>
              <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#6b6f86', fontSize: 12.5 }}>{fmt(r.t)}</span>
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, marginTop: 7 }} />
              <div>
                <span style={{ color: r.kind === 'away' ? '#8a8fa8' : '#1a1a2e', fontWeight: r.kind === 'end' ? 700 : 500 }}>{r.label}</span>
                {r.link && <a href={r.link.href} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#6055f5', fontWeight: 700 }}>{r.link.text}</a>}
                {r.body && <div style={{ color: '#2a2e45', whiteSpace: 'pre-wrap', background: r.kind === 'ai' ? '#f6f5ff' : 'transparent', borderRadius: 8, padding: r.kind === 'ai' ? '4px 10px' : 0, marginTop: 2 }}>{r.body}</div>}
                {can && <button onClick={() => setOpen({ ...open, [k]: !open[k] })} style={{ marginTop: 4, border: 0, background: 'none', color: '#6055f5', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>{open[k] ? '收起' : r.kind === 'ai' ? '看 AI 的回答' : '看这一刻的稿子'}</button>}
                {can && open[k] && <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 13, color: '#444', background: '#fafbff', border: '1px solid #ecedf4', borderRadius: 8, padding: '8px 10px', maxHeight: 320, overflow: 'auto' }}>{r.detail}</div>}
              </div>
            </div>); })}
        </div>
      </div>
    </div>
  );
}

const box: React.CSSProperties = { border: '1px solid #e8e9f0', borderRadius: 10, overflow: 'hidden', background: '#fff' };
const head: React.CSSProperties = { padding: '8px 12px', background: '#fafbff', fontWeight: 700, fontSize: 13 };
