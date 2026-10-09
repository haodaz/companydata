'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { App } from 'antd';
import { familyOf } from '@/lib/career-family';

/**
 * 体验百业 · 体验馆：所有已发布的职业空间，像应用商店一样摆出来，点开就玩。
 * 只读：没有生成 / 编辑 / 删除。只列至少有一章已发布的空间（全是草稿的不出现）。
 */
const GALLERY_CSS = `
.gal-card { overflow: hidden; display: flex; flex-direction: column; padding: 0 !important; }
.gal-cover { position: relative; aspect-ratio: 16 / 9; background: linear-gradient(135deg, #2b2463, #0f6c7a); overflow: hidden; }
.gal-cover img.bg { object-fit: cover; transition: transform .5s cubic-bezier(.2,.8,.2,1); }
.gal-card:hover .gal-cover img.bg { transform: scale(1.05); }
.gal-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,12,30,0) 40%, rgba(10,12,30,.72) 100%); }
.gal-badges { position: absolute; left: 12px; top: 12px; display: flex; gap: 6px; flex-wrap: wrap; z-index: 2; }
.gal-badge { padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; color: #fff; background: rgba(10,12,30,.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.22); white-space: nowrap; }
.gal-who { position: absolute; left: 14px; right: 14px; bottom: 12px; z-index: 2; display: flex; align-items: flex-end; gap: 12px; color: #fff; }
.gal-who img { width: 58px; height: 58px; border-radius: 50%; object-fit: cover; object-position: 54% 10%; border: 2px solid rgba(255,255,255,.95); background: rgba(255,255,255,.7); flex-shrink: 0; }
.gal-day { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink3); }
.gal-day b { font-weight: 700; color: var(--v); }
.gal-fams { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.gal-fams::-webkit-scrollbar { display: none; }
`;

export default function GalleryPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [spaces, setSpaces] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [fam, setFam] = useState('');

  useEffect(() => {
    fetch('/api/lab/spaces').then(r => r.json())
      .then(j => { if (j.ok) setSpaces(j.data); else setErr(j.error || '读取失败'); })
      .catch(e => setErr(e.message));
  }, []);

  const items = useMemo(() => (spaces || [])
    .filter(s => (s.chapters?.published || 0) > 0)
    .map(s => {
      const jd = s.jd_snapshot || {}, p = s.profile || {};
      const prof = jd.career?.profession || '';
      const family = familyOf(prof, s.skill?.domain, jd.title, jd.company);
      const text = [p.name, p.role, p.tagline, prof, jd.title, jd.company, jd.location, s.skill?.domain, family].filter(Boolean).join(' ').toLowerCase();
      return { s, jd, p, family, text };
    })
    // 有场景图的排前面：体验馆第一眼要好看
    .sort((a, b) => Number(!!b.s.cover) - Number(!!a.s.cover)), [spaces]);

  const fams = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of items) m.set(x.family, (m.get(x.family) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter(x => (!fam || x.family === fam) && (!kw || x.text.includes(kw)));
  }, [items, q, fam]);

  const share = async (id: string) => {
    const url = `${window.location.origin}/lab/${id}?m=test`;
    try { await navigator.clipboard.writeText(url); message.success('链接已复制，发给别人点开就能玩'); }
    catch { message.info(url); }
  };

  return (
    <div>
      <style>{GALLERY_CSS}</style>
      <div style={{ margin: '8px 0 18px' }}>
        <div className="lab-mono lab-cap">EXPERIENCE · 体验百业</div>
        <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 34px)', fontWeight: 800, margin: '4px 0 6px', lineHeight: 1.25 }}>
          {items.length || ''} 个职业的一天，点开就能上手
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14.5, color: 'var(--ink2)', flex: '1 1 320px' }}>跟着数字职人走一遍真实工作：接活、判断、操作设备，做完和老师傅的做法逐步对照。每走完一段领一张证书。</div>
          <button className="lab-btn ghost sm" onClick={() => router.push('/lab/me')} style={{ color: '#8a6a2f', boxShadow: '0 0 0 1px rgba(176,141,87,.55)' }}>✦ 我的证书库 · 操作历史</button>
        </div>
      </div>

      <div className="lab-glass" style={{ padding: '12px 14px', marginBottom: 16, display: 'grid', gap: 10 }}>
        <input className="lab-input" value={q} onChange={e => setQ(e.target.value)} placeholder="搜职业、企业、城市——如：咖啡 / 焊接 / 护士"
          style={{ padding: '9px 14px', borderRadius: 12, fontSize: 14 }} />
        {fams.length > 1 && (
          <div className="gal-fams">
            <button className={`lab-chip ${fam ? 'g' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFam('')}>全部 · {items.length}</button>
            {fams.map(([f, n]) => (
              <button key={f} className={`lab-chip ${fam === f ? '' : 'g'}`} style={{ cursor: 'pointer' }} onClick={() => setFam(fam === f ? '' : f)}>{f} · {n}</button>
            ))}
          </div>
        )}
      </div>

      {err ? (
        <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: '#d6336c' }}>{err}</div>
      ) : !spaces ? (
        <div className="lab-glass lab-scan" style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>
      ) : !shown.length ? (
        <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>
          {items.length ? <>没有符合条件的职业。<button className="lab-btn sm ghost" style={{ marginLeft: 10 }} onClick={() => { setQ(''); setFam(''); }}>清空筛选</button></> : '还没有发布的体验空间。'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {shown.map(({ s, jd, p, family }, i) => {
            const ch = s.chapters || {};
            const go = () => router.push(`/lab/${s.id}?m=test`);
            return (
              <div key={s.id} className="lab-glass hover lab-in gal-card" style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }} onClick={go}>
                <div className="gal-cover">
                  {s.cover && <Image className="bg" src={s.cover} alt="" fill sizes="(max-width: 700px) 100vw, 400px" />}
                  <div className="gal-badges">
                    {ch.published > 1 && <span className="gal-badge">一天 · {ch.published} 章</span>}
                    {s.features?.bench && <span className="gal-badge">虚拟工位</span>}
                    {s.features?.immersive && <span className="gal-badge">沉浸场景</span>}
                  </div>
                  <div className="gal-who">
                    {p.avatar && <Image src={p.avatar} alt="" width={58} height={58} sizes="58px" />}
                    <div style={{ minWidth: 0, textShadow: '0 1px 6px rgba(0,0,0,.5)' }}>
                      <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3 }}>{p.role || jd.career?.profession || jd.title}</div>
                      <div style={{ fontSize: 12.5, opacity: .85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name ? `${p.name} 带你上岗` : jd.company}</div>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '12px 16px 14px', display: 'grid', gap: 8, flex: 1 }}>
                  {p.tagline && <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.6 }}>「{p.tagline}」</div>}
                  {ch.slots?.length > 1 && (
                    <div className="gal-day">{ch.slots.map((t: string, k: number) => <React.Fragment key={k}>{k > 0 && <span>→</span>}<b>{t}</b></React.Fragment>)}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
                    <span className="lab-chip g">{family}</span>
                    <span style={{ flex: 1 }} />
                    <button className="lab-btn ghost sm" onClick={e => { e.stopPropagation(); share(s.id); }} title="复制体验链接">分享</button>
                    <button className="lab-btn sm" onClick={e => { e.stopPropagation(); go(); }}>开始体验</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
