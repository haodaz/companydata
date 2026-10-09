'use client';

import React from 'react';
import { bandLevel, bandText } from '@/lib/lab-cert';

/**
 * 证书与成绩单的版式（单段证书、全天证书共用）。
 * 证书：白底 + 品牌渐变光斑 + 点阵 + 渐变等级环 + 全息认证徽章，横版 A4 比例；字号按容器宽度缩放（cqi），手机上等比缩小。
 * 成绩单：仿雅思 TRF——各维度等级一排小格，综合等级突出，下面是和老师傅一致度、超过多少人、三栏分析。
 */
export const CERT_CSS = `
.cert, .trf { container-type: inline-size; width: 100%; max-width: 1120px; margin: 0 auto; }
.cert-sheet { position: relative; aspect-ratio: 297 / 210; overflow: hidden; border-radius: 2.2cqi; color: #171a2e; background: #fff;
  box-shadow: 0 30px 80px rgba(60,50,160,.18), 0 0 0 .1cqi rgba(106,92,255,.14); font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.cert-sheet::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(48cqi 34cqi at 0% 0%, rgba(106,92,255,.20), transparent 70%), radial-gradient(44cqi 34cqi at 100% 100%, rgba(18,181,203,.18), transparent 70%), radial-gradient(30cqi 22cqi at 92% 8%, rgba(255,95,162,.10), transparent 70%); }
.cert-sheet::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .55;
  background-image: radial-gradient(rgba(106,92,255,.22) .12cqi, transparent .14cqi); background-size: 1.6cqi 1.6cqi;
  -webkit-mask-image: radial-gradient(70% 70% at 70% 40%, #000, transparent 75%); mask-image: radial-gradient(70% 70% at 70% 40%, #000, transparent 75%); }
.cert-sheet.dark { color: #eef0fb; background: #0b0d26; box-shadow: 0 30px 80px rgba(10,10,40,.45), 0 0 0 .1cqi rgba(159,145,255,.3); }
.cert-sheet.dark::before { background: radial-gradient(50cqi 36cqi at 0% 0%, rgba(106,92,255,.45), transparent 70%), radial-gradient(46cqi 36cqi at 100% 100%, rgba(18,181,203,.38), transparent 70%), radial-gradient(30cqi 24cqi at 90% 6%, rgba(255,95,162,.26), transparent 70%); }
.cert-sheet.dark::after { background-image: radial-gradient(rgba(255,255,255,.18) .12cqi, transparent .14cqi); }
.cert-bar { position: absolute; left: 0; top: 0; bottom: 0; width: .9cqi; background: linear-gradient(180deg, #6a5cff, #12b5cb 60%, #ff5fa2); z-index: 1; }
.cert-in { position: absolute; inset: 3.6cqi 4.6cqi 4.4cqi 5.6cqi; display: grid; grid-template-rows: auto 1fr auto; z-index: 1; }
.cert-mono { font-family: var(--font-geist-mono), ui-monospace, Menlo, monospace; letter-spacing: .12em; }
.cert-grad { background: linear-gradient(100deg, #6a5cff, #8f7bff 40%, #12b5cb); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.cert-sheet.dark .cert-grad { background: linear-gradient(100deg, #b4a9ff, #e7e3ff 40%, #7fe6f2); -webkit-background-clip: text; background-clip: text; }
.cert-pill { display: inline-flex; align-items: center; gap: .7cqi; padding: .55cqi 1.3cqi; border-radius: 99cqi; font-size: 1.15cqi; font-weight: 700; background: rgba(106,92,255,.09); color: #5b4ee6; box-shadow: 0 0 0 .1cqi rgba(106,92,255,.22); }
.cert-sheet.dark .cert-pill { background: rgba(255,255,255,.08); color: #d9d4ff; box-shadow: 0 0 0 .1cqi rgba(255,255,255,.2); }
.cert-ring { width: 19cqi; height: 19cqi; border-radius: 50%; padding: .9cqi; background: conic-gradient(from 210deg, #6a5cff, #12b5cb, #ff5fa2, #6a5cff); box-shadow: 0 1.6cqi 4cqi rgba(106,92,255,.28); }
.cert-ring > div { width: 100%; height: 100%; border-radius: 50%; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.cert-sheet.dark .cert-ring > div { background: #12153a; }
.cert-foot { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 2.4cqi; align-items: end; padding-top: 1.8cqi; border-top: .1cqi solid rgba(106,92,255,.18); }
.cert-sheet.dark .cert-foot { border-top-color: rgba(255,255,255,.14); }
.cert-k { font-size: 1cqi; letter-spacing: .14em; text-transform: uppercase; opacity: .55; margin-bottom: .5cqi; }
.cert-v { font-size: 1.5cqi; font-weight: 800; line-height: 1.35; }
.cert-holo { width: 8.4cqi; height: 8.4cqi; border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center; color: #fff; text-align: center;
  background: conic-gradient(from 20deg, #6a5cff, #12b5cb, #7fe6f2, #ff5fa2, #8f7bff, #6a5cff); box-shadow: 0 .8cqi 2cqi rgba(106,92,255,.3), inset 0 0 0 .35cqi rgba(255,255,255,.55); }
.cert-holo::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: linear-gradient(135deg, rgba(255,255,255,.75), transparent 45%); mix-blend-mode: soft-light; }
.trf-sheet { background: #fff; color: #1b2033; border-radius: 6px; box-shadow: 0 24px 70px rgba(30,30,80,.14); padding: 3.2cqi 3.6cqi; font-size: 1.3cqi; }
.trf-head { display: flex; align-items: flex-end; gap: 2cqi; padding-bottom: 1.4cqi; border-bottom: .3cqi solid #1b2033; }
.trf-grid { display: grid; gap: 0; border: .12cqi solid #c9cede; border-radius: .6cqi; overflow: hidden; margin-top: 1.6cqi; }
.trf-cell { padding: 1cqi 1.3cqi; border-right: .12cqi solid #c9cede; border-bottom: .12cqi solid #c9cede; min-width: 0; }
.trf-lbl { font-size: 1cqi; letter-spacing: .1em; color: #6b7290; text-transform: uppercase; margin-bottom: .4cqi; }
.trf-val { font-size: 1.55cqi; font-weight: 700; }
.trf-band { font-size: 3.6cqi; font-weight: 900; line-height: 1; font-family: var(--font-geist-mono), ui-monospace, Menlo, monospace; letter-spacing: 0; }
.trf-bar { height: .7cqi; border-radius: .4cqi; background: #e9ecf5; overflow: hidden; margin-top: .6cqi; }
.trf-bar i { display: block; height: 100%; background: linear-gradient(90deg, #6a5cff, #12b5cb); }
.trf-ana { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.4cqi; margin-top: 1.6cqi; }
.trf-ana > div { padding: 1.2cqi 1.4cqi; border-radius: .8cqi; background: #f6f7fb; line-height: 1.75; }
.trf-ana ul { margin: .4cqi 0 0; padding-left: 1.6cqi; }
.trf-scale { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .5cqi; margin-top: 1.6cqi; font-size: 1.05cqi; color: #6b7290; }
.trf-scale > div { padding: .6cqi .8cqi; border-radius: .5cqi; background: #f6f7fb; }
.trf-scale > div.on { background: #1b2033; color: #fff; }
@media (max-width: 640px) { .trf-sheet { font-size: 2.6cqi; padding: 4cqi; } .trf-ana { grid-template-columns: minmax(0, 1fr); } .trf-lbl { font-size: 2cqi; } .trf-val { font-size: 2.8cqi; } .trf-band { font-size: 6cqi; } .trf-scale { grid-template-columns: repeat(3, minmax(0, 1fr)); font-size: 2cqi; } }
@media print {
  @page { size: A4 landscape; margin: 0; }
  .lab-head, .lab-bg, .no-print { display: none !important; }
  .lab, .lab-wrap { background: #fff !important; padding: 0 !important; max-width: none !important; }
  .cert, .trf { max-width: none; }
  .cert-sheet, .trf-sheet { box-shadow: none; border-radius: 0; break-after: page; }
  .trf-sheet { min-height: 100vh; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`; };

