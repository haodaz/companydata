'use client';

import React, { useMemo } from 'react';
import { bandLevel, bandText } from '@/lib/lab-cert';

/**
 * 证书与成绩单的版式（单段证书、全天证书共用）。
 * 证书：米色纸 + 扭索纹水印 + 双线边框 + 金色印章，横版 A4 比例；字号按容器宽度缩放（cqi），手机上等比缩小。
 * 成绩单：仿雅思 TRF——各维度等级一排小格，综合等级突出，下面是和老师傅一致度、超过多少人、三栏分析。
 */
export const CERT_CSS = `
.cert, .trf { container-type: inline-size; width: 100%; max-width: 1120px; margin: 0 auto; }
.cert-sheet { position: relative; aspect-ratio: 297 / 210; overflow: hidden; border-radius: 6px; color: #2b2418;
  background: radial-gradient(120% 90% at 50% 40%, #fffdf6 0%, #fbf5e6 55%, #f3e8cf 100%); box-shadow: 0 30px 80px rgba(60,40,10,.22), 0 2px 0 rgba(255,255,255,.6) inset; }
.cert-sheet.dark { color: #f5ead2; background: radial-gradient(120% 90% at 50% 35%, #1d2350 0%, #12163a 55%, #0b0d26 100%); }
.cert-guil { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cert-frame { position: absolute; inset: 2.2cqi; border: .28cqi solid #b08d57; }
.cert-frame::after { content: ''; position: absolute; inset: .7cqi; border: .1cqi solid rgba(176,141,87,.75); }
.cert-sheet.dark .cert-frame { border-color: #d4b06a; }
.cert-corner { position: absolute; width: 5cqi; height: 5cqi; border: .28cqi solid #b08d57; }
.cert-sheet.dark .cert-corner { border-color: #d4b06a; }
.cert-in { position: absolute; inset: 4.2cqi 6cqi 3.6cqi; display: flex; flex-direction: column; align-items: center; text-align: center; }
.cert-serif { font-family: 'Songti SC', 'STSong', 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif; }
.cert-script { font-family: 'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', serif; }
.cert-mono { font-family: var(--font-geist-mono), ui-monospace, Menlo, monospace; letter-spacing: .12em; }
.cert-gold { background: linear-gradient(100deg, #8a6a2f, #d8b46a 40%, #9a7638 70%, #c9a45c); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.cert-sheet.dark .cert-gold { background: linear-gradient(100deg, #e9cf8f, #fff2c9 40%, #d7b46a 70%, #f3dca0); -webkit-background-clip: text; background-clip: text; }
.cert-band { width: 11cqi; height: 11cqi; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(circle at 35% 30%, #fff8e6, #ecd9ad 70%, #d9bd7f); box-shadow: 0 0 0 .3cqi #b08d57, 0 0 0 .7cqi rgba(176,141,87,.25), 0 1cqi 2cqi rgba(80,55,15,.25); color: #4a3510; }
.cert-sign { display: grid; justify-items: center; gap: .3cqi; min-width: 20cqi; }
.cert-sign .line { width: 100%; height: .1cqi; background: #b08d57; }
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

/** 扭索纹：几条内摆线叠在一起，像钞票和证书底纹 */
function Guilloche({ dark }: { dark?: boolean }) {
  const paths = useMemo(() => {
    const out: string[] = [];
    const curve = (R: number, r: number, d: number, cx: number, cy: number, sx: number, sy: number) => {
      let p = '';
      for (let i = 0; i <= 1440; i++) {
        const t = (i / 1440) * Math.PI * 2 * (r / gcd(R, r));
        const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
        const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
        p += `${i ? 'L' : 'M'}${(cx + x * sx).toFixed(1)},${(cy + y * sy).toFixed(1)}`;
      }
      return p;
    };
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    out.push(curve(96, 26, 60, 1485, 1050, 4.2, 4.2));
    out.push(curve(90, 36, 48, 1485, 1050, 4.6, 4.6));
    for (const [cx, cy] of [[300, 260], [2670, 260], [300, 1840], [2670, 1840]]) out.push(curve(60, 22, 40, cx, cy, 1.9, 1.9));
    return out;
  }, []);
  const c = dark ? 'rgba(212,176,106,' : 'rgba(176,141,87,';
  return (
    <svg className="cert-guil" viewBox="0 0 2970 2100" preserveAspectRatio="none" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={`${c}${i < 2 ? .1 : .16})`} strokeWidth={i < 2 ? 1.6 : 1.4} />)}
      {/* 上下两条波纹带 */}
      {[150, 1950].map(y => [0, 1, 2, 3].map(k => (
        <path key={`${y}-${k}`} d={Array.from({ length: 300 }, (_, i) => `${i ? 'L' : 'M'}${(220 + i * 8.5).toFixed(1)},${(y + Math.sin(i / 6 + k * 1.3) * 18).toFixed(1)}`).join('')} fill="none" stroke={`${c}.22)`} strokeWidth={1.2} />
      )))}
    </svg>
  );
}

/** 金色印章：外圈环形文字 + 中间星 */
export function Seal({ size = '13cqi', dark }: { size?: string; dark?: boolean }) {
  const g = dark ? ['#f3dca0', '#c79a45'] : ['#d8b46a', '#8a6a2f'];
  return (
    <svg viewBox="0 0 200 200" style={{ width: size, height: size }} aria-hidden>
      <defs>
        <radialGradient id="sealg" cx="40%" cy="35%"><stop offset="0%" stopColor={g[0]} /><stop offset="100%" stopColor={g[1]} /></radialGradient>
        <path id="sealpath" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" />
      </defs>
      {Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return <circle key={i} cx={100 + Math.cos(a) * 94} cy={100 + Math.sin(a) * 94} r={4.2} fill="url(#sealg)" />; })}
      <circle cx="100" cy="100" r="90" fill="url(#sealg)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="58" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" />
      <text fill="#fff8e6" fontSize="13.5" fontWeight="700" letterSpacing="2.4"><textPath href="#sealpath">AI 百业 · 职业体验认证 · AI HUNDRED TRADES ·</textPath></text>
      <polygon points="100,62 109,88 137,88 114,104 123,131 100,115 77,131 86,104 63,88 91,88" fill="#fff8e6" opacity=".95" />
      <text x="100" y="152" textAnchor="middle" fill="#fff8e6" fontSize="12" fontWeight="700" letterSpacing="3">认 证</text>
    </svg>
  );
}

const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`; };

