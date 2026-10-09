'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App } from 'antd';
import { useUser } from '@/lib/user-context';
import { visitorIds } from '@/lib/lab-cert';
import { CertFolio } from '@/components/lab/CertFolio';

/** 单段证书页夹（证书 · 画作 · 成绩记录 · 图表）。链接公开，就是查验方式；本人可以改证书上的名字 */
export default function CertPage() {
  const { sid } = useParams<{ sid: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const { user, loading } = useUser();
  const [c, setC] = useState<any>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const ids = typeof window !== 'undefined' ? visitorIds(user?.id) : [];

  const load = () => fetch(`/api/lab/cert/${sid}?v=${encodeURIComponent(ids.join(','))}`).then(r => r.json())
    .then(j => { if (j.ok) { setC(j.cert); setName(j.cert.candidate.name); } else setErr(j.error); }).catch(e => setErr(e.message));
  // 等登录状态读完再问：「是不是本人」要用账号编号判断
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) load(); }, [sid, user?.id, loading]);

  const saveName = async () => {
    const j = await fetch(`/api/lab/cert/${sid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, v: ids.join(',') }) }).then(r => r.json());
    if (!j.ok) { message.error(j.error); return; }
    setEditing(false); load(); message.success('证书上的名字改好了');
  };
  const copy = async () => { try { await navigator.clipboard.writeText(window.location.href); message.success('证书链接已复制：别人打开就能查验'); } catch { message.info(window.location.href); } };

  if (err) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: '#d6336c' }}>{err}</div>;
  if (!c) return <div className="lab-glass lab-scan" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>;
  const next = c.chapter && c.chapter.n < c.chapter.total;

  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="lab-mono lab-cap">CERTIFICATE · {c.no}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{c.space.role}的一天{c.chapter && c.chapter.total > 1 ? ` · 第 ${c.chapter.n} / ${c.chapter.total} 段` : ''}</div>
        </div>
        <div style={{ flex: 1 }} />
        {c.mine && (editing
          ? <><input className="lab-input" style={{ width: 180, padding: '7px 10px', fontSize: 14 }} value={name} onChange={e => setName(e.target.value)} placeholder="证书上的名字" /><button className="lab-btn sm" onClick={saveName}>保存</button><button className="lab-btn ghost sm" onClick={() => setEditing(false)}>取消</button></>
          : <button className="lab-btn ghost sm" onClick={() => setEditing(true)}>改证书上的名字</button>)}
        <button className="lab-btn ghost sm" onClick={copy}>复制链接</button>
        <button className="lab-btn ghost sm" onClick={() => window.print()}>打印 / 存 PDF</button>
        <button className="lab-btn ghost sm" onClick={() => router.push('/lab/me')}>我的证书库</button>
        {next && <button className="lab-btn sm" onClick={() => router.push(`/lab/${c.space.id}?m=test`)}>继续这一天 →</button>}
      </div>
      <CertFolio d={c} />
    </div>
  );
}