export interface CertView {
  no: string; date: string; overall: number; level: string; candidate: { name: string; location?: string; note?: string };
  space: { id: string; name: string; role: string; avatar: string; profession: string; company?: string };
  chapter?: { n: number; total: number; slot: string; title: string; kind?: string } | null;
  skill?: { expert: string; location: string; draft: boolean } | null;
}

/** 证书本体：day = 全天证书（深色、列出每一段） */
export function Certificate({ c, day, dayList }: { c: CertView; day?: boolean; dayList?: { slot: string; title: string; band: number }[] }) {
  return (
    <div className="cert">
      <div className={`cert-sheet${day ? ' dark' : ''}`}>
        <span className="cert-bar" />
        <div className="cert-in">
          {/* 顶栏：品牌 + 已验证 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2cqi' }}>
            <span style={{ width: '3.2cqi', height: '3.2cqi', borderRadius: '50%', background: 'radial-gradient(circle at 32% 28%, #fff 0%, #d9d4ff 28%, #8d7dff 62%, #4f43d6 100%)', boxShadow: '0 0 1.6cqi rgba(106,92,255,.55)' }} />
            <span style={{ fontSize: '1.7cqi', fontWeight: 900, letterSpacing: '.04em' }}>AI 百业</span>
            <span className="cert-mono" style={{ fontSize: '1cqi', opacity: .5 }}>AI HUNDRED TRADES</span>
            <span style={{ flex: 1 }} />
            <span className="cert-pill"><span style={{ width: '1.5cqi', height: '1.5cqi', borderRadius: '50%', background: 'linear-gradient(135deg,#12a150,#3ad08a)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1cqi' }}>✓</span>已验证 · <span className="cert-mono" style={{ letterSpacing: '.06em' }}>{c.no}</span></span>
          </div>

          {/* 主体：左边谁、完成了什么；右边等级环 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4cqi', alignItems: 'center' }}>
            <div>
              <div className="cert-mono" style={{ fontSize: '1.15cqi', opacity: .55, letterSpacing: '.32em' }}>{day ? 'CERTIFICATE · A FULL DAY' : 'CERTIFICATE OF COMPLETION'}</div>
              <div style={{ fontSize: '3.6cqi', fontWeight: 900, marginTop: '.6cqi', letterSpacing: '.04em' }}>{day ? <>全天<span className="cert-grad">完成证书</span></> : <>职业体验<span className="cert-grad">完成证书</span></>}</div>
              <div style={{ fontSize: '1.4cqi', opacity: .6, marginTop: '2.4cqi' }}>授予</div>
              <div style={{ fontSize: '5.6cqi', fontWeight: 900, lineHeight: 1.15, marginTop: '.2cqi', letterSpacing: '.02em' }}>{c.candidate.name || '匿名新兵'}</div>
              <div style={{ fontSize: '1.6cqi', lineHeight: 1.8, marginTop: '1.4cqi', opacity: .82 }}>
                {fmtDate(c.date)}，{day ? <>走完了「{c.space.role}的一天」全部 {dayList?.length} 段</> : <>完成了「{c.space.role}的一天」{c.chapter && c.chapter.total > 1 ? `第 ${c.chapter.n} / ${c.chapter.total} 段` : ''}</>}
              </div>
              {!day && c.chapter && (
                <div className="cert-pill" style={{ marginTop: '1cqi', fontSize: '1.55cqi', padding: '.8cqi 1.6cqi' }}>
                  {c.chapter.slot && <span className="cert-mono" style={{ letterSpacing: '.04em' }}>{c.chapter.slot}</span>}
                  <span>{c.chapter.title}</span>
                </div>
              )}
              {day && dayList && (
                <div style={{ display: 'flex', gap: '.8cqi', marginTop: '1.4cqi', flexWrap: 'wrap' }}>
                  {dayList.map((d, i) => (
                    <div key={i} style={{ padding: '.8cqi 1.2cqi', borderRadius: '1cqi', background: 'rgba(255,255,255,.07)', boxShadow: '0 0 0 .1cqi rgba(255,255,255,.18)', minWidth: '10cqi' }}>
                      <div className="cert-mono" style={{ fontSize: '.95cqi', opacity: .6 }}>{d.slot || `第 ${i + 1} 段`}</div>
                      <div style={{ fontSize: '1.2cqi', fontWeight: 700, margin: '.2cqi 0' }}>{d.title}</div>
                      <div className="cert-mono cert-grad" style={{ fontSize: '2cqi', fontWeight: 900, letterSpacing: 0 }}>{bandText(d.band)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', justifyItems: 'center', gap: '1.2cqi' }}>
              <div className="cert-ring"><div>
                <span className="cert-mono" style={{ fontSize: '1cqi', opacity: .55, letterSpacing: '.2em' }}>OVERALL</span>
                <span className="cert-mono cert-grad" style={{ fontSize: '6.4cqi', fontWeight: 900, letterSpacing: 0, lineHeight: 1.05 }}>{bandText(c.overall)}</span>
                <span style={{ fontSize: '1.3cqi', fontWeight: 800 }}>{c.level || bandLevel(c.overall)}</span>
              </div></div>
              <span style={{ fontSize: '1.05cqi', opacity: .55 }}>综合等级 · 满分 9.0</span>
            </div>
          </div>

          {/* 底栏：数字职人 · 技能来源 · 签发 · 认证徽章 */}
          <div className="cert-foot">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1cqi', minWidth: 0 }}>
              {c.space.avatar && <img src={c.space.avatar} alt="" style={{ width: '4.4cqi', height: '4.4cqi', borderRadius: '50%', objectFit: 'cover', objectPosition: '54% 10%', boxShadow: '0 0 0 .25cqi #fff, 0 0 0 .4cqi rgba(106,92,255,.4)' }} />}
              <div style={{ minWidth: 0 }}><div className="cert-k">数字职人</div><div className="cert-v">{c.space.name} · {c.space.role}</div></div>
            </div>
            <div><div className="cert-k">技能来源</div><div className="cert-v">{c.skill?.expert ? `${c.skill.expert} · ${c.skill.location}` : 'AI 自学草案 · 待专家校正'}</div></div>
            <div><div className="cert-k">签发</div><div className="cert-v">AI 百业 · {fmtDate(c.date)}</div></div>
            <div className="cert-holo"><div style={{ position: 'relative', zIndex: 1, lineHeight: 1.2, textShadow: '0 1px 4px rgba(60,40,140,.45)' }}><div style={{ fontSize: '2cqi', fontWeight: 900 }}>✓</div><div style={{ fontSize: '.95cqi', fontWeight: 800, letterSpacing: '.1em' }}>已认证</div></div></div>
          </div>
        </div>
        <div className="cert-mono" style={{ position: 'absolute', left: '5.6cqi', bottom: '1.2cqi', fontSize: '.9cqi', opacity: .45, zIndex: 1 }}>按岗位标准由 AI 核心评分 · 仅用于职业体验，不代表执业资格 · 凭证书编号可查验</div>
      </div>
    </div>
  );
}

