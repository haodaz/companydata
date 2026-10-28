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

const grade = (v: number) => (v >= 85 ? { t: '优秀', c: '#12a150' } : v >= 70 ? { t: '良好', c: '#2f80ed' } : v >= 60 ? { t: '合格', c: '#b7791f' } : { t: '待提升', c: '#8c8c8c' });

export default function CardPage() {
  const { token } = useParams<{ token: string }>();
  const sid = useSearchParams().get('s') || '';
  const [d, setD] = useState<{ task: any; s: any } | null>(null);
  const [err, setErr] = useState('');
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
  if (!d) return <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>成绩单生成中…</div>;
  const r = d.s.report.result, cmp = d.s.report.compare;
  const g = grade(r.total);
  const rows = (r.items || []).map((i: any) => ({ title: String(i.title), score: Number(i.score) || 0, base: cmp?.items?.find((x: any) => x.id === i.id)?.baseline }));
  const when = new Date(d.s.submitted_at || d.s.started_at || Date.now());
  const code = `ZH-${String(d.s.id).replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const link = typeof location !== 'undefined' ? location.href : '';
  return (
    <div className="zc-bg">
      <style>{CSS}</style>
      <div className="zc-actions">
        <button onClick={() => window.print()}>打印 / 存成 PDF</button>
        <button onClick={() => { navigator.clipboard.writeText(link); }}>复制分享链接</button>
        <a href={`/work/${token}?s=${sid}`}>看完整报告 →</a>
      </div>
      <div className="zc-card">
        <div className="zc-top"><WorkLogo size="md" href={null} /><span className="zc-kind">真活成绩单</span></div>
        <div className="zc-name">{d.s.participant?.name || '候选人'}</div>
        <div className="zc-task">完成了一道真活：<b>{d.task.task?.title}</b></div>
        <div className="zc-meta">{[d.task.company_name, d.task.role].filter(Boolean).join(' · ')}</div>
        <div className="zc-mid">
          <div className="zc-score">
            <div className="zc-num" style={{ color: g.c }}>{r.total}<span>/100</span></div>
            <div className="zc-grade" style={{ background: g.c }}>{g.t}</div>
            {cmp && <div className="zc-base">同一道任务 AI 基线 {cmp.baseline_total} 分</div>}
          </div>
          {rows.length >= 3 && rows.length <= 10 && <div className="zc-radar"><Radar rows={rows} /></div>}
        </div>
        {!!r.strengths?.length && <div className="zc-sec"><div className="zc-h">做得好的地方</div><ul>{r.strengths.slice(0, 3).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
        <div className="zc-foot">
          <div>完成于 {when.toLocaleDateString('zh-CN')} · 验证码 {code}</div>
          <div>任务来自企业的真实业务问题，评分逐条对照评分标准并留有证据 · 百业AI｜真活 www.aidataoffice.com</div>
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
.zc-grade { display: inline-block; margin-top: 10px; color: #fff; font-weight: 800; padding: 4px 14px; border-radius: 999px; font-size: 14px; letter-spacing: .1em; }
.zc-base { margin-top: 10px; font-size: 13px; color: #8a8ea3; }
.zc-sec { border-top: 1px solid #f0f0f6; padding-top: 14px; margin-top: 6px; }
.zc-h { font-size: 12px; letter-spacing: .2em; color: #8a8ea3; font-weight: 700; margin-bottom: 6px; }
.zc-sec ul { margin: 0; padding-left: 18px; line-height: 1.85; font-size: 14px; color: #3b405a; }
.zc-foot { margin-top: 22px; padding-top: 12px; border-top: 1px dashed #e3e2f3; font-size: 12px; color: #9a9db0; line-height: 1.8; }
@media (max-width: 620px) { .zc-card { padding: 26px 20px 22px; } .zc-mid { grid-template-columns: 1fr; } .zc-name { font-size: 28px; } .zc-num { font-size: 60px; } }
@media print { .zc-bg { background: #fff; padding: 0; } .zc-actions { display: none; } .zc-card { box-shadow: none; border: 0; } }
`;
