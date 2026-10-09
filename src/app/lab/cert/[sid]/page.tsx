'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** 单段的链接：直接打开这个人的证书夹，翻到这一段（成绩都夹在证书夹里，不再单独一页） */
export default function OneScore() {
  const { sid } = useParams<{ sid: string }>();
  const router = useRouter();
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`/api/lab/cert/${sid}`).then(r => r.json()).then(j => {
      if (!j.ok) { setErr(j.error); return; }
      router.replace(`/lab/cert/day?s=${(j.cert.folder || [sid]).join(',')}&at=${sid}`);
    }).catch(e => setErr(e.message));
  }, [sid, router]);
  if (err) return <div className="lab-glass" style={{ padding: 40, textAlign: 'center', color: '#d6336c' }}>{err}</div>;
  return <div className="lab-glass lab-scan" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}><span className="lab-mono">打开证书夹<span className="lab-dots" /></span></div>;
}
