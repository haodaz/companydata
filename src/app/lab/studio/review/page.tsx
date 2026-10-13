'use client';

/**
 * 示范评审报告（百业工厂，要登录）：/lab/studio/review?space=<空间>&s=<作答>
 * 一次操作算不算「值得学习的操作」：五道关 + 三档，每个判断都带出处（标准 / 老师傅 / 其他示范者），三边都没有的写「待定」。
 */
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const BASIS: Record<string, { label: string; color: string; bg: string }> = {
  standard: { label: '标准', color: '#1f7a4d', bg: 'rgba(47,191,143,.14)' },
  expert: { label: '老师傅', color: '#9a5b12', bg: 'rgba(240,160,60,.16)' },
  ai: { label: 'AI 推断', color: '#6b6f8a', bg: 'rgba(120,124,160,.14)' },
  none: { label: '无出处', color: '#a33', bg: 'rgba(226,92,92,.12)' },
};
const GATE: Record<string, { icon: string; color: string; label: string }> = {
  pass: { icon: '✓', color: '#12a150', label: '通过' }, fail: { icon: '✕', color: '#d6336c', label: '未过' },
  warn: { icon: '!', color: '#e08a1e', label: '部分' }, pending: { icon: '…', color: '#8389a6', label: '待访谈' },
};
const GRADE: Record<string, { color: string; bg: string }> = {
  exemplar: { color: '#12a150', bg: 'linear-gradient(120deg, rgba(47,191,143,.18), rgba(47,191,143,.04))' },
  reference: { color: '#6a5cff', bg: 'linear-gradient(120deg, rgba(106,92,255,.18), rgba(106,92,255,.04))' },
  rejected: { color: '#d6336c', bg: 'linear-gradient(120deg, rgba(214,51,108,.16), rgba(214,51,108,.04))' },
};

export default function DemoReviewPage() {
  return <Suspense fallback={null}><DemoReview /></Suspense>;
}

