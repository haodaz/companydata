'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { bandText, visitorIds } from '@/lib/lab-cert';

/**
 * 体验百业 · 我的：证书库（按职业分组，一天里没走的段是灰色空位，集齐整天能领全天证书）+ 操作历史。
 * 按访客编号找（浏览器本地 + 登录账号），不用注册。
 */
const CSS = `
.me-mini { position: relative; overflow: hidden; border-radius: 14px; padding: 14px 14px 12px; min-height: 108px; display: grid; align-content: space-between; cursor: pointer; transition: transform .2s, box-shadow .2s;
  background: radial-gradient(90% 70% at 0% 0%, rgba(106,92,255,.12), transparent 70%), radial-gradient(80% 70% at 100% 100%, rgba(18,181,203,.12), transparent 70%), #fff;
  box-shadow: 0 0 0 1px rgba(106,92,255,.16), 0 8px 22px rgba(60,50,160,.10); color: var(--ink); text-align: left; border: 0; font-family: inherit; }
.me-mini:hover { transform: translateY(-2px); box-shadow: 0 0 0 1.5px rgba(106,92,255,.5), 0 14px 30px rgba(60,50,160,.16); }
.me-mini::before { content: ''; position: absolute; left: 0; top: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6a5cff, #12b5cb, #ff5fa2); }
.me-mini .bd { font-size: 24px; font-weight: 900; letter-spacing: 0; background: linear-gradient(100deg, #6a5cff, #12b5cb); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.me-mini.empty { background: rgba(255,255,255,.5); box-shadow: none; border: 1.5px dashed rgba(106,92,255,.25); color: var(--ink3); }
.me-mini.empty::before { display: none; }
.me-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 170px), 1fr)); }
.me-day { border: 0; cursor: pointer; font-family: inherit; padding: 10px 16px; border-radius: 12px; font-weight: 800; color: #fff; background: linear-gradient(120deg, #6a5cff, #12b5cb 60%, #ff5fa2); box-shadow: 0 8px 22px rgba(106,92,255,.35); }
`;

