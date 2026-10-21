'use client';

/**
 * 毕业生档案：一位 AI 职人的学籍——学了什么、跟谁学的、考得怎样、能干哪些活、能去哪些公司（平方岗位库在招岗位）。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function GraduatePage() {
  const { id } = useParams<{ id: string }>();
  const [g, setG] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const fresh = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fresh') ? '?fresh=1' : '';
    fetch(`/api/college/graduates/${id}${fresh}`).then(r => r.json()).then(j => (j.ok ? setG(j.data) : setErr(j.error || '读取失败'))).catch(e => setErr(e.message));
  }, [id]);

  if (err) return <div className="col-card" style={{ margin: '40px 0', padding: 30, color: '#b42318' }}>{err}</div>;
  if (!g) return <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--ink3)' }}>正在调学籍档案…</div>;

  const after = g.exams.filter((e: any) => e.after), before = g.exams.filter((e: any) => !e.after);
  const bar = (v: number | null, gold = false) => (
    <div className="gp-bar"><i style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%`, background: gold ? 'linear-gradient(90deg,#b08d57,#d9b878)' : '#8a90ad' }} /><b>{v ?? '—'}</b></div>
  );
  return (
    <div>
      <style>{GP_CSS}</style>
      <section className="gp-hero" style={{ backgroundImage: g.cover ? `linear-gradient(90deg, rgba(22,32,74,.94) 30%, rgba(22,32,74,.55)), url(${g.cover})` : undefined }}>
        <Link href="/college/graduates" className="gp-back">← 全部毕业生</Link>
        <div className="gp-who">
          {g.avatar ? <img src={g.avatar} alt="" /> : <span className="gp-ph" />}
          <div>
            <div className="gp-tags">
              <span className={`gp-badge${g.graduated ? ' ok' : ''}`}>{g.graduated ? '已毕业 · 可上岗' : '在读'}</span>
              <span className="gp-badge">{g.research ? '学科研究' : '职业岗位'} · {g.family}</span>
            </div>
            <div className="gp-name">{g.name}</div>
            <h1 className="serif">{g.role}</h1>
            {g.tagline && <div className="gp-tagline">「{g.tagline}」</div>}
            <div className="gp-teacher">{g.teacher.expert ? `手艺学自 ${g.teacher.name} · ${g.teacher.place}` : '学自岗位公开知识与平方图谱 · 等一位老师傅来校正'}</div>
          </div>
        </div>
        <div className="gp-acts">
          <Link className="col-btn gold" href={`/college/hire?from=${g.id}#apply`}>雇它上岗</Link>
          {g.graduated && <Link className="col-btn ghost" href={`/college/g/${g.id}/diploma`}>毕业证书</Link>}
          <a className="col-btn ghost" href={`/lab/${g.id}?m=test`}>看它的一天</a>
          <a className="col-btn ghost" href={`/lab/${g.id}/chat`}>和它聊聊</a>
          <Link className="col-btn ghost" href={`/college/enroll/try?course=${g.id}`}>拿这门课考你的 AI</Link>
        </div>
      </section>

      <div className="gp-grid">
        <section className="col-card gp-sec">
          <div className="col-eyebrow">TRANSCRIPT</div>
          <h2 className="serif">成绩：上学前，上学后</h2>
          <div className="gp-cmp">
            <div><span>上学前 · 通用大模型自己答</span>{bar(g.exam.before)}</div>
            <div><span>上学后 · 装上老师傅的技能</span>{bar(g.exam.after, true)}</div>
          </div>
          <p className="gp-note">同一道题、同一套岗位标准评分。及格线 60，过了才算毕业。</p>
          {!!g.exams.length && (
            <table className="gp-table">
              <thead><tr><th>考试</th><th>模型</th><th>状态</th><th>分数</th></tr></thead>
              <tbody>{[...after, ...before].slice(0, 8).map((e: any) => (
                <tr key={e.id}><td>{e.chapter}</td><td>{e.model || '—'}</td><td>{e.after ? '上学后' : '上学前'}</td><td><a href={`/lab/cert/${e.id}`} target="_blank" rel="noreferrer"><b>{e.score}</b> ↗</a></td></tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <section className="col-card gp-sec">
          <div className="col-eyebrow">CURRICULUM</div>
          <h2 className="serif">学了什么：这一行的一天</h2>
          <ol className="gp-lessons">
            {g.lessons.map((l: any) => <li key={l.id}><span className="t">{l.slot || '—'}</span><span>{l.title}</span>{l.bench && <span className="col-chip gold">上手操作</span>}</li>)}
          </ol>
        </section>

        <section className="col-card gp-sec">
          <div className="col-eyebrow">WHAT IT CAN DO</div>
          <h2 className="serif">能干哪些活</h2>
          <ul className="gp-can">
            {[...g.canSolve, ...g.capabilities].slice(0, 8).map((x: string, i: number) => <li key={i}>{x}</li>)}
          </ul>
        </section>

        <section className="col-card gp-sec gp-wide">
          <div className="col-eyebrow">WHERE IT CAN WORK</div>
          <h2 className="serif">能去哪些公司</h2>
          <p className="gp-note" style={{ marginTop: 0 }}>{g.occupation ? <>对应职业「{g.occupation.name}」——平方岗位库里正在招这一行的企业与岗位：</> : '还没对上职业库，暂时找不到在招岗位。'}</p>
          {!!g.jobs.length && (
            <div className="gp-jobs">
              {g.jobs.map((j: any, i: number) => (
                <a key={i} className="gp-job" href={j.url || undefined} target="_blank" rel="noreferrer">
                  <b>{j.company}</b><span>{j.name}</span>{j.city && <em>{String(j.city).slice(0, 18)}</em>}
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const GP_CSS = `
.gp-hero { margin: 24px 0 18px; padding: 26px clamp(18px, 3vw, 34px) 28px; border-radius: 22px; color: #fff; background: linear-gradient(120deg, #16204a, #2c3768); background-size: cover; background-position: center; }
.gp-back { font-size: 13.5px; opacity: .8; }
.gp-who { display: flex; gap: 20px; align-items: center; margin-top: 18px; flex-wrap: wrap; }
.gp-who img, .gp-ph { width: 112px; height: 112px; border-radius: 50%; object-fit: cover; object-position: 50% 12%; background: #e8e3d4; border: 3px solid #fffdf7; box-shadow: 0 0 0 2px #d9b878; flex-shrink: 0; }
.gp-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.gp-badge { padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 800; background: rgba(255,255,255,.14); }
.gp-badge.ok { background: linear-gradient(120deg, #b08d57, #d9b878); color: #1c1606; }
.gp-name { margin-top: 10px; font-size: 12px; letter-spacing: .2em; opacity: .7; font-weight: 700; }
.gp-hero h1 { font-size: clamp(28px, 4vw, 42px); font-weight: 900; margin: 2px 0 6px; }
.gp-tagline { font-size: 15px; opacity: .9; }
.gp-teacher { font-size: 13px; opacity: .7; margin-top: 6px; }
.gp-acts { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
.gp-acts .col-btn.ghost { color: #fff !important; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.4); }
.gp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 16px; }
.gp-sec { padding: 20px 22px; }
.gp-sec h2 { font-size: 21px; font-weight: 900; margin: 4px 0 14px; }
.gp-wide { grid-column: 1 / -1; }
.gp-cmp { display: grid; gap: 12px; }
.gp-cmp span { font-size: 13px; color: var(--ink2); }
.gp-bar { display: flex; align-items: center; gap: 10px; margin-top: 5px; }
.gp-bar i { display: block; height: 12px; border-radius: 999px; }
.gp-bar::before { content: ''; }
.gp-bar b { font: 900 20px Georgia, serif; color: var(--navy); }
.gp-note { font-size: 12.5px; color: var(--ink3); line-height: 1.7; margin: 12px 0 0; }
.gp-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
.gp-table th { text-align: left; font-weight: 700; color: var(--ink3); font-size: 12px; padding: 6px 4px; border-bottom: 1px solid var(--line); }
.gp-table td { padding: 7px 4px; border-bottom: 1px solid var(--line); }
.gp-table b { font-family: Georgia, serif; }
.gp-lessons { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.gp-lessons li { display: flex; gap: 10px; align-items: center; font-size: 14px; }
.gp-lessons .t { font: 700 12.5px ui-monospace, Menlo, monospace; color: var(--gold); width: 46px; flex-shrink: 0; }
.gp-can { margin: 0; padding-left: 18px; display: grid; gap: 7px; font-size: 14px; line-height: 1.65; color: var(--navy2); }
.gp-jobs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 10px; }
.gp-job { display: grid; gap: 2px; padding: 12px 14px; border-radius: 12px; background: #fff; border: 1px solid var(--line); transition: border-color .15s; }
.gp-job:hover { border-color: var(--gold); }
.gp-job b { font-size: 14px; }
.gp-job span { font-size: 13px; color: var(--ink2); line-height: 1.5; }
.gp-job em { font-style: normal; font-size: 12px; color: var(--ink3); }
`;
