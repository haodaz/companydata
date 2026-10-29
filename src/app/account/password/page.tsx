'use client';

/**
 * 设置新密码（2026-10-29）：管理员建的 / 重置过密码的账号，首次登录先到这里（proxy 会把别的页面都送过来，接口也拦住）；
 * 平时想改密码也能直接打开。改完回 next（只认站内路径）。样子照百业的蒙版式登录。
 */
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PasswordPage() { return <Suspense fallback={null}><Inner /></Suspense>; }

function Inner() {
  const sp = useSearchParams();
  const next = sp.get('next') || '';
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => {
      if (!j.success) { window.location.href = `/lab/login?next=${encodeURIComponent('/account/password' + (next ? `?next=${encodeURIComponent(next)}` : ''))}`; return; }
      setMe(j.user);
    }).catch(() => setErr('网络错误'));
  }, [next]);
  const dest = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : me?.role === 'baiye_user' ? '/lab' : '/office';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!f.current || !f.next) return setErr('三栏都要填');
    if (f.next !== f.again) return setErr('两次输入的新密码不一样');
    if (f.next.length < 8 || !/[A-Za-z]/.test(f.next) || !/\d/.test(f.next)) return setErr('新密码至少 8 位，要同时有字母和数字');
    setBusy(true);
    try {
      const j = await (await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: f.current, next: f.next }) })).json();
      if (!j.success) throw new Error(j.error || '没改成');
      setDone(true); setTimeout(() => { window.location.href = dest; }, 1200);
    } catch (e: any) { setErr(e.message || '网络错误'); setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value }));
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16, fontFamily: "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#1a1a2e', overflow: 'auto' }}>
      <div style={{ position: 'absolute', inset: 0, background: '#f5f6ff' }} />
      <div style={{ position: 'absolute', width: 620, height: 620, left: -160, top: -200, borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle, #cfc8ff, transparent 65%)' }} />
      <div style={{ position: 'absolute', width: 560, height: 560, right: -140, top: '8%', borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle, #bdf0f6, transparent 65%)' }} />
      <form onSubmit={submit} style={{ position: 'relative', width: '100%', maxWidth: 400, background: 'rgba(255,255,255,.88)', backdropFilter: 'blur(18px) saturate(1.3)', WebkitBackdropFilter: 'blur(18px) saturate(1.3)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 20, padding: '30px 28px 24px', boxShadow: '0 30px 80px rgba(40,44,90,.16)' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#6b6f86', fontWeight: 700 }}>ACCOUNT · 账号安全</div>
        <div style={{ fontSize: 24, fontWeight: 800, margin: '6px 0 4px' }}>设置新密码</div>
        <div style={{ fontSize: 13.5, color: '#4a4f66', marginBottom: 20, lineHeight: 1.7 }}>
          {me ? <>{me.email}<br /></> : null}第一次登录请换一个只有你自己知道的密码，换好就能继续用。
        </div>
        {done ? <div style={{ padding: '18px 0 8px', fontSize: 15, color: '#0d7a52', fontWeight: 700 }}>改好了，正在带你回去…</div> : <>
          <label style={lab}>当前密码（管理员给你的那个）</label>
          <input type="password" autoComplete="current-password" value={f.current} onChange={set('current')} style={inp} />
          <label style={{ ...lab, marginTop: 12 }}>新密码</label>
          <input type="password" autoComplete="new-password" value={f.next} onChange={set('next')} placeholder="至少 8 位，字母和数字都要有" style={inp} />
          <label style={{ ...lab, marginTop: 12 }}>再输一次新密码</label>
          <input type="password" autoComplete="new-password" value={f.again} onChange={set('again')} style={inp} />
          {err && <div style={{ color: '#c0392b', fontSize: 13, marginTop: 10 }}>{err}</div>}
          <button type="submit" disabled={busy || !me} style={{ marginTop: 20, width: '100%', height: 46, border: 0, borderRadius: 12, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? '保存中…' : '保存新密码'}</button>
        </>}
        <div style={{ fontSize: 12, color: '#8a8fa8', marginTop: 14, textAlign: 'center' }}>忘了当前密码？找管理员重置</div>
      </form>
    </div>
  );
}
const lab: React.CSSProperties = { display: 'block', fontSize: 12.5, color: '#4a4f66', fontWeight: 600, marginBottom: 5 };
const inp: React.CSSProperties = { width: '100%', height: 42, border: '1px solid #d9dbe6', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' };
