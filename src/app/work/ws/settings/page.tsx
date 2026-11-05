'use client';

/**
 * 真活工作台 · 设置（侧栏账号菜单进）：账号（邮箱、角色，只读）/ 修改密码（/api/auth/password）/ 对话默认模型（存本机 localStorage wws-model，首页和新对话都读它）。
 * 账号表 system_users 只有邮箱、密码、角色，显示名等以后要加列再做。
 */
import React, { useEffect, useState } from 'react';
import { MODELS } from '@/components/work/ChatKit';
import { Head } from '../ui';
import { MODEL_KEY, savedModel } from '../ask';

const ROLE: Record<string, string> = { admin: '管理员', user: '同事', baiye_user: '百业用户' };

export default function SettingsPage() {
  const [me, setMe] = useState<{ email?: string; role?: string } | null>(null);
  const [model, setModel] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', again: '' }); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(j => setMe(j.user || null)).catch(() => {}); setModel(savedModel()); }, []);
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (pw.next !== pw.again) { setMsg({ ok: false, t: '两次输入的新密码不一样' }); return; }
    setBusy(true);
    const j = await (await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: pw.current, next: pw.next }) })).json().catch(() => ({ success: false, error: '网络错误' }));
    setBusy(false);
    if (j.success) { setPw({ current: '', next: '', again: '' }); setMsg({ ok: true, t: '密码改好了，下次用新密码登录' }); } else setMsg({ ok: false, t: j.error || '没改成' });
  };
  return (
    <div className="wws-page" style={{ maxWidth: 760 }}>
      <Head eyebrow="SETTINGS" zh="设置" en="Your account and preferences" />
      <section className="wws-card lined pad" style={{ marginBottom: 14 }}>
        <div className="wws-card-h"><h2 className="wws-h2">账号<small>Account</small></h2></div>
        <div style={row}><span style={k}>邮箱</span><b>{me?.email || '…'}</b></div>
        <div style={row}><span style={k}>身份</span><span>{me?.role ? ROLE[me.role] || me.role : '…'}</span></div>
      </section>
      <section className="wws-card lined pad" style={{ marginBottom: 14 }}>
        <div className="wws-card-h"><h2 className="wws-h2">修改密码<small>Password</small></h2></div>
        <form onSubmit={changePw} style={{ display: 'grid', gap: 10, maxWidth: 380 }}>
          <input className="wws-in" type="password" autoComplete="current-password" placeholder="当前密码" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
          <input className="wws-in" type="password" autoComplete="new-password" placeholder="新密码（至少 8 位，字母加数字）" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} />
          <input className="wws-in" type="password" autoComplete="new-password" placeholder="再输一次新密码" value={pw.again} onChange={e => setPw({ ...pw, again: e.target.value })} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="wws-btn p" disabled={busy || !pw.current || !pw.next}>{busy ? '改…' : '改密码'}</button>
            {msg && <span style={{ fontSize: 13, color: msg.ok ? '#0d7a52' : '#b42318' }}>{msg.t}</span>}
          </div>
        </form>
      </section>
      <section className="wws-card lined pad">
        <div className="wws-card-h"><h2 className="wws-h2">对话默认模型<small>Assistant model</small></h2></div>
        <p className="wws-muted" style={{ margin: '0 0 10px', lineHeight: 1.8 }}>新对话默认用哪个模型；每次对话里也能临时换。只存在这台电脑的浏览器里。</p>
        <select className="wws-in" value={model} onChange={e => { setModel(e.target.value); try { localStorage.setItem(MODEL_KEY, e.target.value); } catch {} }}>
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </section>
    </div>
  );
}

const row: React.CSSProperties = { display: 'flex', gap: 16, padding: '8px 0', borderTop: '1px solid var(--line2)', fontSize: 14 };
const k: React.CSSProperties = { width: 60, color: 'var(--ink3)' };
