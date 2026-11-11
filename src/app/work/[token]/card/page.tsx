'use client';

/**
 * 真活成绩单（2026-10-28）：候选人交卷、出报告后可以拿走的一页——名字、做的哪道任务、总分和等级、逐条雷达、做得好的地方、日期、验证码。
 * 可分享（链接即凭证，和报告链接同一套权限）、可打印存 PDF。候选人愿意做，任务才发得出去；成绩单也是真活的传播入口。
 *   /work/<token>/card?s=<作答编号>
 */
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Radar } from '@/components/work/WorkReport';
import { WorkLogo } from '@/components/work/WorkLogo';
import { aiItemL, pick, type Lang } from '@/lib/work/i18n';
import { noAiLabel } from '@/lib/work/scale';
import { useWorkScale } from '@/lib/work/scale-client';
import { roleLabel } from '@/lib/work/role-label';

const grade = (v: number, lang?: Lang) => (v >= 85 ? { t: pick(lang, '优秀', 'Excellent'), c: '#12a150' } : v >= 70 ? { t: pick(lang, '良好', 'Good'), c: '#2f80ed' } : v >= 60 ? { t: pick(lang, '合格', 'Pass'), c: '#b7791f' } : { t: pick(lang, '待提升', 'Developing'), c: '#8c8c8c' });
/** 英文题显示企业英文名（同作答页） */
const enCompany = (n: string) => { const m = /[（(]\s*([A-Za-z][^（）()]*?)\s*[）)]/.exec(n || ''); return m ? m[1] : n; };

