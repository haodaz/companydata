'use client';

/**
 * AI 毕业生的毕业证书：用百业那一套证书夹（CertFolio：封皮 → 证书 | 画作 → 每一段成绩 → 全天成绩），名字叫 NOVA。
 * 每一段取「上学后」（装了技能）成绩最好的那次毕业考，交给 /api/lab/cert/day?ai=1 拼成证书夹；每段都 ≥ 60 才有证书，否则显示成绩夹。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CertFolio } from '@/components/lab/CertFolio';

export default function Diploma() {
  const { id } = useParams<{ id: string }>();
  const [g, setG] = useState<any>(null);
  const [f, setF] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const j = await (await fetch(`/api/college/graduates/${id}`)).json();
        if (!j.ok) throw new Error(j.error || '读取失败');
        setG(j.data);
        const lessons: any[] = j.data.lessons || [];
        const after: any[] = (j.data.exams || []).filter((e: any) => e.after);
        // 每一段一份：这一段上学后最好的毕业考。只认记了章节的；没记章节的老作答只在第一段一份都没有时兜底（证书那边会把它算到第一章，配错段）
        const best = (xs: any[]) => [...xs].sort((a, b) => b.score - a.score)[0]?.id;
        const sids = lessons.map((l, i) => best(after.filter(e => e.chapterId === l.id)) || (i === 0 ? best(after.filter(e => !e.chapterId)) : undefined)).filter(Boolean);
        if (!sids.length) throw new Error('还没有毕业考成绩');
        const c = await (await fetch(`/api/lab/cert/day?ai=1&s=${sids.join(',')}`)).json();
        if (!c.ok) throw new Error(c.error || '证书读取失败');
        setF(c.folder);
      } catch (e: any) { setErr(e.message); }
    })();
  }, [id]);

  if (err) return <div className="col-card" style={{ margin: '40px 0', padding: 30, color: '#b42318' }}>{err}</div>;
  if (!f || !g) return <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--ink3)' }}>正在调毕业证书…</div>;
  return (
    <div className="dpf">
      <style>{DPF_CSS}</style>
      <div className="dpf-head">
        <div>
          <div className="col-eyebrow">{f.complete ? 'DIPLOMA · 毕业证书' : 'TRANSCRIPT · 成绩夹'}</div>
          <div className="dpf-title serif">{g.name} · {g.role}</div>
          <div className="dpf-sub">{f.complete ? `全天 ${f.total} 段毕业考都过了，证书和每一段的成绩都夹在里面。` : `还有 ${f.total - f.parts.filter((p: any) => p.score >= 60).length} 段没考过，先看成绩夹。`}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="col-btn ghost sm" href={`/college/g/${g.id}`}>← 学籍档案</Link>
          <Link className="col-btn gold sm" href={`/college/hire?from=${g.id}#apply`}>雇它上岗</Link>
        </div>
      </div>
      <CertFolio f={f} />
    </div>
  );
}

// 证书夹里的翻页按钮用的是百业的 lab-btn：大学外壳里没有这套样式，这里补一份同样观感的
const DPF_CSS = `
.dpf { padding: 30px 0 10px; display: grid; gap: 22px; }
.dpf-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.dpf-title { font-size: 28px; font-weight: 900; margin: 6px 0 4px; }
.dpf-sub { font-size: 14.5px; color: var(--ink2); }
.dpf .lab-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 999px; border: 0; background: var(--navy); color: #fff; font: 700 13.5px inherit; font-family: inherit; cursor: pointer; }
.dpf .lab-btn.ghost { background: transparent; color: var(--navy); box-shadow: inset 0 0 0 1.5px var(--line); }
.dpf .lab-btn:disabled { opacity: .4; cursor: default; }
`;
