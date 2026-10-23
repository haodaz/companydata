'use client';

/**
 * 学生端 · 一位 AI 学员看自己的这门课（2026-10-23，用户：AI 视角不要带教务侧导航，只看课程章节内容卡就够了）。
 * 没有管理动作：立绘、这门课是什么、每一章的卡（这一章要做什么、老师傅的关键动作我做到几个、入学考 / 毕业考、我记下的要点、我的错题）、真活、去向。
 * 数据走教务接口（要内部登录），路径 /college/s/<学籍 id>。
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Portrait } from '@/app/college/admin/Portrait';

export default function StudentView() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { fetch(`/api/college/admin/enrollments/${id}`, { cache: 'no-store' }).then(r => r.json()).then(j => (j.ok ? setD(j.data) : setErr(j.error))).catch(e => setErr(e.message)); }, [id]);
  if (err) return <div className="col-main" style={{ padding: 40, color: '#b42318' }}>{err}</div>;
  if (!d) return <div className="col-main" style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)' }}>正在翻开我的学籍…</div>;
  const nb = d.notebook || {};
  const passed = d.chapters.filter((c: any) => c.passed).length;
  const status = d.status === 'graduated' ? '已毕业' : d.status === 'remedial' ? '补训中' : d.status === 'examining' ? '考核中' : d.status === 'training' ? '实训中' : '已入学';
  return (
    <div className="sv">
      <style>{CSS}</style>
      <header className="sv-head">
        <Portrait src={d.course?.avatar} hero h={260} />
        <div className="sv-id">
          <div className="sv-eyebrow">{d.course?.research ? 'School of Research' : 'School of Professions'} · {d.student_name}</div>
          <h1>{d.nova_name} <span className={`sv-status${d.status === 'graduated' ? ' ok' : ''}`}>{status}</span></h1>
          <div className="sv-course">{d.course?.role}{d.course?.company ? ` · ${d.course.company}` : ''}</div>
          <div className="sv-teacher">{d.teacher ? (d.teacher.expert ? `师承 ${d.teacher.expert_name}${d.teacher.place ? `（${d.teacher.place}）` : ''} · ${d.teacher.rules} 条判断规则` : `技能卡为 AI 草案，等老师傅校正 · ${d.teacher.rules} 条判断规则`) : '还没有老师傅'}</div>
          <div className="sv-nums">
            <div><b>{d.entrance_score ?? '—'}</b><span>入学考</span></div><div><b>{d.final_score ?? '—'}</b><span>毕业考</span></div>
            <div><b>{passed}/{d.chapters.length}</b><span>通过章节</span></div><div><b>{(nb.rules || []).length}</b><span>学到的规则</span></div>
            {d.work.length > 0 && <div><b>{Math.round(d.work[d.work.length - 1].score)}</b><span>真活{d.work[d.work.length - 1].baseline != null ? ` · 基线 ${d.work[d.work.length - 1].baseline}` : ''}</span></div>}
          </div>
        </div>
      </header>

      <section className="sv-sec">
        <div className="sv-sec-h"><span className="sv-eyebrow">My Day · 这门课的一天</span><h2>每一章，我做了什么、差在哪</h2></div>
        <div className="sv-cards">
          {d.chapters.map((c: any) => {
            const l = c.latest.find((x: any) => x.after) || c.latest[0];
            const points: string[] = nb.lessons?.[c.id] || [];
            const mistakes = (nb.mistakes || []).filter((m: any) => m.chapter_id === c.id);
            return (
              <article key={c.id} className={`sv-card${c.passed ? ' ok' : c.after != null ? ' bad' : ''}`}>
                <div className="sv-card-top"><span className="sv-slot">{c.slot || `第 ${c.seq} 章`}</span>{c.kind === 'assessment' && <span className="sv-tag">考核章</span>}{c.kind === 'incident' && <span className="sv-tag">突发</span>}{c.bench && <span className="sv-tag">工位</span>}</div>
                <h3>{c.title}</h3>
                <div className="sv-scores">
                  <div><i>入学考</i><b>{c.before ?? '—'}</b></div>
                  <div><i>毕业考</i><b className={c.passed ? 'ok' : c.after != null ? 'bad' : ''}>{c.after ?? '—'}</b></div>
                  {l?.moves && <div><i>老师傅的关键动作</i><b className={l.moves.done * 2 < l.moves.total ? 'bad' : ''}>{l.moves.done}/{l.moves.total}</b></div>}
                </div>
                {l?.missed?.length > 0 && !c.passed && <div className="sv-missed"><i>我没做到的</i><ul>{l.missed.slice(0, 3).map((m: string, i: number) => <li key={i}>{m}</li>)}</ul></div>}
                {points.length > 0 && <div className="sv-notes"><i>上课记下的要点</i><ul>{points.slice(0, 4).map((p, i) => <li key={i}>{p}</li>)}</ul>{points.length > 4 && <small>还有 {points.length - 4} 条</small>}</div>}
                {mistakes.length > 0 && <div className="sv-mistake"><i>错题本</i>{mistakes[mistakes.length - 1].lesson}</div>}
                {!points.length && c.after == null && <div className="sv-todo">还没上到这一章</div>}
              </article>
            );
          })}
        </div>
      </section>

      {(nb.rules || []).length > 0 && (
        <section className="sv-sec">
          <div className="sv-sec-h"><span className="sv-eyebrow">Rules I learned · 我记住的规则</span><h2>错了之后，我给自己定的规矩</h2></div>
          <ol className="sv-rules">{nb.rules.map((r: string, i: number) => <li key={i}>{r}</li>)}</ol>
        </section>
      )}

      {d.work.length > 0 && (
        <section className="sv-sec">
          <div className="sv-sec-h"><span className="sv-eyebrow">Real Work · 真活</span><h2>企业真实的活，我做了一遍</h2></div>
          <div className="sv-cards">{d.work.map((w: any) => <article key={w.id} className="sv-card work"><div className="sv-card-top"><span className="sv-slot">{w.company}</span><span className="sv-tag">{w.role}</span></div><h3>{w.title}</h3><div className="sv-scores"><div><i>我的分</i><b className={w.score >= 60 ? 'ok' : 'bad'}>{Math.round(w.score)}</b></div>{w.baseline != null && <div><i>最强模型基线</i><b>{Math.round(w.baseline)}</b></div>}{w.baseline != null && <div><i>差距</i><b className={w.score - w.baseline < 0 ? 'bad' : 'ok'}>{Math.round(w.score - w.baseline)}</b></div>}</div>{w.summary && <div className="sv-mistake"><i>评卷说</i>{w.summary}</div>}</article>)}</div>
        </section>
      )}

      {d.placements.length > 0 && (
        <section className="sv-sec">
          <div className="sv-sec-h"><span className="sv-eyebrow">Where I go · 去向</span><h2>毕业之后，我去哪</h2></div>
          <div className="sv-places">{d.placements.map((p: any) => <div key={p.id} className="sv-place"><b>{p.target_name}</b><span>{p.kind_label} · {p.status_label}</span>{p.note && <small>{p.note}</small>}</div>)}</div>
        </section>
      )}
      <footer className="sv-foot">百业学院 · Baiye AI College · 学生是 AI，考的是真活</footer>
    </div>
  );
}

const CSS = `
.ca-por { display: inline-block; position: relative; aspect-ratio: 5 / 6; overflow: hidden; flex-shrink: 0; vertical-align: middle; }
.ca-por img { position: absolute; left: 50%; top: 0; width: 100%; height: auto; transform: translateX(-50%); filter: drop-shadow(0 10px 18px rgba(22,32,74,.22)); }
.ca-por.ph { display: inline-grid; place-items: center; } .ca-por.ph img { position: static; width: 60%; transform: none; opacity: .6; filter: none; }
.sv { max-width: 1120px; margin: 0 auto; padding: 56px clamp(16px, 4vw, 40px) 80px; color: var(--navy); }
.sv-eyebrow { font: 700 12px/1.4 var(--en); letter-spacing: .24em; color: var(--gold); text-transform: uppercase; }
.sv-head { display: flex; gap: 32px; align-items: flex-end; padding: 0 0 28px; border-bottom: 1.5px solid var(--navy); margin-bottom: 36px; }
.sv-head .ca-por.hero { height: 260px; margin: 0 0 -28px; }
.sv-id h1 { font-family: var(--serif); font-size: 40px; font-weight: 900; margin: 8px 0 6px; letter-spacing: .03em; display: flex; align-items: center; gap: 14px; }
.sv-status { font: 700 13px var(--en), 'PingFang SC', sans-serif; letter-spacing: .04em; padding: 3px 12px; border-radius: 999px; background: rgba(176,141,87,.16); color: #6b4e1f; }
.sv-status.ok { background: rgba(18,160,107,.13); color: #0b6b47; }
.sv-course { font-size: 17px; font-weight: 700; color: var(--navy2); }
.sv-teacher { font-size: 14px; color: var(--ink2); margin-top: 6px; }
.sv-nums { display: flex; gap: 28px; margin-top: 18px; flex-wrap: wrap; }
.sv-nums b { display: block; font-family: var(--serif); font-size: 30px; font-weight: 900; font-variant-numeric: tabular-nums; } .sv-nums span { font-size: 12.5px; color: var(--ink2); font-weight: 600; }
.sv-sec { margin-bottom: 40px; }
.sv-sec-h h2 { font-family: var(--serif); font-size: 26px; font-weight: 900; margin: 6px 0 16px; letter-spacing: .02em; }
.sv-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.sv-card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; position: relative; box-shadow: 0 12px 30px -24px rgba(22,32,74,.25); }
.sv-card::before { content: ''; position: absolute; left: 18px; right: 18px; top: 0; height: 2px; background: linear-gradient(90deg, transparent, rgba(176,141,87,.6), transparent); }
.sv-card.ok::before { background: linear-gradient(90deg, transparent, rgba(18,160,107,.6), transparent); } .sv-card.bad::before { background: linear-gradient(90deg, transparent, rgba(180,35,24,.55), transparent); }
.sv-card-top { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.sv-slot { font: 700 12px var(--en); letter-spacing: .08em; color: var(--gold); }
.sv-tag { font-size: 11.5px; font-weight: 700; color: var(--navy2); background: rgba(22,32,74,.07); border-radius: 999px; padding: 1px 8px; }
.sv-card h3 { font-family: var(--serif); font-size: 18px; font-weight: 800; margin: 0 0 10px; }
.sv-scores { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 10px; }
.sv-scores i { display: block; font-style: normal; font-size: 11.5px; color: var(--ink2); font-weight: 600; } .sv-scores b { font-family: var(--serif); font-size: 22px; font-weight: 900; }
.sv-scores b.ok { color: #0d7a52; } .sv-scores b.bad { color: #b42318; }
.sv-missed, .sv-notes, .sv-mistake, .sv-todo { font-size: 13px; line-height: 1.7; color: var(--navy2); border-top: 1px dashed var(--line); padding-top: 8px; margin-top: 8px; }
.sv-missed i, .sv-notes i, .sv-mistake i { display: block; font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--gold); letter-spacing: .06em; margin-bottom: 3px; }
.sv-missed i { color: #b42318; }
.sv-notes ul, .sv-missed ul { margin: 0; padding-left: 18px; } .sv-notes small { color: var(--ink3); }
.sv-todo { color: var(--ink3); }
.sv-rules { margin: 0; padding-left: 22px; font-size: 14.5px; line-height: 1.9; color: var(--navy2); } .sv-rules li { margin-bottom: 8px; }
.sv-places { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.sv-place { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.sv-place b { display: block; font-family: var(--serif); font-size: 17px; } .sv-place span { display: block; font-size: 13px; color: var(--ink2); margin-top: 3px; } .sv-place small { display: block; font-size: 12.5px; color: var(--ink3); margin-top: 4px; }
.sv-foot { margin-top: 40px; text-align: center; font: italic 400 13px var(--en); color: var(--ink3); }
@media (max-width: 760px) { .sv-head { flex-direction: column; align-items: flex-start; } .sv-id h1 { font-size: 30px; } }
`;
