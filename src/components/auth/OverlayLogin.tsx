'use client';

/**
 * 蒙版式登录：给 AI 百业（/lab）和真活（/work）用，和企业数据工厂的 /login 在感受上分开——
 * 整页是各自产品的环境（真活：工作场所场景图 + 浅色蒙版；百业：光斑 + 细网格），中间一张卡片登录。
 * 账号还是同一套（/api/auth/login），只是壳不同。登录完回 next（只认站内路径）。
 */
import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const ART = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art';
const WORK_SCENES = [`${ART}/muprqaib23zv-research_office.jpg`, `${ART}/muprkhvgjivf-structure_office.jpg`, `${ART}/mufry2fd3tn2-production_control_room.jpg`, `${ART}/muprgu4wkuxw-architect_studio.jpg`];

export function OverlayLogin({ brand }: { brand: 'work' | 'lab' }) {
  const router = useRouter(); const sp = useSearchParams();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const scene = WORK_SCENES[Math.floor(Date.now() / 60000) % WORK_SCENES.length];
  const next = sp.get('next') || '';
  const dest = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : (brand === 'work' ? '/work/mine' : '/lab/spaces');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!email.trim() || !pw) { setErr('邮箱和密码都要填'); return; }
    setBusy(true); setErr('');
    try {
      const j = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password: pw }) })).json();
      if (!j.success) throw new Error(j.error || '登录失败');
      router.push(dest); router.refresh();
    } catch (e: any) { setErr(e.message || '网络错误'); setBusy(false); }
  };
  const isWork = brand === 'work';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, fontFamily: "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#1a1a2e' }}>
      {/* 环境 */}
      {isWork
        ? <><div style={{ position: 'absolute', inset: 0, background: `url(${scene}) center / cover`, filter: 'blur(2px)', transform: 'scale(1.04)' }} /><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,253,249,.72), rgba(255,253,249,.55))' }} /></>
        : <><div style={{ position: 'absolute', inset: 0, background: '#f5f6ff' }} />
            <div style={{ position: 'absolute', width: 620, height: 620, left: -160, top: -200, borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle, #cfc8ff, transparent 65%)' }} />
            <div style={{ position: 'absolute', width: 560, height: 560, right: -140, top: '8%', borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle, #bdf0f6, transparent 65%)' }} />
            <div style={{ position: 'absolute', width: 520, height: 520, left: '32%', bottom: -260, borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle, #ffd3e6, transparent 65%)' }} />
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(106,92,255,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(106,92,255,.14) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, #000 20%, transparent 80%)', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, #000 20%, transparent 80%)' }} /></>}
      {/* 卡片 */}
      <form onSubmit={submit} style={{ position: 'relative', width: '100%', maxWidth: 400, background: 'rgba(255,255,255,.86)', backdropFilter: 'blur(18px) saturate(1.3)', WebkitBackdropFilter: 'blur(18px) saturate(1.3)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 22, padding: '30px 30px 26px', boxShadow: '0 24px 70px rgba(20,24,60,.16), 0 0 0 1px rgba(106,92,255,.12)' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#6b6f86', fontWeight: 700 }}>{isWork ? '平方智能' : 'PINGFANG · AI HUNDRED TRADES'}</div>
        <div style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 2px', letterSpacing: 1 }}>{isWork ? <>百业AI<span style={{ color: '#6055f5' }}>｜</span>真活</> : <>AI <span style={{ color: '#6a5cff' }}>百业</span></>}</div>
        <div style={{ fontSize: 13.5, color: '#4a4f66', marginBottom: 22 }}>{isWork ? '登录后出题；做题的人不用登录' : '登录进入你的空间和进度'}</div>
        <label style={lab}>邮箱</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="name@company.com" style={inp} />
        <label style={{ ...lab, marginTop: 12 }}>密码</label>
        <input value={pw} onChange={e => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder="密码" style={inp} />
        {err && <div style={{ color: '#c0392b', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ marginTop: 20, width: '100%', height: 46, border: 0, borderRadius: 12, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: busy ? 'default' : 'pointer', opacity: busy ? .7 : 1 }}>{busy ? '登录中…' : '登录'}</button>
        <div style={{ fontSize: 12, color: '#8a8fa8', marginTop: 14, textAlign: 'center' }}>没有账号？找管理员开通 · <a href={isWork ? '/work' : '/lab'} style={{ color: '#6055f5' }}>回首页</a></div>
      </form>
    </div>
  );
}
const lab: React.CSSProperties = { display: 'block', fontSize: 12.5, color: '#4a4f66', fontWeight: 600, marginBottom: 5 };
const inp: React.CSSProperties = { width: '100%', height: 42, border: '1px solid #d9dbe6', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' };
