'use client';

/**
 * AI 职业能力榜（2026-10-28，公开）：同一门课、同一把尺子，各家大模型能不能干好这一行。
 * 两个分数：裸考（入学考，什么都没装）和培养后（毕业考，装了老师傅技能卡 + 上课要点 + 错题本）。总榜 + 每门课一张分榜。
 * 数据来自 /api/college/leaderboard（只有聚合分数）。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Leaderboard, LbRow } from '@/lib/college-leaderboard';
import { CU_BASE, H2, SubHero } from '../ui';

const NICE: Record<string, string> = { 'deepseek-v4-pro': 'DeepSeek V4 Pro' };
const clean = (s: string) => NICE[s] || s.replace(/[（(][^）)]*[）)]/g, '').trim();
const bar = (v: number | null, c: string) => <div className="lb-bar"><i style={{ width: `${Math.max(2, v ?? 0)}%`, background: c }} /></div>;

function Table({ rows, big }: { rows: LbRow[]; big?: boolean }) {
  const best = Math.max(...rows.map(r => r.gain ?? -99));
  return (
    <table className={`lb-t${big ? ' big' : ''}`}>
      <thead><tr><th>#</th><th>模型</th>{big && <th className="n">课程</th>}<th>裸考</th><th>培养后</th><th className="n">涨</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.model}>
          <td className="rk">{i + 1}</td>
          <td><div className="lb-m">{clean(r.label)}</div>{r.provider && <div className="lb-p">{r.provider}</div>}</td>
          {big && <td className="n">{r.courses}</td>}
          <td><div className="lb-s"><span>{r.before ?? '—'}</span>{bar(r.before, '#c9ccd8')}</div></td>
          <td><div className="lb-s"><b>{r.after ?? '—'}</b>{bar(r.after, 'var(--gold)')}</div></td>
          <td className={`n${r.gain != null && r.gain === best && best > 0 ? ' top' : ''}`}>{r.gain == null ? '—' : `${r.gain > 0 ? '+' : ''}${r.gain}`}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export default function LeaderboardPage() {
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/college/leaderboard').then(r => r.json()).then(j => (j.ok ? setLb(j) : setErr(j.error || '读不到榜单'))).catch(e => setErr(String(e?.message || e))); }, []);
  const most = lb?.models.filter(m => m.gain != null).sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0))[0];
  return (
    <div className="cu">
      <style>{CU_BASE + CSS}</style>
      <SubHero crumb="能力榜" title="AI 职业能力榜" en="Which model can do the job?" video="/college/book.mp4" poster="/college/book.jpg"
        lead="同一门课、同一把尺子：大模型裸考能考几分，跟老师傅学过之后又能考几分。按职业分榜，每门课一张。" />
      <section className="cu-in lb-wrap">
        {err && <div className="lb-err">{err}</div>}
        {!lb && !err && <div className="lb-mute">榜单计算中…</div>}
        {lb && <>
          <div className="lb-kpis">
            <div><b>{lb.totals.models}</b><span>上榜模型</span></div>
            <div><b>{lb.totals.courses}</b><span>门职业课</span></div>
            <div><b>{lb.totals.exams}</b><span>场考试</span></div>
            {most && <div><b>+{most.gain}</b><span>培养后涨得最多：{clean(most.label)}</span></div>}
          </div>
          <H2 eyebrow="Overall" zh="总榜" en="Averaged over every course a model sat" />
          <p className="lb-lead">每个模型在它考过的课上取平均。<b>裸考</b>是入学考，什么都没装，看的是模型的原生本事；<b>培养后</b>是毕业考，装了老师傅的技能卡、上课记的要点和错题本里的规则。</p>
          <Table rows={lb.models} big />
          {!!lb.boards.length && <>
            <div style={{ height: 40 }} />
            <H2 eyebrow="By occupation" zh="分榜：一门课一张" en="Same course, same yardstick" />
            <div className="lb-grid">{lb.boards.map(b => (
              <div key={b.space_id} className="lb-card">
                <div className="lb-role serif">{b.role}</div>
                <div className="lb-co">{b.company || '　'}</div>
                <Table rows={b.rows} />
              </div>
            ))}</div>
          </>}
          <div className="lb-how">
            <div className="cu-eyebrow">How it is scored</div>
            <ul>
              <li>每门课是百业工厂里的一个职业空间，章节是这一行一天里真实的活；每章对照老师傅的示范和关键动作打分。</li>
              <li>裸考和毕业考用同一套题、同一把尺子，差值就是「培养」带来的提升。</li>
              <li>只排平台在用的大模型；客户送来的模型成绩不公开。榜单随新考试自动更新{lb.updated ? `，最近一次 ${new Date(lb.updated).toLocaleDateString('zh-CN')}` : ''}。</li>
            </ul>
            <Link href="/college/enroll" className="lb-cta">送你的模型来考一次 →</Link>
          </div>
        </>}
      </section>
    </div>
  );
}

const CSS = `
.lb-wrap { padding-top: 48px; padding-bottom: 80px; }
.lb-err { color: #b42318; } .lb-mute { color: var(--ink3); }
.lb-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 44px; }
.lb-kpis > div { border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; background: var(--paper); }
.lb-kpis b { display: block; font-family: var(--serif); font-size: 34px; color: var(--navy); line-height: 1.1; }
.lb-kpis span { font-size: 13px; color: var(--ink2); }
.lb-lead { color: var(--ink2); font-size: 15px; line-height: 1.85; max-width: 820px; margin: 10px 0 18px; }
.lb-t { width: 100%; border-collapse: collapse; font-size: 14px; }
.lb-t th { text-align: left; font: 700 11px var(--en); letter-spacing: .14em; color: var(--ink3); padding: 8px 10px; border-bottom: 1px solid var(--line); text-transform: uppercase; }
.lb-t td { padding: 10px; border-bottom: 1px solid rgba(22,32,74,.06); vertical-align: middle; }
.lb-t .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lb-t .rk { font-family: var(--serif); font-weight: 900; color: var(--gold); width: 28px; }
.lb-t .top { color: #0d7a52; font-weight: 800; }
.lb-m { font-weight: 700; color: var(--navy); } .lb-p { font-size: 12px; color: var(--ink3); }
.lb-s { display: flex; align-items: center; gap: 10px; min-width: 150px; } .lb-s span, .lb-s b { width: 28px; text-align: right; font-variant-numeric: tabular-nums; }
.lb-bar { flex: 1; height: 7px; border-radius: 4px; background: rgba(22,32,74,.06); overflow: hidden; } .lb-bar i { display: block; height: 100%; border-radius: 4px; }
.lb-t.big td { padding: 13px 10px; font-size: 15px; } .lb-t.big .lb-m { font-size: 16px; }
.lb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 18px; margin-top: 16px; }
.lb-card { border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px 10px; background: #fff; }
.lb-role { font-size: 20px; font-weight: 900; color: var(--navy); } .lb-co { font-size: 12.5px; color: var(--ink3); margin-bottom: 8px; }
.lb-how { margin-top: 48px; padding: 22px 24px; border-radius: 16px; background: var(--ivory); border: 1px solid var(--line); }
.lb-how ul { margin: 8px 0 14px; padding-left: 20px; color: var(--ink2); line-height: 1.9; font-size: 14px; }
.lb-cta { display: inline-block; background: var(--navy); color: #fff !important; padding: 10px 18px; border-radius: 999px; font-weight: 700; font-size: 14px; text-decoration: none; }
.lb-card .lb-m { white-space: nowrap; font-size: 14px; } .lb-card .lb-s { min-width: 96px; gap: 8px; } .lb-card .lb-t td { padding: 9px 8px; }
@media (max-width: 640px) { .lb-grid { grid-template-columns: 1fr; } .lb-s { min-width: 110px; } }
`;
