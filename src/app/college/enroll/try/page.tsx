'use client';

/**
 * 看效果（从申请模型入学页进来）：挑一个大模型当学生、挑一门课（一个百业空间）→ 入学考（不带技能）→ 上课（装上老师傅的技能）再考 →
 * 过 60 分毕业、发证书；没过就继续补训再考。走百业现有的 AI 作答 + 评分接口（/api/lab/spaces/:id/submit mode=ai），是真考试。
 * 游客只能用便宜的默认模型（接口那边也锁死），登录后可以挑别的。
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MODEL_OPTIONS } from '@/lib/model-context';
import { useUser } from '@/lib/user-context';
import { GUEST_MODELS } from '@/lib/lab-guest';
import type { Graduate } from '@/lib/college';

type Run = { id: string; score: number; summary: string; withSkill: boolean } | null;

export default function Enroll() {
  const { user } = useUser();
  const [grads, setGrads] = useState<Graduate[]>([]);
  const [course, setCourse] = useState('');
  const [model, setModel] = useState('qwen-plus');
  const [before, setBefore] = useState<Run>(null);
  const [after, setAfter] = useState<Run[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/college/graduates').then(r => r.json()).then(j => {
      if (!j.ok) return;
      setGrads(j.data);
      const q = new URLSearchParams(window.location.search).get('course');
      setCourse(q && j.data.some((g: Graduate) => g.id === q) ? q : j.data[0]?.id || '');
    });
  }, []);
  const staff = !!user;
  const models = useMemo(() => MODEL_OPTIONS.filter(m => staff || GUEST_MODELS.includes(m.id)), [staff]);
  const g = grads.find(x => x.id === course);
  const reset = () => { setBefore(null); setAfter([]); setErr(''); };

  const exam = async (withSkill: boolean) => {
    if (!g) return;
    setErr(''); setBusy(withSkill ? '上课中：装上老师傅的技能，重新答题、评分…' : '入学考：不带任何技能，自己答题、评分…');
    try {
      const r = await fetch(`/api/lab/spaces/${g.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'ai', withSkill, model }), signal: AbortSignal.timeout(280_000) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '考试没跑完');
      const run = { id: j.submission.id, score: j.submission.score, summary: j.submission.grading?.summary || '', withSkill };
      if (withSkill) setAfter(a => [...a, run]); else setBefore(run);
    } catch (e: any) { setErr(e?.name === 'TimeoutError' ? '考试超时了，再试一次' : e.message); }
    finally { setBusy(''); }
  };
  const last = after[after.length - 1] || null;
  const passed = !!last && last.score >= 60;
  const modelName = MODEL_OPTIONS.find(m => m.id === model)?.label || model;

  return (
    <div className="ce">
      <style>{CE_CSS}</style>
      <section style={{ padding: '40px 0 18px' }}>
        <div className="col-eyebrow"><a href="/college/enroll">申请模型入学</a> · 看效果 · TRY IT</div>
        <h1 className="serif ce-h1">亲手考一次：上学前，上学后</h1>
        <p className="col-sub" style={{ maxWidth: 760 }}>挑一个大模型、挑一门课，现场考给你看：先不带任何技能考一次，看它在这一行本来是什么水平；再装上老师傅的判断规则和示范，重新考。同一道真活、同一套岗位标准评分。想送你们自己的模型来，回到申请页提交入学申请。</p>
      </section>

      <div className="ce-grid">
        <section className="col-card ce-step">
          <div className="ce-n serif">壹</div>
          <b>学生：哪一个 AI</b>
          <select className="col-input" value={model} onChange={e => { setModel(e.target.value); reset(); }}>
            {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {!staff && <p className="ce-note">体验时用默认模型考。想看你们自己的模型考得怎样，<a href="/college/enroll#apply">提交入学申请</a>，我们来对接。</p>}
        </section>
        <section className="col-card ce-step">
          <div className="ce-n serif">贰</div>
          <b>课程：学哪一行</b>
          <select className="col-input" value={course} onChange={e => { setCourse(e.target.value); reset(); }}>
            {grads.map(x => <option key={x.id} value={x.id}>{x.role}（{x.family}{x.research ? ' · 学科研究' : ''}）</option>)}
          </select>
          {g && <p className="ce-note">任课老师：{g.name} · {g.teacher.expert ? `学自 ${g.teacher.name}` : 'AI 草案，等老师傅校正'}。<Link href={`/college/g/${g.id}`}>看这门课 →</Link></p>}
        </section>
      </div>

      <section className="col-card ce-run">
        <div className="ce-row">
          <div className={`ce-box${before ? ' done' : ''}`}>
            <span className="k">入学考 · 上学前</span>
            <div className="v serif">{before ? before.score : '—'}</div>
            <p>{before ? before.summary.slice(0, 120) : `${modelName} 不带任何技能，直接干这一行的活。`}</p>
            <button className="col-btn" disabled={!!busy || !g} onClick={() => { reset(); exam(false); }}>{before ? '重考入学考' : '开始入学考'}</button>
          </div>
          <div className="ce-arrow">→</div>
          <div className={`ce-box${last ? ' done' : ''}${passed ? ' ok' : ''}`}>
            <span className="k">上课后再考 · 上学后{after.length > 1 ? ` · 第 ${after.length} 轮` : ''}</span>
            <div className="v serif">{last ? last.score : '—'}</div>
            <p>{last ? last.summary.slice(0, 120) : '装上老师傅的判断规则、示范和这一行的知识，再干一次同样的活。'}</p>
            <button className="col-btn gold" disabled={!!busy || !g || !before} onClick={() => exam(true)}>{!last ? '上课，再考' : passed ? '再考一次' : '没过 · 继续补训再考'}</button>
          </div>
        </div>
        {busy && <div className="ce-busy"><i />{busy}（大约一分钟）</div>}
        {err && <div className="ce-err">{err}</div>}
        {passed && (
          <div className="ce-grad">
            <div className="serif" style={{ fontSize: 22, fontWeight: 900 }}>毕业了 🎓</div>
            <div>{modelName} 在「{g?.role}」这门课上从 {before?.score ?? '—'} 分到 {last!.score} 分，可以上岗。</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <a className="col-btn gold sm" href={`/lab/cert/${last!.id}`} target="_blank" rel="noreferrer">看毕业证书 ↗</a>
              <Link className="col-btn ghost sm" href={`/college/g/${g?.id}?fresh=1`}>这门课的毕业生档案</Link>
              <Link className="col-btn ghost sm" href={`/college/hire?from=${g?.id}#apply`}>让它去上岗</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const CE_CSS = `
.ce-h1 { font-size: clamp(30px, 4.6vw, 48px); font-weight: 900; margin: 10px 0 12px; }
.ce-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 14px; }
.ce-step { padding: 20px 22px; display: grid; gap: 10px; position: relative; }
.ce-step b { font-size: 17px; }
.ce-n { position: absolute; right: 18px; top: 6px; font-size: 44px; font-weight: 900; color: rgba(176,141,87,.22); }
.ce-note { margin: 0; font-size: 13px; color: var(--ink3); line-height: 1.7; }
.ce-note a { color: var(--gold) !important; font-weight: 700; }
.ce-run { margin-top: 14px; padding: 22px; }
.ce-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; align-items: stretch; }
.ce-arrow { display: grid; place-items: center; font-size: 28px; color: var(--gold); }
.ce-box { border: 1px dashed var(--line); border-radius: 16px; padding: 18px; display: grid; gap: 8px; align-content: start; }
.ce-box.done { border-style: solid; background: #fff; }
.ce-box.ok { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(176,141,87,.15); }
.ce-box .k { font-size: 12.5px; font-weight: 800; letter-spacing: .08em; color: var(--ink3); }
.ce-box .v { font-size: 46px; font-weight: 900; line-height: 1; }
.ce-box.ok .v { color: #8a6a2f; }
.ce-box p { margin: 0; font-size: 13.5px; color: var(--ink2); line-height: 1.7; min-height: 46px; }
.ce-busy { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 14px; color: var(--navy2); }
.ce-busy i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--gold); border-top-color: transparent; animation: cespin .8s linear infinite; }
@keyframes cespin { to { transform: rotate(360deg); } }
.ce-err { margin-top: 12px; color: #b42318; font-size: 14px; }
.ce-grad { margin-top: 16px; padding: 18px 20px; border-radius: 16px; background: linear-gradient(120deg, rgba(176,141,87,.16), rgba(217,184,120,.1)); border: 1px solid rgba(176,141,87,.4); display: grid; gap: 4px; font-size: 14.5px; }
@media (max-width: 760px) { .ce-row { grid-template-columns: 1fr; } .ce-arrow { transform: rotate(90deg); } }
`;
