'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { App } from 'antd';
import { bandText } from '@/lib/lab-cert';
import { CERT_CSS, Certificate } from '@/components/lab/Certificate';

/** 全天证书：?s=每一段的作答编号。深色版式，列出每一段的等级；下面逐段可以点进各自的成绩单 */
function DayCert() {
  const sp = useSearchParams();
  const router = useRouter();
  const { message } = App.useApp();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/lab/cert/day?s=${encodeURIComponent(sp.get('s') || '')}`).then(r => r.json()).then(j => (j.ok ? setD(j.day) : setErr(j.error))).catch(e => setErr(e.message));
  }, [sp]);
  if (err) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: '#d6336c' }}>{err}</div>;
  if (!d) return <div className="lab-glass lab-scan" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">LOADING<span className="lab-dots" /></span></div>;
  const list = d.chapters.map((c: any) => ({ slot: c.chapter?.slot || '', title: c.chapter?.title || '', band: c.overall }));
  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <style>{CERT_CSS}</style>
      <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="lab-mono lab-cap">A FULL DAY · {d.no}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{d.space.role}的一天 · 全天完成</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="lab-btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); message.success('链接已复制'); } catch { message.info(window.location.href); } }}>复制链接</button>
        <button className="lab-btn ghost sm" onClick={() => window.print()}>打印 / 存 PDF</button>
        <button className="lab-btn ghost sm" onClick={() => router.push('/lab/me')}>我的证书库</button>
      </div>
      <Certificate c={d} day dayList={list} />
      <div className="no-print lab-glass" style={{ padding: 18 }}>
        <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>每一段的成绩单</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {d.chapters.map((c: any) => (
            <button key={c.id} className="lab-btn ghost" onClick={() => router.push(`/lab/cert/${c.id}`)} style={{ height: 'auto', padding: '10px 14px', justifyContent: 'flex-start', gap: 12 }}>
              <span className="lab-mono" style={{ color: 'var(--v)', minWidth: 46 }}>{c.chapter?.slot || `第 ${c.chapter?.n} 段`}</span>
              <span style={{ flex: 1, textAlign: 'left', color: 'var(--ink)' }}>{c.chapter?.title}</span>
              <span className="lab-mono" style={{ fontWeight: 900, fontSize: 18 }}>{bandText(c.overall)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DayCertPage() { return <Suspense><DayCert /></Suspense>; }
