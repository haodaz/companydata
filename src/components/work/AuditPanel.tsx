'use client';

/**
 * 「AI 审计中」：交卷后一段一段推进，笔记追加着出现，像有个审计员在边看边记。
 * 自己驱动：每 1.2 秒 POST 一次 /audit（服务端一次只推进一段，重复请求会被挡住），done 后把正式报告交回去。
 * 也用于出题人那边刷新查看（readonly：只 GET 不推进）。
 */
import React, { useEffect, useRef, useState } from 'react';

type Obs = { t: number; skill: string; signal: 'high' | 'risk' | 'neutral'; note: string; evidence: string };
type Seg = { idx: number; from: number; to: number; label: string; observations: Obs[]; so_far: string; dims: Record<string, string>; tentative: number };
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const LV: Record<string, string> = { L1: '#c9ccd6', L2: '#ffd166', L3: '#3ddc97', L4: '#12a150' };
const SIG: Record<string, { c: string; t: string }> = { high: { c: '#12a150', t: '高光' }, risk: { c: '#c0392b', t: '风险' }, neutral: { c: '#6b6f86', t: '观察' } };

export function AuditPanel({ token, sid, readonly, onDone }: { token: string; sid: string; readonly?: boolean; onDone?: (report: any) => void }) {
  const [st, setSt] = useState<{ stage: number; total: number; audit: Seg[]; running: boolean }>({ stage: 0, total: 0, audit: [], running: false });
  const [err, setErr] = useState(''); const [finalizing, setFinalizing] = useState(false);
  const stop = useRef(false);
  useEffect(() => {
    stop.current = false;
    (async () => {
      while (!stop.current) {
        try {
          const j = await (await fetch(`/api/work/${token}/sessions/${sid}/audit`, { method: readonly ? 'GET' : 'POST' })).json();
          if (!j.ok) { setErr(j.error || '审计出错了，重试中…'); await new Promise(r => setTimeout(r, 4000)); continue; }
          setErr('');
          if (j.done) { onDone?.(j.report); return; }
          setSt({ stage: j.stage, total: j.total, audit: j.audit, running: j.running });
          if (j.stage >= j.total) setFinalizing(true);
        } catch { setErr('网络不稳，重试中…'); }
        await new Promise(r => setTimeout(r, readonly ? 5000 : 1200));
      }
    })();
    return () => { stop.current = true; };
  }, [token, sid, readonly, onDone]);

  const last = st.audit[st.audit.length - 1];
  const pct = st.total ? Math.round((st.stage / (st.total + 1)) * 100) : 0;
  return (
    <div style={{ display: 'grid', gap: 14, fontSize: 14, color: '#1a1a2e' }}>
      <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6055f5', boxShadow: '0 0 0 6px rgba(96,85,245,.18)', animation: 'wkpulse 1.4s ease-in-out infinite' }} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>{finalizing ? 'AI 审计中 · 逐条核对交付物、和基线比' : st.total ? `AI 审计中 · 看过程 第 ${Math.min(st.stage + 1, st.total)} / ${st.total} 段` : 'AI 审计中 · 准备'}</div>
          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#6b6f86' }}>{last ? `到 ${fmt(last.to)} 为止的过程信号 ` : ''}{last && <b style={{ color: '#6055f5', fontSize: 16 }}>{last.tentative}</b>}{last && <span style={{ color: '#aaa' }}>（暂定）</span>}</div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: '#eef0f6', marginTop: 12, overflow: 'hidden', display: 'flex', gap: 2 }}>
          {Array.from({ length: (st.total || 3) + 1 }).map((_, i) => <div key={i} style={{ flex: i === (st.total || 3) ? 1.6 : 1, background: i < st.stage ? '#6055f5' : i === st.stage ? 'linear-gradient(90deg,#6055f5,#c9c4ff)' : '#e2e4ee', transition: 'background .4s' }} />)}
        </div>
        <div style={{ fontSize: 12, color: '#8a8fa8', marginTop: 6 }}>过程分 {st.total || '…'} 段看，每段追加观察；最后一段结束再逐条核对结果、和 AI 基线比。进度 {pct}%</div>
        {last && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{Object.entries(last.dims).map(([k, v]) => <span key={k} style={{ fontSize: 12, padding: '2px 9px', borderRadius: 999, background: '#fafbff', border: `1px solid ${LV[v]}`, color: '#3b405a' }}>{k} <b style={{ color: v === 'L1' ? '#999' : LV[v] }}>{v}</b></span>)}<span style={{ fontSize: 12, color: '#aaa', alignSelf: 'center' }}>暂定，会随后面的段变</span></div>}
        {err && <div style={{ color: '#c0392b', fontSize: 13, marginTop: 8 }}>{err}</div>}
      </div>
      {st.audit.map(seg => <Segment key={seg.idx} seg={seg} />)}
      {!finalizing && st.total > 0 && st.stage < st.total && <div style={{ padding: '12px 18px', border: '1px dashed #d9dbe6', borderRadius: 14, color: '#8a8fa8', fontSize: 13 }}>正在看 {st.audit.length ? fmt(last!.to) : '00:00'} 之后的操作……</div>}
      <style>{`@keyframes wkpulse { 0%,100% { box-shadow: 0 0 0 4px rgba(96,85,245,.18) } 50% { box-shadow: 0 0 0 9px rgba(96,85,245,.06) } } @keyframes wkin { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}

export function Segment({ seg, compact }: { seg: Seg; compact?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: compact ? '10px 14px' : '14px 18px', animation: 'wkin .5s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: '#6055f5', fontWeight: 800 }}>第 {seg.idx + 1} 段</span>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#6b6f86', fontSize: 12.5 }}>{fmt(seg.from)}–{fmt(seg.to)}</span>
        <b>{seg.label}</b>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8a8fa8' }}>过程信号 {seg.tentative}</span>
      </div>
      {seg.observations.length ? seg.observations.map((o, i) => <div key={i} style={{ padding: '7px 0', borderTop: i ? '1px solid #f3f3f7' : 0, marginTop: i ? 0 : 6, lineHeight: 1.6 }}>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: SIG[o.signal].c, fontWeight: 800 }}>{fmt(o.t)}</span>
        <span style={{ marginLeft: 8, fontSize: 11.5, padding: '1px 7px', borderRadius: 999, background: o.signal === 'high' ? '#dcf5e7' : o.signal === 'risk' ? '#ffe3e0' : '#eef0f6', color: SIG[o.signal].c }}>{SIG[o.signal].t}</span>
        <span style={{ marginLeft: 6, fontSize: 12, color: '#8a8fa8' }}>{o.skill}</span>
        <div style={{ color: '#2a2e45' }}>{o.note}</div>
        {o.evidence && <div style={{ fontSize: 12, color: '#8a8fa8' }}>证据：{o.evidence}</div>}
      </div>) : <div style={{ color: '#aaa', fontSize: 13, marginTop: 6 }}>这段没什么值得记的</div>}
      <div style={{ marginTop: 8, fontSize: 13, color: '#4a4f66', borderLeft: '3px solid #e2e4ee', paddingLeft: 10 }}>到这里为止：{seg.so_far}</div>
    </div>
  );
}
