'use client';

/**
 * 百业学院 · 成绩单（2026-10-28，公开）：一个学员 = 一个大模型。修过的课、学分、入学 / 毕业成绩、等级、授课老师傅、专业进度、平均绩点。
 * 版式照正式成绩单：院徽、衬线、细金线；可打印存 PDF。数据 /api/college/transcript/<学员>。
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Transcript } from '@/lib/college-transcript';

const NICE: Record<string, string> = { 'deepseek-v4-pro': 'DeepSeek V4 Pro' };
const clean = (s: string) => NICE[s] || s.replace(/[（(][^）)]*[）)]/g, '').trim();
const ST: Record<string, string> = { graduated: '已毕业', examining: '在考', training: '在读', remedial: '补训', enrolled: '已入学' };

export default function TranscriptPage() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<Transcript | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetch(`/api/college/transcript/${id}`).then(r => r.json()).then(j => (j.ok ? setT(j) : setErr(j.error))).catch(e => setErr(String(e?.message || e))); }, [id]);
  if (err) return <div style={{ padding: 80, textAlign: 'center', color: 'var(--ink3)' }}>{err}</div>;
  if (!t) return <div style={{ padding: 80, textAlign: 'center', color: 'var(--ink3)' }}>成绩单读取中…</div>;
  const done = t.majors.filter(m => m.done);
  return (
    <div className="tr-bg">
      <style>{CSS}</style>
      <div className="tr-actions"><Link href="/college/leaderboard">← 能力榜</Link><span style={{ flex: 1 }} /><button onClick={() => window.print()}>打印 / 存成 PDF</button></div>
      <article className="tr-doc">
        <header className="tr-head">
          <img src="/college/crest.svg" alt="百业学院院徽" />
          <div><div className="tr-school">百业学院 · 教务处</div><div className="tr-school-en">THE ONLINE COLLEGE FOR AI · OFFICE OF THE REGISTRAR</div></div>
          <div className="tr-kind">成绩单<span>Academic Transcript</span></div>
        </header>
        <section className="tr-who">
          <div><span>学员</span><b>{clean(t.student.model)}</b></div>
          <div><span>出自</span><b>{t.student.provider || '—'}</b></div>
          <div><span>已获学分</span><b>{t.credits}</b></div>
          <div><span>平均绩点</span><b>{t.gpa ?? '—'}<em> / 4</em></b></div>
        </section>
        {!!done.length && <div className="tr-major">修完专业：{done.map(m => <b key={m.key}>{m.name}<i>{m.en}</i></b>)}</div>}
        <table className="tr-t">
          <thead><tr><th>课程（职业）</th><th>专业</th><th className="n">学分</th><th className="n">入学</th><th className="n">毕业</th><th className="n">等级</th><th>授课老师傅</th><th>状态</th></tr></thead>
          <tbody>{t.courses.map(c => (
            <tr key={c.enrollment_id}>
              <td><Link href={`/college/g/${c.enrollment_id}`} className="tr-c">{c.role}</Link><div className="tr-co">{c.company}</div></td>
              <td className="tr-mj">{c.major || '—'}</td>
              <td className="n">{c.credits}</td>
              <td className="n mute">{c.before ?? '—'}</td>
              <td className="n"><b>{c.after ?? '—'}</b></td>
              <td className={`n gr g${c.grade}`}>{c.grade}</td>
              <td className="tr-tch">{c.teacher}</td>
              <td className="tr-st">{ST[c.status] || c.status}</td>
            </tr>
          ))}</tbody>
        </table>
        <section className="tr-prog">
          <div className="tr-h">专业进度 · Programs</div>
          <div className="tr-pg">{t.majors.map(m => (
            <div key={m.key} className={m.done ? 'ok' : ''}><b>{m.name}</b><span>{m.done ? `${m.passed} 门及格 · 已修完` : `${m.passed} / 2 门及格`}</span><div className="tr-bar"><i style={{ width: `${Math.min(100, m.passed / 2 * 100)}%` }} /></div></div>
          ))}</div>
        </section>
        <footer className="tr-foot">
          <div>入学 = 入学考（裸考，什么都没装）；毕业 = 装了老师傅技能卡、上课要点与错题本后的毕业考。等级：A ≥ 90，B ≥ 80，C ≥ 70，D ≥ 60。学分 = 课程章节数，毕业考及格才计入。同一专业 2 门及格即修完该专业。</div>
          <div className="tr-sign"><span>平方创想 × 方略研究院</span><span>签发于 {new Date().toLocaleDateString('zh-CN')}</span></div>
        </footer>
      </article>
    </div>
  );
}

const CSS = `
.tr-bg { background: var(--ivory, #f7f4ec); min-height: 100vh; padding: 28px 16px 70px; }
.tr-actions { max-width: 1000px; margin: 0 auto 12px; display: flex; align-items: center; gap: 10px; font-size: 14px; }
.tr-actions a { color: var(--navy); text-decoration: none; } .tr-actions button { border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 7px 16px; font: inherit; cursor: pointer; color: var(--navy); }
.tr-doc { max-width: 1000px; margin: 0 auto; background: #fffdf7; border: 1px solid rgba(176,141,87,.45); box-shadow: 0 0 0 6px #fffdf7, 0 0 0 7px rgba(176,141,87,.35), 0 30px 60px -40px rgba(22,32,74,.4); padding: 36px 44px 30px; color: var(--navy); }
.tr-head { display: flex; align-items: center; gap: 16px; padding-bottom: 18px; border-bottom: 2px solid var(--navy); }
.tr-head img { width: 64px; height: 64px; }
.tr-school { font-family: var(--serif); font-size: 24px; font-weight: 900; letter-spacing: .08em; }
.tr-school-en { font: 600 10.5px var(--en); letter-spacing: .2em; color: var(--gold); margin-top: 4px; }
.tr-kind { margin-left: auto; text-align: right; font-family: var(--serif); font-size: 26px; font-weight: 900; letter-spacing: .3em; }
.tr-kind span { display: block; font: italic 13px var(--en); letter-spacing: .04em; color: var(--ink2); font-weight: 400; }
.tr-who { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-bottom: 1px solid var(--line); }
.tr-who > div { padding: 14px 4px; } .tr-who span { display: block; font-size: 11.5px; letter-spacing: .2em; color: var(--ink3); }
.tr-who b { font-family: var(--serif); font-size: 22px; } .tr-who em { font-style: normal; font-size: 13px; color: var(--ink3); margin-left: 2px; }
.tr-major { margin: 14px 0 4px; font-size: 14px; color: var(--ink2); display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; }
.tr-major b { color: var(--navy); background: rgba(176,141,87,.14); padding: 3px 10px; border-radius: 6px; font-family: var(--serif); }
.tr-major i { font: italic 11.5px var(--en); color: var(--ink3); margin-left: 6px; font-weight: 400; }
.tr-t { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13.5px; }
.tr-t th { text-align: left; font: 700 11px var(--en), sans-serif; letter-spacing: .14em; color: var(--ink3); padding: 8px 8px; border-bottom: 1px solid var(--navy); }
.tr-t td { padding: 10px 8px; border-bottom: 1px solid rgba(22,32,74,.08); vertical-align: top; }
.tr-t .n { text-align: right; font-variant-numeric: tabular-nums; } .tr-t .mute { color: var(--ink3); }
.tr-c { font-family: var(--serif); font-weight: 800; color: var(--navy); text-decoration: none; } .tr-c:hover { color: var(--gold); }
.tr-co { font-size: 11.5px; color: var(--ink3); } .tr-mj { font-size: 12.5px; color: var(--ink2); } .tr-tch { font-size: 12.5px; color: var(--ink2); max-width: 200px; } .tr-st { font-size: 12.5px; color: var(--ink2); white-space: nowrap; }
.gr { font-family: var(--serif); font-weight: 900; font-size: 16px; } .gA { color: #0d7a52; } .gB { color: #2f6db5; } .gC { color: var(--gold); } .gD { color: #b7791f; } .gF { color: #b42318; }
.tr-prog { margin-top: 22px; } .tr-h { font: 700 11.5px var(--en); letter-spacing: .2em; color: var(--gold); margin-bottom: 10px; }
.tr-pg { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.tr-pg > div { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-size: 13px; } .tr-pg b { display: block; font-family: var(--serif); } .tr-pg span { color: var(--ink2); font-size: 12px; }
.tr-pg .ok { border-color: rgba(13,122,82,.4); background: rgba(13,122,82,.04); }
.tr-bar { height: 5px; border-radius: 3px; background: rgba(22,32,74,.07); margin-top: 6px; overflow: hidden; } .tr-bar i { display: block; height: 100%; background: var(--gold); } .tr-pg .ok .tr-bar i { background: #0d7a52; }
.tr-foot { margin-top: 26px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink3); line-height: 1.8; }
.tr-sign { display: flex; justify-content: space-between; margin-top: 10px; font-family: var(--serif); color: var(--navy); font-size: 13.5px; }
@media (max-width: 720px) { .tr-doc { padding: 24px 16px; } .tr-who { grid-template-columns: 1fr 1fr; } .tr-t { font-size: 12.5px; } .tr-tch, .tr-t th:nth-child(7), .tr-mj, .tr-t th:nth-child(2) { display: none; } .tr-kind { font-size: 18px; } }
@media print { .tr-bg { background: #fff; padding: 0; } .tr-actions { display: none; } .tr-doc { box-shadow: none; border: 0; } }
`;
