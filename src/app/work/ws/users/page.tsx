'use client';

/**
 * 真活工作台 · 用户管理（管理员、百业管理员可见）：百业账号列表，开账号、重置密码、删账号；管理员还能在百业用户 / 百业管理员之间切。
 * 开账号和重置都给一个临时密码（可自动生成），对方第一次登录先改密码。全平台的账号（同事、管理员）在 /admin/system-users。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { App, ConfigProvider } from 'antd';
import { Empty, Head } from '../ui';
import { when } from '../ask';

const ROLE: Record<string, string> = { baiye_user: '百业用户', baiye_admin: '百业管理员' };
const genPw = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(10)); for (const x of r) s += a[x % a.length]; return /\d/.test(s) ? s : s.slice(0, 9) + '7'; };

export default function Page() { return <ConfigProvider theme={{ token: { colorPrimary: '#5148d6', borderRadius: 10 } }}><App><Users /></App></ConfigProvider>; }

function Users() {
  const { message, modal } = App.useApp();
  const [d, setD] = useState<{ me: { id: string; role: string }; users: any[] } | null>(null); const [err, setErr] = useState('');
  const [kw, setKw] = useState('');
  const [add, setAdd] = useState<{ email: string; password: string; role: string } | null>(null); const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const load = useCallback(() => fetch('/api/admin/work/users', { cache: 'no-store' }).then(r => r.json()).then(j => { if (j.ok) setD(j); else setErr(j.error); }).catch(() => setErr('没读到')), []);
  useEffect(() => { load(); }, [load]);
  const isAdmin = d?.me.role === 'admin';
  const call = async (method: string, body?: any, q = '') => { const j = await (await fetch(`/api/admin/work/users${q}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json().catch(() => ({ ok: false, error: '网络错误' })); if (!j.ok) message.error(j.error); return j.ok; };
  const create = async () => {
    if (!add) return; setBusy(true);
    if (await call('POST', add)) { setShown({ email: add.email, password: add.password }); setAdd(null); load(); }
    setBusy(false);
  };
  const reset = (u: any) => modal.confirm({ title: `重置 ${u.email} 的密码？`, content: '会生成一个临时密码，对方用它登录后要先改密码。', okText: '重置', cancelText: '取消', onOk: async () => { const pw = genPw(); if (await call('PATCH', { id: u.id, password: pw })) { setShown({ email: u.email, password: pw }); load(); } } });
  const del = (u: any) => modal.confirm({ title: `删除账号 ${u.email}？`, content: '删了就登录不了，不能恢复。他出过的题和做过的记录不受影响。', okText: '删除', okButtonProps: { danger: true }, cancelText: '取消', onOk: async () => { if (await call('DELETE', undefined, `?id=${u.id}`)) { message.success('已删除'); load(); } } });
  const setRole = async (u: any, role: string) => { if (await call('PATCH', { id: u.id, role })) { message.success(`已改成${ROLE[role]}`); load(); } };
  const list = (d?.users || []).filter(u => !kw || u.email.includes(kw.trim().toLowerCase()));
  if (err) return <div className="wws-page"><div className="wws-card"><Empty>{err}</Empty></div></div>;
  return (
    <div className="wws-page">
      <Head eyebrow="PEOPLE" zh="用户管理" en="Accounts for your team"
        lead={<>给合作方开百业账号：能用百业、真活和 workspace，看不到任何数据资产。对方第一次登录要先改密码。{isAdmin && <> 同事和管理员的账号在 <a href="/admin/system-users" target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', fontWeight: 700 }}>全平台用户管理 ↗</a>。</>}</>}
        acts={<button className="wws-btn p" onClick={() => setAdd({ email: '', password: genPw(), role: 'baiye_user' })}>＋ 开账号</button>} />
      {add && <div className="wws-card lined pad" style={{ marginBottom: 14, display: 'grid', gap: 10, maxWidth: 560 }}>
        <div className="wws-card-h" style={{ marginBottom: 0 }}><h2 className="wws-h2">开一个账号<small>New account</small></h2></div>
        <input className="wws-in" autoFocus type="email" placeholder="对方邮箱" value={add.email} onChange={e => setAdd({ ...add, email: e.target.value })} />
        <div style={{ display: 'flex', gap: 8 }}><input className="wws-in" style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }} placeholder="临时密码（至少 8 位）" value={add.password} onChange={e => setAdd({ ...add, password: e.target.value })} /><button className="wws-btn" onClick={() => setAdd({ ...add, password: genPw() })}>换一个</button></div>
        {isAdmin && <select className="wws-in" value={add.role} onChange={e => setAdd({ ...add, role: e.target.value })}><option value="baiye_user">百业用户</option><option value="baiye_admin">百业管理员（也能开百业账号）</option></select>}
        <div style={{ display: 'flex', gap: 8 }}><button className="wws-btn p" disabled={busy || !add.email.trim() || add.password.length < 8} onClick={create}>{busy ? '开…' : '开账号'}</button><button className="wws-btn" onClick={() => setAdd(null)}>取消</button></div>
      </div>}
      {shown && <div className="wws-card pad" style={{ marginBottom: 14, borderColor: '#bfe3cf', background: '#f3fbf6', maxWidth: 560 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>把这两样发给对方（只显示这一次）</div>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 14, lineHeight: 1.9 }}>登录：{typeof location !== 'undefined' ? location.origin : ''}/work<br />邮箱：{shown.email}<br />临时密码：{shown.password}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="wws-btn" onClick={async () => { await navigator.clipboard.writeText(`登录：${location.origin}/work\n邮箱：${shown.email}\n临时密码：${shown.password}\n（第一次登录要先改密码）`); message.success('已复制'); }}>复制</button>
          <button className="wws-btn" onClick={() => setShown(null)}>收起</button>
        </div>
      </div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <input className="wws-in" value={kw} onChange={e => setKw(e.target.value)} placeholder="搜邮箱" style={{ minWidth: 240 }} />
        <span className="wws-muted" style={{ marginLeft: 'auto' }}>{d ? `${list.length} 个账号` : ''}</span>
      </div>
      <div className="wws-card" style={{ overflowX: 'auto' }}>
        <table className="wws-table t-users">
          <thead><tr>{[['EMAIL', '邮箱'], ['ROLE', '身份'], ['STATUS', '状态'], ['CREATED', '开通时间'], ['', '']].map(([e, z], i) => <th key={i}>{e}<small>{z}</small></th>)}</tr></thead>
          <tbody>
            {!d && <tr><td colSpan={5} className="wws-muted">读取中…</td></tr>}
            {d && !list.length && <tr><td colSpan={5}><Empty>{d.users.length ? '没有符合的。' : '还没有百业账号。点右上「＋ 开账号」。'}</Empty></td></tr>}
            {list.map(u => <tr key={u.id}>
              <td><b>{u.email}</b>{u.id === d?.me.id && <span className="wws-tag acc" style={{ marginLeft: 8 }}>我</span>}</td>
              <td>{isAdmin && u.editable
                ? <select className="wws-in" style={{ padding: '4px 8px' }} value={u.role} onChange={e => setRole(u, e.target.value)}><option value="baiye_user">百业用户</option><option value="baiye_admin">百业管理员</option></select>
                : <span className={`wws-tag ${u.role === 'baiye_admin' ? 'acc' : 'mute'}`}>{ROLE[u.role] || u.role}</span>}</td>
              <td>{u.must_change_password ? <span className="wws-tag warn">等他改密码</span> : <span className="wws-tag ok">正常</span>}</td>
              <td className="wws-muted" style={{ whiteSpace: 'nowrap' }}>{when(u.created_at)}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{u.editable && <>
                <button className="wws-back" style={lnk} onClick={() => reset(u)}>重置密码</button>
                <button style={{ ...lnk, color: '#b42318' }} onClick={() => del(u)}>删除</button>
              </>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const lnk: React.CSSProperties = { border: 0, background: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: 13, marginLeft: 12, padding: 0 };