export interface ReportView extends CertView {
  score: number; match: number | null; beat: number | null; peers: number;
  dims: { key: string; name: string; weight: number; score: number; band: number; comment: string }[];
  analysis: { summary: string; gaps: string[]; suggestions: string[] };
}

/** 成绩单：仿雅思 TRF */
export function ScoreReport({ r }: { r: ReportView }) {
  const scale: [number, string][] = [[9, '可独当一面'], [8, '熟练'], [7, '胜任'], [6, '基本胜任'], [5, '需要带教'], [4, '入门']];
  const at = scale.findIndex(([b]) => r.overall >= b - 0.5);
  return (
    <div className="trf">
      <div className="trf-sheet">
        <div className="trf-head">
          <div>
            <div className="cert-mono" style={{ fontSize: '1cqi', color: '#6b7290' }}>AI 百业 · TEST REPORT FORM</div>
            <div style={{ fontSize: '2.6cqi', fontWeight: 900, letterSpacing: '.06em' }}>职业能力成绩单</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div className="trf-lbl">报告编号</div>
            <div className="cert-mono" style={{ fontWeight: 700 }}>{r.no}</div>
          </div>
        </div>

        <div className="trf-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="trf-cell"><div className="trf-lbl">姓名 Candidate</div><div className="trf-val">{r.candidate.name || '匿名新兵'}</div></div>
          <div className="trf-cell"><div className="trf-lbl">所在地 Location</div><div className="trf-val">{r.candidate.location || '—'}</div></div>
          <div className="trf-cell"><div className="trf-lbl">背景 Background</div><div className="trf-val">{r.candidate.note || '—'}</div></div>
          <div className="trf-cell" style={{ borderRight: 0 }}><div className="trf-lbl">日期 Date</div><div className="trf-val">{fmtDate(r.date)}</div></div>
          <div className="trf-cell" style={{ borderBottom: 0 }}><div className="trf-lbl">职业 Profession</div><div className="trf-val">{r.space.role}{r.space.company ? ` · ${r.space.company}` : ''}</div></div>
          <div className="trf-cell" style={{ gridColumn: 'span 2', borderBottom: 0 }}><div className="trf-lbl">场景 Scene</div><div className="trf-val">{r.chapter && r.chapter.total > 1 ? `第 ${r.chapter.n} / ${r.chapter.total} 段 · ` : ''}{r.chapter?.slot ? `${r.chapter.slot} · ` : ''}{r.chapter?.title || r.space.profession}</div></div>
          <div className="trf-cell" style={{ borderRight: 0, borderBottom: 0 }}><div className="trf-lbl">数字职人 Mentor</div><div className="trf-val">{r.space.name}</div></div>
        </div>

        <div className="trf-grid" style={{ gridTemplateColumns: `repeat(${r.dims.length || 1}, minmax(0, 1fr)) minmax(0, 1.3fr)` }}>
          {r.dims.map(d => (
            <div key={d.key} className="trf-cell" style={{ borderBottom: 0 }}>
              <div className="trf-lbl" style={{ textTransform: 'none' }}>{d.name}</div>
              <div className="trf-band">{bandText(d.band)}</div>
              <div style={{ fontSize: '1cqi', color: '#6b7290', marginTop: '.3cqi' }}>{d.score} / {d.weight} 分</div>
            </div>
          ))}
          <div className="trf-cell" style={{ borderRight: 0, borderBottom: 0, background: '#1b2033', color: '#fff' }}>
            <div className="trf-lbl" style={{ color: 'rgba(255,255,255,.65)' }}>综合等级 Overall</div>
            <div className="trf-band" style={{ fontSize: '4.6cqi' }}>{bandText(r.overall)}</div>
            <div style={{ fontWeight: 700, marginTop: '.3cqi' }}>{r.level}</div>
          </div>
        </div>

        <div className="trf-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="trf-cell" style={{ borderBottom: 0 }}><div className="trf-lbl">原始分 Raw score</div><div className="trf-val">{r.score} / 100</div><div className="trf-bar"><i style={{ width: `${r.score}%` }} /></div></div>
          <div className="trf-cell" style={{ borderBottom: 0 }}><div className="trf-lbl">与老师傅做法一致 Expert match</div><div className="trf-val">{r.match == null ? '—' : `${r.match}%`}</div><div className="trf-bar"><i style={{ width: `${r.match || 0}%` }} /></div></div>
          <div className="trf-cell" style={{ borderRight: 0, borderBottom: 0 }}><div className="trf-lbl">同段排名 Percentile</div><div className="trf-val">{r.beat == null ? '首位完成者' : `超过 ${r.beat}% 的体验者`}</div><div style={{ fontSize: '1cqi', color: '#6b7290', marginTop: '.5cqi' }}>共 {r.peers} 人走过这一段</div></div>
        </div>

        <div className="trf-ana">
          <div><div className="trf-lbl">总体评价</div>{r.analysis.summary || '—'}</div>
          <div><div className="trf-lbl">失分点</div><ul>{r.analysis.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
          <div><div className="trf-lbl">下次这样做</div><ul>{r.analysis.suggestions.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
        </div>

        {r.dims.some(d => d.comment) && (
          <div style={{ marginTop: '1.4cqi', display: 'grid', gap: '.6cqi' }}>
            {r.dims.map(d => d.comment && <div key={d.key} style={{ lineHeight: 1.7 }}><b>{d.name}</b>　{d.comment}</div>)}
          </div>
        )}

        <div className="trf-scale">
          {scale.map(([b, t], i) => <div key={b} className={i === at ? 'on' : ''}><b className="cert-mono" style={{ letterSpacing: 0 }}>{b}{b === 4 ? ' 以下' : ''}</b>　{t}</div>)}
        </div>
        <div style={{ marginTop: '1.2cqi', fontSize: '1cqi', color: '#8a90aa', lineHeight: 1.7 }}>
          等级 1–9 由原始分按 0.5 一档换算。评分由 AI 核心按岗位标准{r.skill?.expert ? `，并采用 ${r.skill.expert}（${r.skill.location}）的判断规则` : ''}完成，「与老师傅做法一致」按每一步和示范的对照计算。本成绩单仅用于职业体验，不代表执业资格或用人单位的录用结论。
        </div>
      </div>
    </div>
  );
}
