'use client';

/**
 * 真活作品存档（11-13 潜历 043）：候选人保存自己作品的那一份，打印成 PDF 带走——成绩、任务书、交付原文、附件，底部核验码 + 二维码 + 指纹。
 *   /work/<token>/archive?s=<作答编号>
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProofDoc, type Proof } from '@/components/work/ProofDoc';
import { pick } from '@/lib/work/i18n';

export default function ArchivePage() {
  const sid = useSearchParams().get('s') || '';
  const code = `ZH-${sid.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const [p, setP] = useState<Proof | null>(null); const [err, setErr] = useState('');
  useEffect(() => { fetch(`/api/work/verify/${code}`).then(r => r.json()).then(j => (j.ok ? setP(j) : setErr(j.error || '没找到这份作品'))).catch(() => setErr('没加载出来，刷新试试')); }, [code]);
  if (err) return <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>{err}</div>;
  if (!p) return <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>作品存档生成中…</div>;
  const L = (zh: string, en: string) => pick(p.task.lang, zh, en);
  return <ProofDoc p={p} mode="archive" actions={<>
    <button onClick={() => window.print()}>{L('存成 PDF / 打印', 'Save as PDF / print')}</button>
    <button onClick={() => navigator.clipboard.writeText(`${location.origin}/work/verify/${p.code}`)}>{L('复制核验链接', 'Copy verification link')}</button>
    <span style={{ fontSize: 12.5, color: '#888' }}>{L('存下来的 PDF 可以放进简历、作品集；别人扫码就能核对原件。', 'Put the PDF in your CV or portfolio; anyone can scan the code to check it against the original.')}</span>
  </>} />;
}