function DemoReview() {
  const sp = useSearchParams();
  const router = useRouter();
  const space = sp.get('space') || '';
  const sid = sp.get('s') || '';
  const [items, setItems] = useState<any[] | null>(null);
  const [rv, setRv] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => { if (space) fetch(`/api/lab/studio/review?space=${space}`).then(r => r.json()).then(j => j.ok ? setItems(j.items) : setErr(j.error)); }, [space]);
  useEffect(() => {
    if (!sid) { setRv(null); return; }
    setRv(null); setErr('');
    fetch(`/api/lab/studio/review?submission=${sid}`).then(r => r.json()).then(j => j.ok ? setRv(j.review) : setErr(j.error));
  }, [sid]);
  const pick = (id: string) => router.replace(`/lab/studio/review?space=${space}&s=${id}`, { scroll: false });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
      <div className="lab-glass" style={{ padding: 14, position: 'sticky', top: 80 }}>
        <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>可评审的操作 · 有工位记录</div>
        {!items && !err && <div className="lab-mono" style={{ color: 'var(--ink3)' }}>LOADING<span className="lab-dots" /></div>}
        {items?.map(s => (
          <div key={s.id} onClick={() => pick(s.id)} style={{ padding: '9px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 4, background: s.id === sid ? 'rgba(106,92,255,.12)' : 'transparent' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{s.candidate_name || '匿名'} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink3)' }}>{s.candidate_type === 'expert' ? '老师傅' : '真人'}</span></div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{s.score ?? '—'} 分 · {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('zh-CN') : ''}</div>
          </div>
        ))}
        {items && !items.length && <div style={{ fontSize: 13, color: 'var(--ink3)' }}>这个空间还没有带工位记录的真人操作。</div>}
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {err && <div className="lab-glass" style={{ padding: 20, color: '#d6336c' }}>{err}</div>}
        {!rv && sid && !err && <div className="lab-glass lab-scan" style={{ padding: 40, textAlign: 'center' }}><span className="lab-mono" style={{ color: 'var(--ink3)' }}>对照出处评审中<span className="lab-dots" /></span></div>}
        {!sid && <div className="lab-glass" style={{ padding: 28, color: 'var(--ink2)', lineHeight: 1.8 }}>左边选一次操作。评审不让 AI 自己打分：每一条判断都引用出处——<b>标准 / 设备手册</b>管红线和数值，<b>老师傅经验</b>管手感和判断，<b>其他示范者</b>看是否一致；三边都管不到的写「待定」。</div>}
        {rv && <>
          <div className="lab-glass" style={{ padding: 22, background: GRADE[rv.grade.key].bg }}>
            <div className="lab-mono lab-cap">示范评审报告 · {rv.space.role}{rv.chapter.title ? ` · ${rv.chapter.title}` : ''}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{rv.submission.name} 的这次操作</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: GRADE[rv.grade.key].color }}>{rv.grade.label}</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>原评分 {rv.submission.score ?? '—'}</div>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.7 }}>{rv.grade.why}</div>
            <div style={{ marginTop: 12 }}><a className="lab-btn sm" href={`/lab/${rv.space.id}?m=learn${rv.chapter.id ? `&ch=${rv.chapter.id}` : ''}&fromSub=${rv.submission.id}`} style={{ textDecoration: 'none' }}>拿这次操作去访谈 →</a></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {Object.entries(rv.coverage).filter(([, v]: any) => v > 0).map(([k, v]: any) => <span key={k} style={{ fontSize: 12.5, padding: '4px 10px', borderRadius: 100, color: BASIS[k].color, background: BASIS[k].bg, fontWeight: 700 }}>出处 · {BASIS[k].label} {v} 条</span>)}
            </div>
          </div>

          <div className="lab-glass" style={{ padding: 18 }}>
            <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>五道关</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {rv.gates.map((g: any) => (
                <div key={g.key} style={{ display: 'grid', gridTemplateColumns: '110px 64px minmax(0, 1fr)', gap: 12, alignItems: 'baseline' }}>
                  <b>{g.label}</b>
                  <span style={{ fontWeight: 800, color: GATE[g.state].color }}>{GATE[g.state].icon} {GATE[g.state].label}</span>
                  <span style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{g.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {rv.benches.map((b: any, i: number) => (
            <div key={i} className="lab-glass" style={{ padding: 18 }}>
              <div className="lab-mono lab-cap" style={{ marginBottom: 10 }}>逐条对照 · {b.bench || b.step} · 目标 {b.goalsDone}/{b.goalsTotal}</div>
              <div style={{ display: 'grid', gap: 2 }}>
                {b.findings.filter((f: any) => f.kind === 'goal' || f.hit || f.basis === 'standard').map((f: any) => {
                  const bad = f.kind === 'rule' && f.hit && f.severity === 'violation';
                  return (
                    <div key={`${f.kind}${f.id}`} style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1.2fr) 76px minmax(0, 1.6fr)', gap: 10, padding: '9px 4px', borderTop: '1px solid var(--line)', alignItems: 'baseline' }}>
                      <span className="lab-mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>{f.kind === 'goal' ? '目标' : f.severity === 'violation' ? '红线' : '提醒'}{f.t != null ? ` ${Math.floor(f.t / 60)}:${String(Math.round(f.t % 60)).padStart(2, '0')}` : ''}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: bad ? '#d6336c' : 'var(--ink)' }}>{f.label}</div>
                        <div style={{ fontSize: 12.5, color: bad ? '#d6336c' : f.kind === 'goal' && !f.hit ? '#e08a1e' : 'var(--ink3)', marginTop: 2 }}>{f.verdict}</div>
                      </div>
                      <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 100, color: BASIS[f.basis].color, background: BASIS[f.basis].bg, fontWeight: 700, justifySelf: 'start' }}>{BASIS[f.basis].label}</span>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
                        {f.evidence ? <><b>{f.source}{f.clause ? ` ${f.clause}` : ''}</b>：{f.evidence.split('：').slice(1).join('：')}</> : <span style={{ color: 'var(--ink3)' }}>{f.note || '没有出处'}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {rv.questions.length > 0 && (
            <div className="lab-glass" style={{ padding: 18 }}>
              <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>访谈要问的 · 盯着偏差问，不泛泛地问「为什么」</div>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, fontSize: 14, lineHeight: 1.7 }}>{rv.questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ol>
            </div>
          )}
        </>}
      </div>
    </div>
  );
}