export interface CertView {
  no: string; date: string; overall: number; level: string; candidate: { name: string; location?: string; note?: string };
  space: { id: string; name: string; role: string; avatar: string; profession: string; company?: string };
  chapter?: { n: number; total: number; slot: string; title: string; kind?: string } | null;
  skill?: { expert: string; location: string; draft: boolean } | null;
}

/** 证书本体：day = 全天证书（深色、列出每一段） */
export function Certificate({ c, day, dayList }: { c: CertView; day?: boolean; dayList?: { slot: string; title: string; band: number }[] }) {
  const dark = !!day;
  return (
    <div className="cert">
      <div className={`cert-sheet${dark ? ' dark' : ''}`}>
        <Guilloche dark={dark} />
        <div className="cert-frame" />
        {[{ left: '1.4cqi', top: '1.4cqi', borderRight: 0, borderBottom: 0 }, { right: '1.4cqi', top: '1.4cqi', borderLeft: 0, borderBottom: 0 }, { left: '1.4cqi', bottom: '1.4cqi', borderRight: 0, borderTop: 0 }, { right: '1.4cqi', bottom: '1.4cqi', borderLeft: 0, borderTop: 0 }].map((st, i) => <span key={i} className="cert-corner" style={st as React.CSSProperties} />)}
        <div className="cert-in">
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', fontSize: '1.15cqi' }}>
            <span className="cert-mono" style={{ fontWeight: 700, opacity: .75 }}>AI 百业 · AI HUNDRED TRADES</span>
            <span style={{ flex: 1 }} />
            <span className="cert-mono" style={{ opacity: .75 }}>NO. {c.no}</span>
          </div>
          <div className="cert-mono" style={{ fontSize: '1.2cqi', marginTop: '2.2cqi', opacity: .7, letterSpacing: '.42em' }}>{day ? 'CERTIFICATE · A FULL DAY' : 'CERTIFICATE OF COMPLETION'}</div>
          <div className="cert-serif cert-gold" style={{ fontSize: '4.1cqi', fontWeight: 900, letterSpacing: '.3em', marginTop: '.8cqi', paddingLeft: '.3em' }}>{day ? '全天完成证书' : '职业体验完成证书'}</div>
          <div className="cert-serif" style={{ fontSize: '1.6cqi', marginTop: '1.8cqi', opacity: .8 }}>兹证明</div>
          <div className="cert-serif" style={{ fontSize: '4.6cqi', fontWeight: 800, marginTop: '.4cqi', padding: '0 4cqi .4cqi', borderBottom: `.18cqi solid ${dark ? '#d4b06a' : '#b08d57'}`, minWidth: '30cqi', lineHeight: 1.25 }}>{c.candidate.name || '匿名新兵'}</div>
          <div className="cert-serif" style={{ fontSize: '1.65cqi', marginTop: '1.6cqi', lineHeight: 1.9, maxWidth: '70cqi' }}>
            于 {fmtDate(c.date)}，{day ? <>走完了「{c.space.role}的一天」全部 {dayList?.length} 段</> : <>在「{c.space.role}的一天」中完成{c.chapter && c.chapter.total > 1 ? <>第 {c.chapter.n} / {c.chapter.total} 段</> : null}</>}
            {!day && c.chapter && <><br /><b style={{ fontSize: '2.1cqi' }}>{c.chapter.slot ? `${c.chapter.slot} · ` : ''}{c.chapter.title}</b></>}
          </div>
          {day && dayList && (
            <div style={{ display: 'flex', gap: '1cqi', marginTop: '1.4cqi', flexWrap: 'wrap', justifyContent: 'center' }}>
              {dayList.map((d, i) => (
                <div key={i} style={{ padding: '.7cqi 1.2cqi', borderRadius: '.8cqi', border: '.12cqi solid rgba(212,176,106,.6)', minWidth: '11cqi' }}>
                  <div className="cert-mono" style={{ fontSize: '1cqi', opacity: .75 }}>{d.slot || `第 ${i + 1} 段`}</div>
                  <div className="cert-serif" style={{ fontSize: '1.25cqi', fontWeight: 700, margin: '.2cqi 0' }}>{d.title}</div>
                  <div className="cert-mono cert-gold" style={{ fontSize: '1.9cqi', fontWeight: 900 }}>{bandText(d.band)}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="cert-sign">
              {c.space.avatar && <img src={c.space.avatar} alt="" style={{ width: '5.4cqi', height: '5.4cqi', borderRadius: '50%', objectFit: 'cover', objectPosition: '54% 10%', border: `.2cqi solid ${dark ? '#d4b06a' : '#b08d57'}` }} />}
              <span className="cert-script" style={{ fontSize: '2.4cqi' }}>{c.space.name}</span>
              <span className="line" />
              <span style={{ fontSize: '1.1cqi', opacity: .75 }}>数字职人 · {c.space.role}</span>
            </div>
            <div style={{ display: 'grid', justifyItems: 'center', gap: '.8cqi' }}>
              <div className="cert-band" style={dark ? { background: 'radial-gradient(circle at 35% 30%, #fff3cf, #e2c27c 70%, #b98e3e)', color: '#2a1c05' } : undefined}>
                <span className="cert-mono" style={{ fontSize: '4.2cqi', fontWeight: 900, letterSpacing: 0, lineHeight: 1 }}>{bandText(c.overall)}</span>
                <span style={{ fontSize: '1cqi', fontWeight: 700, marginTop: '.3cqi' }}>综合等级 · {c.level || bandLevel(c.overall)}</span>
              </div>
            </div>
            <div className="cert-sign" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-9cqi', right: '-1cqi', transform: 'rotate(-12deg)', opacity: .92 }}><Seal size="10cqi" dark={dark} /></div>
              <span className="cert-script" style={{ fontSize: '2.4cqi' }}>{c.skill?.expert || 'AI 百业'}</span>
              <span className="line" />
              <span style={{ fontSize: '1.1cqi', opacity: .75 }}>{c.skill?.expert ? `技能来源 · ${c.skill.location}` : '职业体验认证中心'}</span>
            </div>
          </div>
          <div className="cert-mono" style={{ fontSize: '.95cqi', opacity: .55, marginTop: '1.2cqi' }}>按岗位标准由 AI 核心评分 · 仅用于职业体验，不代表执业资格 · 凭证书编号可查验</div>
        </div>
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
