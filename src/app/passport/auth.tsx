'use client';

/**
 * 人才护照自己的登录页和设置新密码页（不走平台通用的登录页，页面里不露别的产品的痕迹）。
 * 登录复用 /api/auth/login，改密码复用 /api/auth/password；成功后回 next（只认 /passport 下的站内路径，默认 /passport/me）。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cover } from './art';

/** 只认 /passport 下的站内路径，别被拿去做开放跳转，也别跳出护照 */
export const safeNext = (raw: string | null | undefined) => {
  const n = String(raw || '');
  return /^\/passport(\/|$|\?)/.test(n) && !n.startsWith('//') ? n : '/passport/me';
};
const nextFromUrl = () => safeNext(new URLSearchParams(window.location.search).get('next'));

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="tp-root tp-auth">
      <div className="tp-auth-in">
        <div className="tp-auth-brand"><span className="tp-eyebrow">ATA × 平方创想 · 人才护照</span></div>
        <div className="tp-auth-hero" aria-hidden>
          <div className="tp-auth-book"><Cover /><i className="tp-auth-glint" /></div>
        </div>
        <div className="tp-auth-side">
          <h1 className="tp-auth-h">{title}</h1>
          <p className="tp-auth-sub">{sub}</p>
          {children}
        </div>
        <div className="tp-auth-foot">ATA × 平方创想 · TALENT PASSPORT</div>
      </div>
    </div>
  );
}

export function PassportLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!email.trim() || !password) { setErr('邮箱和密码都要填'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) });
      const data = await res.json().catch(() => ({}));
      if (!data.success) { setErr(data.error || '登录没成功，再试一次'); return; }
      const to = nextFromUrl();
      // 管理员开的 / 重置过的账号：先在护照里设一个新密码
      router.replace(data.user?.must_change_password ? `/passport/password?next=${encodeURIComponent(to)}` : to); router.refresh();
    } catch { setErr('网络不太好，再试一次'); } finally { setBusy(false); }
  };
  return (
    <Shell title="打开你的人才护照" sub="真能力、真足迹，都收在这一本里。">
      <form className="tp-card tp-login-form" onSubmit={submit}>
        <label className="tp-field"><span>邮箱</span><input className="tp-input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>
        <label className="tp-field"><span>密码</span><input className="tp-input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="密码" /></label>
        {err && <p className="tp-login-err" role="alert">{err}</p>}
        <button type="submit" className="tp-btn v block" style={{ marginTop: 14 }} disabled={busy}>{busy ? '正在打开…' : '登录'}</button>
        <small className="tp-login-tip">内测中，账号由管理员开通。还没有账号的话，可以先 <Link href="/passport">看看演示</Link>。</small>
      </form>
    </Shell>
  );
}

export function PassportPassword() {
  const router = useRouter();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' }).then(r => r.json()).then(j => {
      if (!j.success) router.replace(`/passport/login?next=${encodeURIComponent(`/passport/password?next=${encodeURIComponent(nextFromUrl())}`)}`);
    }).catch(() => undefined);
  }, [router]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!f.current || !f.next) { setErr('三栏都要填'); return; }
    if (f.next !== f.again) { setErr('两次输入的新密码不一样'); return; }
    if (f.next.length < 8 || !/[A-Za-z]/.test(f.next) || !/\d/.test(f.next)) { setErr('新密码至少 8 位，字母和数字都要有'); return; }
    setBusy(true);
    try {
      const j = await (await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: f.current, next: f.next }) })).json().catch(() => ({}));
      if (!j.success) { setErr(j.error || '没改成，再试一次'); return; }
      router.replace(nextFromUrl()); router.refresh();
    } catch { setErr('网络不太好，再试一次'); } finally { setBusy(false); }
  };
  return (
    <Shell title="先设一个新密码" sub="只有你知道的密码，以后用它打开这本护照。">
      <form className="tp-card tp-login-form" onSubmit={submit}>
        <label className="tp-field"><span>现在的密码</span><input className="tp-input" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} /></label>
        <label className="tp-field"><span>新密码</span><input className="tp-input" type="password" autoComplete="new-password" value={f.next} onChange={set('next')} placeholder="至少 8 位，字母和数字都要有" /></label>
        <label className="tp-field"><span>再输一遍</span><input className="tp-input" type="password" autoComplete="new-password" value={f.again} onChange={set('again')} /></label>
        {err && <p className="tp-login-err" role="alert">{err}</p>}
        <button type="submit" className="tp-btn v block" style={{ marginTop: 14 }} disabled={busy}>{busy ? '正在保存…' : '设好了，进护照'}</button>
      </form>
    </Shell>
  );
}

/** 换个账号：退出当前登录，回护照登录页 */
export function SwitchAccount({ className = 'tp-btn ghost', label = '换个账号登录' }: { className?: string; label?: string }) {
  const router = useRouter();
  return (
    <button type="button" className={className} onClick={async () => {
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* 退不掉也照样去登录页 */ }
      router.replace('/passport/login?next=/passport/me'); router.refresh();
    }}>{label}</button>
  );
}
