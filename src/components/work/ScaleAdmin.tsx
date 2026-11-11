'use client';

/** 全站管理 · 评分方式：给整个平台选一种打分方式（见 lib/work/scale.ts） */
import React, { useEffect, useState } from 'react';
import { SCALES, type ScaleId } from '@/lib/work/scale';
import { forgetWorkScale } from '@/lib/work/scale-client';

export function ScaleAdmin() {
  const [saved, setSaved] = useState<ScaleId | null>(null); const [pick, setPick] = useState<ScaleId | null>(null);
  const [ready, setReady] = useState(true); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/admin/work/scale', { cache: 'no-store' }).then(r => r.json()).then(j => { if (!j.ok) { setMsg(j.error); return; } setSaved(j.scale); setPick(j.scale); setReady(j.ready); }).catch(e => setMsg(e.message)); }, []);
  const save = async () => {
    setBusy(true); setMsg('');
    try { const j = await (await fetch('/api/admin/work/scale', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scale: pick }) })).json(); if (!j.ok) throw new Error(j.error); setSaved(j.scale); forgetWorkScale(); setMsg('已保存，整个平台的报告和成绩单按这个显示。'); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  if (!pick) return <div className="wws-muted">{msg || '读取中…'}</div>;
  return (
    <div style={{ maxWidth: 720 }}>
      <p className="wws-muted" style={{ marginTop: 0 }}>这里选的方式对整个平台的真活生效，出任务的人不用选。切换只改报告、成绩单和排名显示哪部分；三层分数照常算、照常存，切回来都在。</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {SCALES.map(s => <label key={s.id} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${pick === s.id ? '#6055f5' : 'var(--line, #e8e9f0)'}`, background: pick === s.id ? 'rgba(96,85,245,.05)' : 'transparent' }}>
          <input type="radio" name="scale" checked={pick === s.id} onChange={() => setPick(s.id)} style={{ marginTop: 4 }} />
          <span><b>{s.name}</b>{saved === s.id && <span className="wws-muted" style={{ marginLeft: 8, fontSize: 12 }}>现在用的</span>}<div className="wws-muted" style={{ fontSize: 13, marginTop: 2 }}>{s.desc}</div></span>
        </label>)}
      </div>
      {!ready && <p style={{ color: '#b7791f', fontSize: 13 }}>还差迁移 072（work_platform_settings），跑完才能保存；现在按「全看」。</p>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <button className="wws-btn p" disabled={busy || !ready || pick === saved} onClick={save}>{busy ? '保存中…' : '保存'}</button>
        {msg && <span className="wws-muted" style={{ fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}
