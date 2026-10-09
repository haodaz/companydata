'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App } from 'antd';
import { useUser } from '@/lib/user-context';
import { PASS_SCORE, visitorIds } from '@/lib/lab-cert';
import { CertFolio } from '@/components/lab/CertFolio';

/**
 * 证书夹：?s=这个人在这个空间每一段最好的那次作答 &at=先翻到哪一份。
 * 每段成绩都夹在里面；每段都通过才有全天成绩和证书，否则上面写清还差哪几段（没走 / 没通过），一键去做。
 */
function Folder() {
  const sp = useSearchParams();
  const router = useRouter();
  const { message } = App.useApp();
  const { user, loading } = useUser();
  const s = sp.get('s') || '';
  const [f, setF] = useState<any>(null);
  const [err, setErr] = useState('');
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const load = () => fetch(`/api/lab/cert/day?s=${encodeURIComponent(s)}`).then(r => r.json()).then(j => { if (j.ok) { setF(j.folder); setName(j.folder.parts.at(-1)?.candidate?.name || ''); } else setErr(j.error); }).catch(e => setErr(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [s]);
  // 是不是本人（能改名字）：等登录状态读完再问
  useEffect(() => {
    if (loading || !s) return;
    fetch(`/api/lab/cert/${s.split(',')[0]}?v=${encodeURIComponent(visitorIds(user?.id).join(','))}`).then(r => r.json()).then(j => setMine(!!j.cert?.mine)).catch(() => {});
  }, [s, user?.id, loading]);

  const saveName = async () => {
    const v = visitorIds(user?.id).join(',');
    for (const id of s.split(',')) await fetch(`/api/lab/cert/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, v }) });
    setEditing(false); setF(null); load(); message.success('名字改好了');
  };

  if (err) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: '#d6336c' }}>{err}</div>;
  if (!f) return <div className="lab-glass lab-scan" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>;
  const space = f.space;
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="lab-mono lab-cap">{f.complete ? `CERTIFICATE · ${f.day.no}` : 'SCORE FOLDER'}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{space.role}的一天 · {f.complete ? '证书' : '成绩夹'}</div>
        </div>
        <div style={{ flex: 1 }} />
        {mine && (editing
          ? <><input className="lab-input" style={{ width: 180, padding: '7px 10px', fontSize: 14 }} value={name} onChange={e => setName(e.target.value)} placeholder="证书上的名字" /><button className="lab-btn sm" onClick={saveName}>保存</button><button className="lab-btn ghost sm" onClick={() => setEditing(false)}>取消</button></>
          : <button className="lab-btn ghost sm" onClick={() => setEditing(true)}>改名字</button>)}
        <button className="lab-btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); message.success('链接已复制：别人打开就能查验'); } catch { message.info(window.location.href); } }}>复制链接</button>
        <button className="lab-btn ghost sm" onClick={() => window.print()}>打印 / 存 PDF</button>
        <button className="lab-btn ghost sm" onClick={() => router.push('/lab/me')}>我的进度与证书</button>
      </div>

      {!f.complete && (
        <div className="no-print lab-glass" style={{ padding: '14px 18px', display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 14.5 }}><b>还没拿到证书</b><span style={{ color: 'var(--ink3)' }}>：每一段都要 {PASS_SCORE} 分通过。重做一段会刷新那一段的成绩（取最好的一次）。</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {f.todo.map((t: any) => (
              <button key={t.n} className="lab-btn ghost sm" onClick={() => router.push(`/lab/${space.id}?m=test${t.id ? `&ch=${t.id}` : ''}`)}
                style={{ height: 'auto', padding: '8px 12px', gap: 8, boxShadow: t.status === 'fail' ? '0 0 0 1.5px rgba(220,38,38,.45)' : undefined }}>
                <span className="lab-mono" style={{ color: 'var(--v)' }}>{t.slot || `第 ${t.n} 段`}</span>
                <span style={{ color: 'var(--ink)' }}>{t.title}</span>
                <b style={{ color: t.status === 'fail' ? '#c4323a' : 'var(--v)' }}>{t.status === 'fail' ? `${t.score} 分 · 去重做 →` : '还没走 · 去做 →'}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      <CertFolio key={s} f={f} at={sp.get('at')} />
    </div>
  );
}

export default function FolderPage() { return <Suspense><Folder /></Suspense>; }
