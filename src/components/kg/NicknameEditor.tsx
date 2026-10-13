'use client';

/** 给自家数字职人起名字：小铅笔 → 输入框（回车保存，清空 = 用回原名）。名字只给本人看 */
import React, { useState } from 'react';

export function NicknameEditor({ value, original, onSave, dark = false }: { value: string; original: string; onSave: (n: string) => Promise<any>; dark?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try { await onSave(v.trim()); setEditing(false); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const ink = dark ? 'rgba(255,255,255,.75)' : '#6055f5';
  if (!editing) return (
    <button onClick={() => { setV(value); setEditing(true); }} title="给 TA 起个名字（只有你看得到）"
      style={{ border: 0, background: dark ? 'rgba(255,255,255,.1)' : 'rgba(96,85,245,.08)', color: ink, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: 0 }}>
      ✎ {value ? '改名字' : '给 TA 起个名字'}
    </button>
  );
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 400, letterSpacing: 0 }}>
      <input autoFocus value={v} maxLength={16} disabled={busy} onChange={e => setV(e.target.value)} placeholder={`叫 TA 什么？（原名 ${original}）`}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) save(); if (e.key === 'Escape') setEditing(false); }}
        style={{ width: 190, border: `1px solid ${dark ? 'rgba(255,255,255,.3)' : '#d9dbe8'}`, background: dark ? 'rgba(0,0,0,.3)' : '#fff', color: dark ? '#fff' : '#1f2233', borderRadius: 8, padding: '6px 9px', fontSize: 14, outline: 'none' }} />
      <button onClick={save} disabled={busy} style={{ border: 0, background: '#6055f5', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}>{busy ? '…' : '好'}</button>
      <button onClick={() => setEditing(false)} style={{ border: 0, background: 'transparent', color: dark ? 'rgba(255,255,255,.6)' : '#8a8fa3', fontSize: 13, cursor: 'pointer' }}>取消</button>
      {err && <span style={{ color: '#dc2626', fontSize: 12 }}>{err}</span>}
    </span>
  );
}