export default function CardPage() {
  const { token } = useParams<{ token: string }>();
  const sid = useSearchParams().get('s') || '';
  const [d, setD] = useState<{ task: any; s: any } | null>(null);
  const [err, setErr] = useState('');
  const scale = useWorkScale();
  useEffect(() => {
    (async () => {
      try {
        const [t, s] = await Promise.all([fetch(`/api/work/${token}`).then(r => r.json()), fetch(`/api/work/${token}/sessions/${sid}`).then(r => r.json())]);
        if (!t.ok) throw new Error(t.error || '任务不可用'); if (!s.ok) throw new Error(s.error || '没有这次作答');
        if (!s.session.report?.result) throw new Error('这次作答还没有出报告');
        setD({ task: t.task, s: s.session });
      } catch (e: any) { setErr(e.message); }
    })();
  }, [token, sid]);
  if (err) return <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>{err}</div>;
  if (!d || !scale) return <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>成绩单生成中…</div>;
  // 英文题（11-10）：成绩单整页英文
  const lang: Lang | undefined = d.task.task?.lang; const L = (zh: string, en: string) => pick(lang, zh, en);
  if (lang === 'en' && typeof document !== 'undefined') document.title = `${d.task.task?.title} · Score card`;
  const ai = scale === 'ai_use', u = d.s.report.ai_use;   // 平台选了「AI 使用与交互」：主分和雷达都换成 AI 使用
  const r = d.s.report.result, cmp = ai ? null : d.s.report.compare;
  const main: number | null = ai ? u?.score ?? null : r.total;
  const g = grade(main ?? 0, lang);
  const rows = ai ? (u?.items || []).filter((i: any) => i.score != null).map((i: any) => ({ title: aiItemL(i.key, i.title, lang), score: Number(i.score) || 0 })) : (r.items || []).map((i: any) => ({ title: String(i.title), score: Number(i.score) || 0, base: cmp?.items?.find((x: any) => x.id === i.id)?.baseline }));
  const when = new Date(d.s.submitted_at || d.s.started_at || Date.now());
  const company = lang === 'en' ? enCompany(d.task.company_name) : d.task.company_name;
  const code = `ZH-${String(d.s.id).replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const link = typeof location !== 'undefined' ? location.href : '';
  return (
    <div className="zc-bg">
      <style>{CSS}</style>
      <div className="zc-actions">
        <button onClick={() => window.print()}>{L('打印 / 存成 PDF', 'Print / save as PDF')}</button>
        <button onClick={() => { navigator.clipboard.writeText(link); }}>{L('复制分享链接', 'Copy share link')}</button>
        <a href={`/work/${token}?s=${sid}`}>{L('看完整报告 →', 'Full report →')}</a>
      </div>
      <div className="zc-card">
        <div className="zc-top"><WorkLogo size="md" href={null} /><span className="zc-kind">{L('真活成绩单', 'WORK SAMPLE SCORE CARD')}</span></div>
        <div className="zc-name">{d.s.participant?.name || L('候选人', 'Candidate')}</div>
        <div className="zc-task">{L('完成了一道真活：', 'Completed a work sample: ')}<b>{d.task.task?.title}</b></div>
        <div className="zc-meta">{[company, lang === 'en' ? roleLabel(d.task.role, d.task.task?.role, 'en') : d.task.role].filter(Boolean).join(' · ')}</div>
        <div className="zc-mid">
          <div className="zc-score">
            {main == null ? <div className="zc-num" style={{ color: '#8c8c8c', fontSize: 30 }}>{noAiLabel(u, L)}</div> : <><div className="zc-num" style={{ color: g.c }}>{main}<span>/100</span></div>
            <div className="zc-grade" style={{ background: g.c }}>{g.t}</div></>}
            {ai && <div className="zc-base">{L('AI 使用与交互', 'AI use and interaction')}</div>}
            {cmp && <div className="zc-base">{L(`同一道任务 AI 基线 ${cmp.baseline_total} 分`, `AI baseline on the same task: ${cmp.baseline_total}`)}</div>}
          </div>
          {rows.length >= 3 && rows.length <= 10 && <div className="zc-radar"><Radar rows={rows} /></div>}
        </div>
        {d.s.report.ai_use?.score != null && <div className="zc-sec"><div className="zc-h">{L('AI 使用能力', 'AI use')} · <b style={{ color: '#6055f5' }}>{d.s.report.ai_use.score}</b> / 100</div>
          <div className="zc-ai">{(d.s.report.ai_use.items || []).map((i: any) => <span key={i.key}>{aiItemL(i.key, i.title, lang)} <b>{i.score ?? L('未观测', 'n/a')}</b></span>)}</div>
          {d.s.report.ai_use.verdict && <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{d.s.report.ai_use.verdict}</div>}</div>}
        {ai && main == null && u?.verdict && <div className="zc-sec"><div style={{ fontSize: 13, color: '#555' }}>{u.verdict}</div></div>}
        {!ai && !!r.strengths?.length && <div className="zc-sec"><div className="zc-h">{L('做得好的地方', 'What went well')}</div><ul>{r.strengths.slice(0, 3).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
        <div className="zc-foot">
          <div>{L('完成于', 'Completed')} {when.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN')} · {L('验证码', 'Verification code')} {code}</div>
          <div>{ai ? L('任务来自企业的真实业务问题，AI 使用逐项打分并留有证据', 'The task comes from a real business problem at the company; AI use is scored item by item with evidence') : L('任务来自企业的真实业务问题，评分逐条对照评分标准并留有证据', 'The task comes from a real business problem at the company; each criterion is scored against a rubric with evidence')} · {L('百业AI｜真活', 'Baiye AI · True Work')} www.aidataoffice.com</div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.zc-bg { min-height: 100vh; background: linear-gradient(160deg, #f4f2ff, #eef9fb); padding: 28px 16px 60px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1a1a2e; }
.zc-actions { max-width: 760px; margin: 0 auto 14px; display: flex; gap: 10px; flex-wrap: wrap; }
.zc-actions button, .zc-actions a { border: 1px solid #d8d4ff; background: #fff; color: #4c43c9; border-radius: 10px; padding: 8px 14px; font: inherit; font-size: 14px; cursor: pointer; text-decoration: none; }
.zc-actions a { margin-left: auto; border-color: transparent; background: transparent; }
.zc-card { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 22px; padding: 34px 40px 28px; box-shadow: 0 30px 60px -40px rgba(76,67,201,.45); border: 1px solid #ebe9fb; position: relative; overflow: hidden; }
.zc-card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 6px; background: linear-gradient(90deg, #6055f5, #12b5cb); }
.zc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.zc-kind { font-size: 13px; letter-spacing: .3em; color: #6055f5; font-weight: 800; }
.zc-name { font-size: 34px; font-weight: 900; letter-spacing: .02em; }
.zc-task { margin-top: 6px; font-size: 16px; color: #3b405a; }
.zc-meta { margin-top: 2px; font-size: 13px; color: #8a8ea3; }
.zc-mid { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.2fr); gap: 18px; align-items: center; margin: 22px 0 10px; }
.zc-num { font-size: 72px; font-weight: 900; line-height: 1; } .zc-num span { font-size: 18px; color: #9a9db0; font-weight: 600; margin-left: 4px; }
.zc-ai { display: flex; gap: 8px; flex-wrap: wrap; font-size: 13px; } .zc-ai span { padding: 2px 10px; border-radius: 999px; background: #f4f3ff; color: #4c43c9; }
.zc-grade { display: inline-block; margin-top: 10px; color: #fff; font-weight: 800; padding: 4px 14px; border-radius: 999px; font-size: 14px; letter-spacing: .1em; }
.zc-base { margin-top: 10px; font-size: 13px; color: #8a8ea3; }
.zc-sec { border-top: 1px solid #f0f0f6; padding-top: 14px; margin-top: 6px; }
.zc-h { font-size: 12px; letter-spacing: .2em; color: #8a8ea3; font-weight: 700; margin-bottom: 6px; }
.zc-sec ul { margin: 0; padding-left: 18px; line-height: 1.85; font-size: 14px; color: #3b405a; }
.zc-foot { margin-top: 22px; padding-top: 12px; border-top: 1px dashed #e3e2f3; font-size: 12px; color: #9a9db0; line-height: 1.8; }
@media (max-width: 620px) { .zc-card { padding: 26px 20px 22px; } .zc-mid { grid-template-columns: 1fr; } .zc-name { font-size: 28px; } .zc-num { font-size: 60px; } }
@media print { .zc-bg { background: #fff; padding: 0; } .zc-actions { display: none; } .zc-card { box-shadow: none; border: 0; } }
`;
