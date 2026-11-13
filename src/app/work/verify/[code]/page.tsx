'use client';

/** 作品核验（11-13 潜历 043）：扫作品存档上的二维码进来，看平台存的原件；可以粘贴手里的版本核对指纹。公开、只读 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ProofDoc, type Proof } from '@/components/work/ProofDoc';

export default function VerifyPage() {
  const { code } = useParams<{ code: string }>();
  const [p, setP] = useState<Proof | null>(null); const [err, setErr] = useState('');
  useEffect(() => { fetch(`/api/work/verify/${encodeURIComponent(code)}`).then(r => r.json()).then(j => (j.ok ? setP(j) : setErr(j.error || '没有这个核验码对应的作品'))).catch(() => setErr('没加载出来，刷新试试')); }, [code]);
  if (err) return <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>{err}</div>;
  if (!p) return <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>核验中…</div>;
  return <ProofDoc p={p} mode="verify" />;
}