const fmt = (iso: string) => new Date(iso).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function MePage() {
  const router = useRouter();
  const { user } = useUser();
  const [d, setD] = useState<{ history: any[]; spaces: any[]; needMigration?: boolean } | null>(null);
  const [tab, setTab] = useState<'certs' | 'history'>('certs');
  // 证书上的名字（只存本地，进操作台时只问过一次；以后在这里改）
  const [me, setMe] = useState({ name: '', note: '', location: '' });
  const [editMe, setEditMe] = useState(false);
  useEffect(() => { try { const r = JSON.parse(localStorage.getItem('lab:rookie') || 'null'); if (r) setMe(m => ({ ...m, ...r })); } catch { /* 读不到 */ } }, []);
  const saveMe = () => { try { localStorage.setItem('lab:rookie', JSON.stringify(me)); localStorage.setItem('lab:rookie:asked', '1'); } catch { /* 记不住 */ } setEditMe(false); };

  useEffect(() => {
    const ids = visitorIds(user?.id);
    fetch(`/api/lab/me?v=${encodeURIComponent(ids.join(','))}`).then(r => r.json()).then(j => setD(j.ok ? j : { history: [], spaces: [] })).catch(() => setD({ history: [], spaces: [] }));
  }, [user?.id]);

  const stats = useMemo(() => {
    const sp = d?.spaces || [];
    return { certs: sp.reduce((a, s) => a + s.done, 0), days: sp.filter(s => s.done === s.total && s.total > 1).length, roles: sp.length };
  }, [d]);

  return (
    <div>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', margin: '6px 0 16px' }}>
        <div>
          <div className="lab-mono lab-cap">EXPERIENCE · 我的</div>
          <h1 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, margin: '2px 0 4px' }}>{stats.certs ? `已收集 ${stats.certs} 张证书` : '我的证书库'}</h1>
          <div style={{ fontSize: 13.5, color: 'var(--ink2)' }}>{stats.roles ? `走过 ${stats.roles} 个职业${stats.days ? `，集齐 ${stats.days} 整天` : ''}。每走完一段领一张，一天集齐还有全天证书。` : '每走完一段就领一张证书，一个职业的一天集齐还有全天证书。'}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="lab-btn ghost sm" onClick={() => router.push('/lab/gallery')}>去体验馆</button>
      </div>
      <div className="lab-glass" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
        <span className="lab-mono lab-cap">证书上的名字</span>
        {editMe ? <>
          <input className="lab-input" style={{ width: 150, padding: '6px 10px', fontSize: 14 }} value={me.name} onChange={e => setMe({ ...me, name: e.target.value })} placeholder="称呼" />
          <input className="lab-input" style={{ width: 170, padding: '6px 10px', fontSize: 14 }} value={me.note} onChange={e => setMe({ ...me, note: e.target.value })} placeholder="学校 / 专业" />
          <input className="lab-input" style={{ width: 130, padding: '6px 10px', fontSize: 14 }} value={me.location} onChange={e => setMe({ ...me, location: e.target.value })} placeholder="所在地" />
          <button className="lab-btn sm" onClick={saveMe}>保存</button>
        </> : <>
          <b>{me.name || '还没填（证书上显示「匿名新兵」）'}</b>
          <span style={{ color: 'var(--ink3)' }}>{[me.note, me.location].filter(Boolean).join(' · ')}</span>
          <button className="lab-btn ghost sm" onClick={() => setEditMe(true)}>修改</button>
          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>以后的证书用这个名字；已经领过的证书在证书页单独改</span>
        </>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className={`lab-tab${tab === 'certs' ? ' on' : ''}`} onClick={() => setTab('certs')}>证书库</button>
        <button className={`lab-tab${tab === 'history' ? ' on' : ''}`} onClick={() => setTab('history')}>操作历史 <span className="lab-mono" style={{ opacity: .7 }}>{d?.history.length || 0}</span></button>
      </div>

      {!d ? <div className="lab-glass lab-scan" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>
        : d.needMigration ? <div className="lab-glass" style={{ padding: 30, color: 'var(--ink3)' }}>还差一步：迁移 017（访客编号）跑完后，这里就能记下你的每一次体验。</div>
        : !d.spaces.length ? (
          <div className="lab-glass" style={{ padding: 44, textAlign: 'center', color: 'var(--ink3)', lineHeight: 2 }}>
            还没有记录。去体验馆挑一个职业，走完一段就能领第一张证书。<br />
            <button className="lab-btn sm" style={{ marginTop: 10 }} onClick={() => router.push('/lab/gallery')}>去体验馆 →</button>
          </div>
        ) : tab === 'certs' ? (
          <div style={{ display: 'grid', gap: 16 }}>
            {d.spaces.map(s => {
              const full = s.done === s.total;
              const ids = s.chapters.map((c: any) => c.best?.id).filter(Boolean);
              return (
                <div key={s.id} className="lab-glass" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    {s.avatar && <img src={s.avatar} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', objectPosition: '54% 10%', border: '2px solid #fff', boxShadow: '0 4px 12px rgba(50,40,120,.15)' }} />}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>{s.role}的一天</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{s.name} · 已集 {s.done} / {s.total} 段</div>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ width: 140, height: 6, borderRadius: 3, background: 'rgba(106,92,255,.12)', overflow: 'hidden' }}><div style={{ width: `${(s.done / s.total) * 100}%`, height: '100%', background: full ? 'linear-gradient(90deg,#6a5cff,#12b5cb,#ff5fa2)' : 'linear-gradient(90deg,var(--v),var(--c))' }} /></div>
                    {full && s.total > 1
                      ? <button className="me-day" onClick={() => router.push(`/lab/cert/day?s=${ids.join(',')}`)}>领取全天证书 ✦</button>
                      : <button className="lab-btn ghost sm" onClick={() => router.push(`/lab/${s.id}?m=test`)}>继续这一天</button>}
                  </div>
                  <div className="me-grid">
                    {s.chapters.map((c: any) => c.best ? (
                      <button key={c.n} className="me-mini" onClick={() => router.push(`/lab/cert/${c.best.id}`)} title={`证书 ${c.best.no}`}>
                        <span className="lab-mono" style={{ fontSize: 11, opacity: .75 }}>{c.slot || `第 ${c.n} 段`}</span>
                        <b style={{ fontSize: 13.5, lineHeight: 1.4 }}>{c.title}</b>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span className="lab-mono bd">{bandText(c.best.band)}</span>
                          <span style={{ fontSize: 11, opacity: .7 }}>{c.tries > 1 ? `走过 ${c.tries} 次` : ''}</span>
                        </span>
                      </button>
                    ) : (
                      <button key={c.n} className="me-mini empty" onClick={() => router.push(`/lab/${s.id}?m=test${c.id ? `&ch=${c.id}` : ''}`)}>
                        <span className="lab-mono" style={{ fontSize: 11 }}>{c.slot || `第 ${c.n} 段`}</span>
                        <b style={{ fontSize: 13.5, lineHeight: 1.4 }}>{c.title}</b>
                        <span style={{ fontSize: 12, color: 'var(--v)', fontWeight: 700 }}>去完成 →</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="lab-glass" style={{ padding: '6px 18px' }}>
            {d.history.map((h, i) => (
              <div key={h.id} onClick={() => router.push(`/lab/cert/${h.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}>
                <span className="lab-mono" style={{ fontSize: 12, color: 'var(--ink3)', width: 92, flexShrink: 0 }}>{fmt(h.date)}</span>
                {h.space?.avatar && <img src={h.space.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', objectPosition: '54% 10%', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{h.space?.role || '—'}{h.chapter && h.chapter.total > 1 ? <span style={{ color: 'var(--ink3)', fontWeight: 500 }}> · 第 {h.chapter.n} / {h.chapter.total} 段</span> : null}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.chapter?.slot ? `${h.chapter.slot} · ` : ''}{h.chapter?.title}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="lab-mono" style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0 }}>{bandText(h.band)}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{h.score} 分{typeof h.match === 'number' ? ` · 一致 ${h.match}%` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
