'use client';

import React, { useState } from 'react';
import { bandLevel, bandText } from '@/lib/lab-cert';

/**
 * 证书页夹（仿诺奖证书）：深色硬壳，打开是两页一屏。
 *   第一屏：左 证书（竖版、学院气质）· 右 画作（全息职业场景、人物、这一行的社会价值）
 *   第二屏：左 成绩记录（偏信息）· 右 图表（雷达、与平均 / 老师傅对比、分数分布）
 * 签发单位：平方创想 + 方略研究院（AI 百业是产品名，不是发证单位）。
 * 手机上四页竖着排；打印成四页 A4 竖版。
 */
const CSS = `
.folio-wrap { display: grid; justify-items: center; gap: 16px; }
.folio { position: relative; width: min(100%, 1180px); padding: clamp(10px, 1.6vw, 20px); border-radius: 18px;
  background: radial-gradient(120% 120% at 30% 0%, #2a2f5a 0%, #171a36 55%, #0e1026 100%);
  box-shadow: 0 40px 90px rgba(10,12,40,.45), inset 0 0 0 1px rgba(255,255,255,.06), inset 0 2px 0 rgba(255,255,255,.08); }
.folio::before { content: ''; position: absolute; inset: 7px; border-radius: 13px; border: 1px solid rgba(212,190,140,.28); pointer-events: none; }
.folio-spread { position: relative; display: grid; grid-template-columns: 1fr 1fr; perspective: 2600px; }
.folio-spread::after { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 34px; transform: translateX(-50%); pointer-events: none; z-index: 5;
  background: linear-gradient(90deg, transparent, rgba(0,0,0,.16) 45%, rgba(0,0,0,.22) 50%, rgba(0,0,0,.16) 55%, transparent); }
.folio-leaf { position: absolute; top: 0; bottom: 0; width: 50%; transform-style: preserve-3d; z-index: 6; }
.folio-leaf.next { left: 50%; transform-origin: left center; animation: leaf-next .9s cubic-bezier(.45,.05,.25,1) forwards; }
.folio-leaf.prev { left: 0; transform-origin: right center; animation: leaf-prev .9s cubic-bezier(.45,.05,.25,1) forwards; }
.folio-leaf > div { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.folio-leaf > .back { transform: rotateY(180deg); }
@keyframes leaf-next { to { transform: rotateY(-180deg); } }
@keyframes leaf-prev { to { transform: rotateY(180deg); } }
.folio-nav { display: flex; gap: 10px; align-items: center; }
.folio-dots { display: flex; gap: 6px; } .folio-dots i { width: 8px; height: 8px; border-radius: 50%; background: rgba(106,92,255,.25); } .folio-dots i.on { background: var(--v); }
.folio-stack { display: none; }
.cover-stage { width: min(100%, 1180px); display: flex; justify-content: center; perspective: 2600px; padding: 10px 0 20px; }
.cover { position: relative; width: min(92vw, 520px); aspect-ratio: 210 / 316; border-radius: 6px 16px 16px 6px; cursor: pointer; transform-origin: left center; transform-style: preserve-3d;
  background: radial-gradient(130% 100% at 30% 0%, #2c3266 0%, #181b3c 50%, #0d0f27 100%);
  box-shadow: 0 40px 90px rgba(10,12,40,.5), inset 0 0 0 1px rgba(255,255,255,.06), inset 14px 0 18px -10px rgba(0,0,0,.6);
  transition: transform .25s; color: #f3e3b8; container-type: inline-size; overflow: hidden; }
.cover:hover { transform: rotateY(-6deg); }
.cover.opening { animation: cover-open 1s cubic-bezier(.5,.05,.3,1) forwards; }
@keyframes cover-open { 0% { transform: rotateY(0); } 100% { transform: rotateY(-120deg); opacity: 0; } }
.cover::before { content: ''; position: absolute; inset: 4cqi; border: .4cqi solid rgba(212,180,110,.55); border-radius: 1.4cqi; pointer-events: none; }
.cover::after { content: ''; position: absolute; inset: 5.6cqi; border: .15cqi solid rgba(212,180,110,.35); border-radius: 1cqi; pointer-events: none; }
.cover-grain { position: absolute; inset: 0; opacity: .35; pointer-events: none;
  background-image: radial-gradient(rgba(255,255,255,.06) .2cqi, transparent .25cqi), radial-gradient(rgba(0,0,0,.25) .2cqi, transparent .25cqi); background-size: 1.6cqi 1.6cqi, 2.3cqi 2.3cqi; background-position: 0 0, .8cqi 1.1cqi; }
.cover-foil { background: linear-gradient(100deg, #b98e3e, #f6e1a6 30%, #d2a95a 48%, #fff3cc 62%, #c39648 80%, #e9cf8f); background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: foil 6s ease-in-out infinite alternate; }
@keyframes foil { to { background-position: 100% 0; } }
.cover-spine { position: absolute; left: 0; top: 0; bottom: 0; width: 4.5cqi; background: linear-gradient(90deg, rgba(0,0,0,.45), rgba(255,255,255,.05) 60%, rgba(0,0,0,.2)); }
.folio-open { animation: folio-in .7s ease-out both; }
@keyframes folio-in { from { opacity: 0; transform: scale(.97); } }
@media print { .cover-stage { display: none !important; } }
@media (max-width: 820px) { .folio, .folio-nav { display: none; } .folio-stack { display: grid; gap: 14px; width: 100%; } }

.pg { position: relative; container-type: inline-size; aspect-ratio: 210 / 316; overflow: hidden; background: #fff; color: #1d2450;
  font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.pg.l { border-radius: 4px 0 0 4px; } .pg.r { border-radius: 0 4px 4px 0; }
.pg-paper { background-color: #fff;
  background-image: linear-gradient(135deg, rgba(106,92,255,.045) 25%, transparent 25%), linear-gradient(225deg, rgba(106,92,255,.045) 25%, transparent 25%),
    linear-gradient(45deg, rgba(18,181,203,.03) 25%, transparent 25%), linear-gradient(315deg, rgba(18,181,203,.03) 25%, transparent 25%);
  background-size: 3.2cqi 3.2cqi; background-position: 0 0, 1.6cqi 0, 1.6cqi -1.6cqi, 0 1.6cqi; }
.pg-in { position: absolute; inset: 7cqi 8cqi 6cqi; display: flex; flex-direction: column; }
.pg-frame { position: absolute; inset: 3.2cqi; border: .25cqi solid rgba(29,36,80,.55); pointer-events: none; }
.pg-frame::after { content: ''; position: absolute; inset: .9cqi; border: .1cqi solid rgba(29,36,80,.3); }
.pg-serif { font-family: 'Songti SC', 'STSong', 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif; }
.pg-script { font-family: 'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', serif; }
.pg-mono { font-family: var(--font-geist-mono), ui-monospace, Menlo, monospace; letter-spacing: .08em; }
.pg-cap { font-size: 1.7cqi; letter-spacing: .18em; text-transform: uppercase; color: #6b7290; }
.pg-accent { color: #5b2ca0; }
.pg-clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pg-logos { display: flex; align-items: center; gap: 3cqi; }
.pg-logos img { height: 5.2cqi; object-fit: contain; }
.pg-tbl { width: 100%; border-collapse: collapse; font-size: 2.15cqi; }
.pg-tbl th { text-align: left; font-weight: 600; color: #6b7290; font-size: 1.75cqi; letter-spacing: .12em; padding: 1cqi .6cqi; border-bottom: .25cqi solid #1d2450; }
.pg-tbl td { padding: .9cqi .6cqi; border-bottom: .1cqi solid #d8dbe8; vertical-align: top; }
.pg-holo { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: color-dodge; opacity: .38;
  background: linear-gradient(115deg, transparent 20%, rgba(255,95,162,.55) 32%, rgba(127,230,242,.6) 44%, rgba(180,169,255,.6) 56%, rgba(155,231,196,.5) 68%, transparent 80%);
  background-size: 260% 260%; animation: holo 9s ease-in-out infinite alternate; }
@keyframes holo { from { background-position: 0% 30%; } to { background-position: 100% 70%; } }
@media print {
  @page { size: A4 portrait; margin: 0; }
  .lab-head, .lab-bg, .no-print, .folio, .folio-nav { display: none !important; }
  .lab, .lab-wrap { background: #fff !important; padding: 0 !important; max-width: none !important; }
  .folio-stack { display: block !important; }
  .folio-stack .pg { width: 100vw; break-after: page; border-radius: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const ISSUERS = '平方创想 · 方略研究院';

export interface FolioData {
  no: string; date: string; score: number; overall: number; level: string; match: number | null; beat: number | null; peers: number;
  candidate: { name: string; location?: string; note?: string };
  space: { id: string; name: string; role: string; avatar: string; profession: string; company?: string };
  chapter?: { n: number; total: number; slot: string; title: string; kind?: string } | null;
  skill?: { expert: string; location: string; draft: boolean } | null;
  dims: { key: string; name: string; weight: number; score: number; band: number; comment: string }[];
  analysis: { summary: string; gaps: string[]; suggestions: string[] };
  art?: { scene: string; place: string; people: { name: string; role: string; image: string }[]; value: { headline: string; lines: string[] } | null };
  charts?: { avg: Record<string, number | null>; expert: Record<string, number | null> | null; dist: number[] };
  /** 全天证书：dims 是每一段（名字 = 时段 + 标题，满分 100），chapter 为空 */
  day?: boolean;
}

/** 墨色印章：环形文字 + R² 意象 */
function Stamp() {
  return (
    <svg viewBox="0 0 200 200" style={{ width: '15cqi', height: '15cqi', transform: 'rotate(-14deg)', opacity: .82 }} aria-hidden>
      <defs><path id="stamp-c" d="M100,100 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0" /></defs>
      <circle cx="100" cy="100" r="92" fill="none" stroke="#2c3a8c" strokeWidth="4" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="#2c3a8c" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="52" fill="none" stroke="#2c3a8c" strokeWidth="1.5" />
      <text fill="#2c3a8c" fontSize="15" fontWeight="700" letterSpacing="3"><textPath href="#stamp-c">平方创想 · 方略研究院 · 职业能力认证 ·</textPath></text>
      <text x="100" y="108" textAnchor="middle" fill="#2c3a8c" fontSize="34" fontWeight="800" fontFamily="Georgia, serif">R²</text>
      <text x="100" y="134" textAnchor="middle" fill="#2c3a8c" fontSize="11" fontWeight="700" letterSpacing="4">认 证</text>
    </svg>
  );
}

function Issuers({ size = '5.2cqi' }: { size?: string }) {
  return (
    <div className="pg-logos">
      <img src="/lab/brand/visionsquare.png" alt="平方创想 VisionSquare" style={{ height: size }} />
      <span style={{ width: '.15cqi', height: size, background: 'rgba(29,36,80,.25)' }} />
      <img src="/lab/brand/fanglue.png" alt="方略研究院" style={{ height: size }} />
    </div>
  );
}

// ── 第 1 页：证书 ──
function PageCert({ d }: { d: FolioData }) {
  return (
    <div className="pg pg-paper">
      <div className="pg-frame" />
      <div className="pg-in">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <Issuers />
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}><div className="pg-cap">Certificate No.</div><div className="pg-mono" style={{ fontSize: '2cqi', fontWeight: 700 }}>{d.no}</div></div>
        </div>
        <div className="pg-serif" style={{ textAlign: 'center', marginTop: '5.5cqi' }}>
          <div className="pg-mono" style={{ fontSize: '1.8cqi', letterSpacing: '.38em', color: '#6b7290' }}>CERTIFICATE OF PROFESSIONAL EXPERIENCE</div>
          <div style={{ fontSize: '6.4cqi', fontWeight: 900, letterSpacing: '.28em', marginTop: '1.6cqi', paddingLeft: '.28em' }}>职业体验证书</div>
          <div style={{ fontSize: '2.6cqi', marginTop: '4.4cqi', color: '#4a5180' }}>兹证明</div>
          <div style={{ fontSize: '7cqi', fontWeight: 800, marginTop: '1cqi', display: 'inline-block', padding: '0 6cqi 1cqi', borderBottom: '.22cqi solid #1d2450' }}>{d.candidate.name || '匿名新兵'}</div>
          <div style={{ fontSize: '2.5cqi', lineHeight: 1.9, marginTop: '2.8cqi', color: '#2a3160' }}>
            于 {fmtDate(d.date)} 在数字职人 {d.space.name} 的带领下，<br />{d.day ? <>走完了「{d.space.role}的一天」全部 {d.dims.length} 段</> : <>完成了「{d.space.role}的一天」{d.chapter && d.chapter.total > 1 ? `第 ${d.chapter.n} / ${d.chapter.total} 段` : ''}的全部操作</>}
          </div>
          {!d.day && d.chapter && <div className="pg-accent" style={{ fontSize: '3.6cqi', fontWeight: 900, marginTop: '2cqi', letterSpacing: '.06em' }}>{d.chapter.slot ? `${d.chapter.slot} · ` : ''}{d.chapter.title}</div>}
          <div style={{ fontSize: '2.2cqi', marginTop: '3cqi', color: '#4a5180' }}>{d.day ? '按岗位标准逐段评定，全天综合等级' : '按岗位标准评定，综合等级'}</div>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '2cqi', marginTop: '1cqi' }}>
            <span className="pg-mono" style={{ fontSize: '7.6cqi', fontWeight: 900, letterSpacing: 0 }}>{bandText(d.overall)}</span>
            <span style={{ fontSize: '2.8cqi', fontWeight: 800 }}>{d.level || bandLevel(d.overall)}</span>
          </div>
        </div>
        <div style={{ margin: '2.4cqi auto 0', display: 'grid', gap: '.6cqi', fontSize: '2.05cqi', color: '#2a3160' }}>
          {d.dims.map(x => (
            <div key={x.key} style={{ display: 'flex', alignItems: 'center', gap: '1.6cqi' }}>
              <span style={{ width: '.8cqi', height: '2.4cqi', background: '#5b2ca0' }} />
              <span className="pg-serif" style={{ fontWeight: 700 }}>{x.name}</span>
              <span className="pg-mono" style={{ marginLeft: 'auto', paddingLeft: '4cqi' }}>{bandText(x.band)}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', gap: '2cqi' }}>
          <div style={{ display: 'grid', gap: '.6cqi' }}>
            <span className="pg-script" style={{ fontSize: '4cqi', color: '#2c3a8c', borderBottom: '.12cqi solid #1d2450', paddingBottom: '.4cqi' }}>{d.space.name}</span>
            <span style={{ fontSize: '1.8cqi', color: '#4a5180' }}>数字职人 · {d.space.role}</span>
            <span className="pg-script" style={{ fontSize: '4cqi', color: '#2c3a8c', borderBottom: '.12cqi solid #1d2450', paddingBottom: '.4cqi', marginTop: '1.2cqi' }}>{d.skill?.expert || '方略研究院'}</span>
            <span style={{ fontSize: '1.8cqi', color: '#4a5180' }}>{d.skill?.expert ? `技能来源 · ${d.skill.location}` : '职业能力评定'}</span>
          </div>
          <Stamp />
          <div style={{ textAlign: 'right', fontSize: '1.9cqi', color: '#4a5180', lineHeight: 1.9 }}>
            <div className="pg-cap">Date of Issue</div><div style={{ fontWeight: 700, color: '#1d2450' }}>{fmtDate(d.date)}</div>
            <div className="pg-cap" style={{ marginTop: '1cqi' }}>Issued by</div><div style={{ fontWeight: 700, color: '#1d2450' }}>{ISSUERS}</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: '1.5cqi', color: '#8a90aa', marginTop: '2cqi', lineHeight: 1.6 }}>
          本证书凭编号可在 AI 百业查验 · 由 AI 核心按岗位标准评分，仅用于职业体验，不代表执业资格
        </div>
      </div>
    </div>
  );
}

// ── 第 2 页：画作（全息职业场景 + 人物 + 社会价值） ──
function PageArt({ d }: { d: FolioData }) {
  const a = d.art;
  return (
    <div className="pg" style={{ background: '#0b0d26', color: '#fff' }}>
      {a?.scene && <img src={a.scene} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,13,38,.35) 0%, rgba(11,13,38,.15) 30%, rgba(11,13,38,.82) 66%, rgba(11,13,38,.97) 100%)' }} />
      <div className="pg-holo" />
      <div style={{ position: 'absolute', inset: '3.2cqi', border: '.2cqi solid rgba(255,255,255,.35)', pointerEvents: 'none' }} />
      <div className="pg-in" style={{ inset: '7cqi 8cqi 7cqi' }}>
        <div className="pg-mono" style={{ fontSize: '1.8cqi', letterSpacing: '.32em', opacity: .85 }}>THE PROFESSION</div>
        <div className="pg-serif" style={{ fontSize: '7cqi', fontWeight: 900, marginTop: '1cqi', textShadow: '0 .6cqi 3cqi rgba(0,0,0,.5)' }}>{d.space.role}</div>
        {a?.place && <div style={{ fontSize: '2.1cqi', opacity: .85, marginTop: '.6cqi' }}>📍 {a.place}{!d.day && d.chapter?.slot ? ` · ${d.chapter.slot}` : d.day && d.dims.length > 1 ? ` 等 · 一整天 ${d.dims.length} 段` : ''}</div>}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2.4cqi' }}>
          {d.space.avatar && (
            <div style={{ width: '22cqi', height: '22cqi', borderRadius: '50%', padding: '.8cqi', background: 'conic-gradient(from 30deg, #8f7bff, #7fe6f2, #ffb3d2, #b4a9ff, #9be7c4, #8f7bff)', boxShadow: '0 0 5cqi rgba(143,123,255,.55)', flexShrink: 0 }}>
              <img src={d.space.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', objectPosition: '54% 10%', background: '#1d2148' }} />
            </div>
          )}
          <div style={{ paddingBottom: '1cqi' }}>
            <div className="pg-cap" style={{ color: 'rgba(255,255,255,.65)' }}>数字职人</div>
            <div style={{ fontSize: '3.4cqi', fontWeight: 800 }}>{d.space.name}</div>
            {a?.people?.length ? (
              <div style={{ display: 'flex', marginTop: '1.4cqi' }}>
                {a.people.map((p, i) => <img key={p.name} src={p.image} alt={p.name} title={`${p.name} · ${p.role}`} style={{ width: '7cqi', height: '7cqi', borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 12%', border: '.35cqi solid #0b0d26', marginLeft: i ? '-1.6cqi' : 0, background: '#2a2f5a' }} />)}
                <span style={{ fontSize: '1.8cqi', opacity: .75, alignSelf: 'center', marginLeft: '1.4cqi' }}>和 {a.people.slice(0, 4).map(p => p.name).join('、')}{a.people.length > 4 ? ` 等 ${a.people.length} 人` : ''} 一起</span>
              </div>
            ) : null}
          </div>
        </div>
        {a?.value && (
          <div style={{ marginTop: '4cqi' }}>
            <div className="pg-cap" style={{ color: 'rgba(255,255,255,.6)' }}>这一行的社会价值</div>
            <div className="pg-serif" style={{ fontSize: '4cqi', fontWeight: 800, lineHeight: 1.45, marginTop: '1cqi' }}>{a.value.headline}</div>
            <div style={{ display: 'grid', gap: '1cqi', marginTop: '2cqi', fontSize: '2.15cqi', lineHeight: 1.65, opacity: .9 }}>
              {a.value.lines.map((l, i) => <div key={i} style={{ display: 'flex', gap: '1.4cqi' }}><span style={{ color: '#7fe6f2' }}>◆</span><span>{l}</span></div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 第 3 页：成绩记录（偏信息） ──
function PageRecord({ d }: { d: FolioData }) {
  return (
    <div className="pg pg-paper">
      <div className="pg-in" style={{ inset: '7cqi 7.5cqi 6cqi' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <Issuers size="4.4cqi" />
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'right', fontSize: '1.9cqi', lineHeight: 1.7, color: '#4a5180' }}><div>{fmtDate(d.date)}</div><div className="pg-mono">Document No. {d.no}</div></div>
        </div>
        <div className="pg-serif" style={{ fontSize: '4.6cqi', fontWeight: 900, textAlign: 'center', margin: '4.4cqi 0 .6cqi', letterSpacing: '.12em' }}>{d.day ? '全天成绩记录' : '成绩记录'}</div>
        <div className="pg-mono" style={{ textAlign: 'center', fontSize: '1.7cqi', letterSpacing: '.36em', color: '#6b7290' }}>TRANSCRIPT OF RECORDS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '.8cqi 3cqi', fontSize: '2.1cqi', marginTop: '3.6cqi' }}>
          {[['姓名', d.candidate.name || '匿名新兵'], ['背景', [d.candidate.note, d.candidate.location].filter(Boolean).join(' · ') || '—'], ['职业', `${d.space.role}${d.space.company ? ` · ${d.space.company}` : ''}`],
            ['场景', d.day ? `「${d.space.role}的一天」全部 ${d.dims.length} 段` : `${d.chapter && d.chapter.total > 1 ? `第 ${d.chapter.n} / ${d.chapter.total} 段 · ` : ''}${d.chapter?.slot ? `${d.chapter.slot} · ` : ''}${d.chapter?.title || ''}`], ['带教', `数字职人 ${d.space.name}${d.skill?.expert ? `（技能来源：${d.skill.expert} · ${d.skill.location}）` : ''}`]].map(([k, v]) => (
            <React.Fragment key={k}><span style={{ color: '#6b7290' }}>{k}</span><b>{v}</b></React.Fragment>
          ))}
        </div>
        <table className="pg-tbl" style={{ marginTop: '3cqi' }}>
          <thead><tr><th>{d.day ? '段落' : '评定项目'}</th><th style={{ width: '12cqi' }}>{d.day ? '一致' : '权重'}</th><th style={{ width: '15cqi' }}>得分</th><th style={{ width: '10cqi' }}>等级</th></tr></thead>
          <tbody>
            {d.dims.map(x => <tr key={x.key}><td className="pg-serif" style={{ fontWeight: 700 }}>{x.name}</td><td className="pg-mono">{d.day ? (x.comment || '—') : `${x.weight}%`}</td><td className="pg-mono" style={{ whiteSpace: 'nowrap' }}>{x.score} / {x.weight}</td><td className="pg-mono" style={{ fontWeight: 800 }}>{bandText(x.band)}</td></tr>)}
            <tr><td className="pg-serif" style={{ fontWeight: 900 }}>{d.day ? '全天平均' : '综合'}</td><td className="pg-mono">{d.day ? (d.match == null ? '—' : `${d.match}%`) : '100%'}</td><td className="pg-mono" style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{d.score} / 100</td><td className="pg-mono pg-accent" style={{ fontWeight: 900 }}>{bandText(d.overall)}</td></tr>
          </tbody>
        </table>
        {/* 纸面有限：每条最多两行，全文在成绩单的网页版里看得到 */}
        <div style={{ display: 'grid', gap: '1.6cqi', marginTop: '3cqi', fontSize: '1.85cqi', lineHeight: 1.6 }}>
          <div><div className="pg-cap" style={{ marginBottom: '.4cqi' }}>{d.day ? '这一天' : '总体评价'}</div><div className="pg-clamp" style={{ WebkitLineClamp: 3 }}>{d.analysis.summary}</div></div>
          {d.analysis.gaps.length > 0 && <div><div className="pg-cap" style={{ marginBottom: '.4cqi' }}>{d.day ? '最需要加强的一段 · 失分点' : '失分点'}</div>{d.analysis.gaps.slice(0, 2).map((g, i) => <div key={i} className="pg-clamp">{i + 1}. {g}</div>)}</div>}
          {d.analysis.suggestions.length > 0 && <div><div className="pg-cap" style={{ marginBottom: '.4cqi' }}>下次这样做</div>{d.analysis.suggestions.slice(0, 2).map((g, i) => <div key={i} className="pg-clamp">{i + 1}. {g}</div>)}</div>}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', fontSize: '1.6cqi', color: '#8a90aa' }}>
          <div style={{ display: 'grid', gap: '.4cqi' }}><span className="pg-script" style={{ fontSize: '3.6cqi', color: '#2c3a8c' }}>方略研究院</span><span>职业能力评定 · {ISSUERS}</span></div>
          <span>本记录凭编号可在 AI 百业查验</span>
        </div>
      </div>
    </div>
  );
}

// ── 第 4 页：图表（偏报告） ──
function Radar({ dims, avg, expert }: { dims: FolioData['dims']; avg: Record<string, number | null>; expert: Record<string, number | null> | null }) {
  const n = dims.length;
  if (n < 3) return null;
  const R = 108, C = 150;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [C + Math.cos(a) * R * v, C + Math.sin(a) * R * v]; };
  const poly = (vals: (number | null)[]) => vals.map((v, i) => pt(i, Math.max(0, Math.min(1, v ?? 0))).join(',')).join(' ');
  const you = dims.map(d => d.score / d.weight);
  const av = dims.map(d => (avg[d.key] != null ? avg[d.key]! / d.weight : null));
  const ex = expert ? dims.map(d => (expert[d.key] != null ? expert[d.key]! / d.weight : null)) : null;
  return (
    <svg viewBox="-45 -8 390 316" style={{ width: '100%' }}>
      {[0.25, 0.5, 0.75, 1].map(k => <polygon key={k} points={poly(dims.map(() => k))} fill="none" stroke="#d8dbe8" strokeWidth={1} />)}
      {dims.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#e4e6f0" />; })}
      {av.some(v => v != null) && <polygon points={poly(av)} fill="rgba(138,144,170,.12)" stroke="#8a90aa" strokeDasharray="4 3" strokeWidth={1.5} />}
      {ex && <polygon points={poly(ex)} fill="rgba(18,181,203,.10)" stroke="#12b5cb" strokeWidth={1.8} />}
      <polygon points={poly(you)} fill="rgba(106,92,255,.22)" stroke="#6a5cff" strokeWidth={2.2} />
      {you.map((v, i) => { const [x, y] = pt(i, v); return <circle key={i} cx={x} cy={y} r={3.2} fill="#6a5cff" />; })}
      {dims.map((d, i) => { const [x, y] = pt(i, 1.2); return <text key={d.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10.5" fill="#1d2450" fontWeight={700}>{d.name.length > 8 ? `${d.name.slice(0, 8)}…` : d.name}</text>; })}
    </svg>
  );
}

function PageCharts({ d }: { d: FolioData }) {
  const ch = d.charts || { avg: {}, expert: null, dist: [] };
  const bins = Array.from({ length: 10 }, (_, i) => ch.dist.filter(s => Math.min(9, Math.floor(s / 10)) === i).length);
  const maxBin = Math.max(1, ...bins);
  const myBin = Math.min(9, Math.floor(d.score / 10));
  const legend = [['#6a5cff', '你'], ['#12b5cb', '老师傅示范'], ['#8a90aa', '同段平均']].filter(([, t]) => t !== '老师傅示范' || ch.expert);
  return (
    <div className="pg pg-paper">
      <div className="pg-in" style={{ inset: '7cqi 7.5cqi 6cqi' }}>
        <div className="pg-cap">Performance Report</div>
        <div className="pg-serif" style={{ fontSize: '4.4cqi', fontWeight: 900, marginTop: '.6cqi' }}>{d.day ? '一天的能力画像' : '能力画像'}</div>
        <div style={{ display: 'flex', gap: '3cqi', marginTop: '1.4cqi', fontSize: '1.9cqi', color: '#4a5180' }}>
          {legend.map(([c, t]) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '.8cqi' }}><i style={{ width: '2.4cqi', height: '.6cqi', background: c, display: 'inline-block' }} />{t}</span>)}
        </div>
        <div style={{ width: '60%', margin: '0 auto' }}><Radar dims={d.dims} avg={ch.avg} expert={ch.expert} /></div>

        <div className="pg-cap" style={{ marginTop: '1cqi' }}>逐项对比（等级 0–9）</div>
        <div style={{ display: 'grid', gap: '1cqi', marginTop: '1cqi' }}>
          {d.dims.map(x => {
            const rows: [string, number | null][] = [['#6a5cff', x.score], ['#12b5cb', ch.expert?.[x.key] ?? null], ['#8a90aa', ch.avg[x.key] ?? null]];
            return (
              <div key={x.key} style={{ display: 'grid', gridTemplateColumns: '26cqi 1fr', gap: '2cqi', alignItems: 'center' }}>
                <span style={{ fontSize: '1.95cqi', fontWeight: 700 }}>{x.name}</span>
                <div style={{ display: 'grid', gap: '.3cqi' }}>
                  {rows.filter(([, v]) => v != null).map(([c, v], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1cqi' }}>
                      <div style={{ flex: 1, height: '.9cqi', background: '#eef0f6', borderRadius: '1cqi', overflow: 'hidden' }}><div style={{ width: `${(v! / x.weight) * 100}%`, height: '100%', background: c, borderRadius: '1cqi' }} /></div>
                      <span className="pg-mono" style={{ fontSize: '1.6cqi', width: '5cqi', textAlign: 'right', color: c }}>{((v! / x.weight) * 9).toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '4cqi', marginTop: '2.6cqi', alignItems: 'end' }}>
          {ch.dist.length === 0 ? <div style={{ fontSize: '1.9cqi', color: '#4a5180', lineHeight: 1.7 }}>雷达上每个角是一天里的一段；离外圈越近，这一段做得越像能独当一面的人。灰色虚线是同一段其他体验者的平均。</div> : <div>
            <div className="pg-cap">同段分数分布 · {d.peers} 人</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.6cqi', height: '11cqi', marginTop: '1.4cqi', borderBottom: '.12cqi solid #1d2450' }}>
              {bins.map((b, i) => <div key={i} title={`${i * 10}–${i * 10 + 9} 分：${b} 人`} style={{ flex: 1, height: `${Math.max(3, (b / maxBin) * 100)}%`, background: i === myBin ? '#6a5cff' : '#d8dbe8', borderRadius: '.5cqi .5cqi 0 0' }} />)}
            </div>
            <div className="pg-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.4cqi', color: '#8a90aa', marginTop: '.6cqi' }}><span>0</span><span>50</span><span>100</span></div>
          </div>}
          <div style={{ display: 'grid', gap: '1.2cqi' }}>
            <div><div className="pg-cap">超过</div><div className="pg-mono" style={{ fontSize: '4.6cqi', fontWeight: 900, letterSpacing: 0 }}>{d.beat == null ? '—' : `${d.beat}%`}</div><div style={{ fontSize: '1.7cqi', color: '#6b7290' }}>{d.beat == null ? '你是第一位走完这一段的人' : d.day ? '的体验者（各段平均）' : '的体验者'}</div></div>
            <div><div className="pg-cap">与老师傅一致</div><div className="pg-mono" style={{ fontSize: '4.6cqi', fontWeight: 900, letterSpacing: 0, color: '#12b5cb' }}>{d.match == null ? '—' : `${d.match}%`}</div><div style={{ fontSize: '1.7cqi', color: '#6b7290' }}>按每一步和示范的对照</div></div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: '1.5cqi', color: '#8a90aa', lineHeight: 1.7 }}>等级 1–9 由得分按 0.5 一档换算：9 可独当一面 · 8 熟练 · 7 胜任 · 6 基本胜任 · 5 需要带教 · 4 以下 入门。{ISSUERS}</div>
      </div>
    </div>
  );
}

/** 封皮：深色硬壳、烫金字，点一下翻开 */
function Cover({ d, opening, onOpen }: { d: FolioData; opening: boolean; onOpen: () => void }) {
  return (
    <div className="cover-stage">
      <div className={`cover${opening ? ' opening' : ''}`} onClick={onOpen} role="button" aria-label="打开证书">
        <div className="cover-grain" />
        <div className="cover-spine" />
        <div style={{ position: 'absolute', inset: '11cqi 10cqi 10cqi 12cqi', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3cqi', opacity: .92 }}>
            <img src="/lab/brand/visionsquare.png" alt="平方创想" style={{ height: '6cqi', filter: 'brightness(0) invert(1) sepia(.5) saturate(1.6) hue-rotate(5deg)' }} />
            <span style={{ width: '.2cqi', height: '6cqi', background: 'rgba(243,227,184,.4)' }} />
            {/* 方略的 R² 是实心色块，反白后成了一块白方块：封皮上用烫金字排 */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1.4cqi', color: '#f3e3b8' }}>
              <span style={{ fontFamily: 'Georgia, serif', fontWeight: 800, fontSize: '5.2cqi', lineHeight: 1 }}>R²</span>
              <span style={{ display: 'grid', textAlign: 'left', lineHeight: 1.15 }}><b className="pg-serif" style={{ fontSize: '3.4cqi', letterSpacing: '.08em' }}>方略研究院</b><span style={{ fontSize: '1.2cqi', opacity: .8 }}>SquareStrategics Research Institute</span></span>
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <svg viewBox="0 0 200 200" style={{ width: '30cqi', height: '30cqi', filter: 'drop-shadow(0 .6cqi 1.2cqi rgba(0,0,0,.5))' }} aria-hidden>
            <defs>
              <linearGradient id="cv-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f6e1a6" /><stop offset="50%" stopColor="#c39648" /><stop offset="100%" stopColor="#fff3cc" /></linearGradient>
              <path id="cv-c" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0" />
            </defs>
            <circle cx="100" cy="100" r="94" fill="none" stroke="url(#cv-g)" strokeWidth="3" />
            <circle cx="100" cy="100" r="86" fill="none" stroke="url(#cv-g)" strokeWidth="1" />
            <circle cx="100" cy="100" r="56" fill="none" stroke="url(#cv-g)" strokeWidth="1" />
            <text fill="url(#cv-g)" fontSize="12.5" fontWeight="700" letterSpacing="3.2"><textPath href="#cv-c">VISIONSQUARE · SQUARESTRATEGICS RESEARCH INSTITUTE ·</textPath></text>
            <text x="100" y="114" textAnchor="middle" fill="url(#cv-g)" fontSize="46" fontWeight="800" fontFamily="Georgia, serif">R²</text>
          </svg>
          <div className="pg-mono" style={{ fontSize: '2cqi', letterSpacing: '.4em', marginTop: '6cqi', opacity: .75 }}>CERTIFICATE OF PROFESSIONAL EXPERIENCE</div>
          <div className="pg-serif cover-foil" style={{ fontSize: '8.4cqi', fontWeight: 900, letterSpacing: '.3em', marginTop: '2cqi', paddingLeft: '.3em' }}>职业体验证书</div>
          <div style={{ width: '18cqi', height: '.25cqi', background: 'linear-gradient(90deg, transparent, #d2a95a, transparent)', margin: '4cqi 0' }} />
          <div className="pg-serif" style={{ fontSize: '4.6cqi', fontWeight: 800, color: '#f3e3b8' }}>{d.candidate.name || '匿名新兵'}的证书</div>
          <div style={{ fontSize: '2.5cqi', marginTop: '1.6cqi', opacity: .75 }}>{d.space.role}的一天{d.day ? ` · 全天 ${d.dims.length} 段` : ''}</div>
          <div style={{ flex: 1.2 }} />
          <div className="pg-serif" style={{ fontSize: '2.3cqi', letterSpacing: '.3em', opacity: .8 }}>平方创想 · 方略研究院</div>
          <div style={{ fontSize: '2cqi', marginTop: '3cqi', opacity: .6, letterSpacing: '.2em' }}>{opening ? '正在打开…' : '点击打开'}</div>
        </div>
      </div>
    </div>
  );
}

/** 单段成绩单：一段只有成绩（成绩记录 | 能力画像），证书要走完一整天才有 */
export function ScoreFolio({ d }: { d: FolioData }) {
  const pages = [<PageRecord key="r" d={d} />, <PageCharts key="ch" d={d} />];
  return (
    <div className="folio-wrap folio-open">
      <style>{CSS}</style>
      <div className="folio"><div className="folio-spread">
        <div className="pg-slot l" style={{ borderRadius: '4px 0 0 4px', overflow: 'hidden' }}>{pages[0]}</div>
        <div className="pg-slot r" style={{ borderRadius: '0 4px 4px 0', overflow: 'hidden' }}>{pages[1]}</div>
      </div></div>
      <div className="folio-stack">{pages.map((p, i) => <div key={i}>{p}</div>)}</div>
    </div>
  );
}

/** 页夹本体：两屏四页，翻页有动画；窄屏四页竖排；打印四页 A4 */
export function CertFolio({ d }: { d: FolioData }) {
  const pages = [<PageCert key="c" d={d} />, <PageArt key="a" d={d} />, <PageRecord key="r" d={d} />, <PageCharts key="ch" d={d} />];
  const [spread, setSpread] = useState(0);
  // 先看封皮，点一下翻开
  const [cover, setCover] = useState<'closed' | 'opening' | 'open'>('closed');
  const openCover = () => { if (cover !== 'closed') return; setCover('opening'); setTimeout(() => setCover('open'), 950); };
  const [turn, setTurn] = useState<null | 'next' | 'prev'>(null);
  const go = (dir: 'next' | 'prev') => {
    if (turn || (dir === 'next' && spread === 1) || (dir === 'prev' && spread === 0)) return;
    setTurn(dir);
    setTimeout(() => { setSpread(s => s + (dir === 'next' ? 1 : -1)); setTurn(null); }, 900);
  };
  const L = (i: number) => <div className="pg-slot l" style={{ borderRadius: '4px 0 0 4px', overflow: 'hidden' }}>{pages[i]}</div>;
  const R = (i: number) => <div className="pg-slot r" style={{ borderRadius: '0 4px 4px 0', overflow: 'hidden' }}>{pages[i]}</div>;
  // 翻页时：底下先换成翻过去之后看得见的两页，中间一张纸带着正反两面转过去
  const base = turn === 'next' ? [0, 3] : turn === 'prev' ? [0, 3] : [spread * 2, spread * 2 + 1];
  if (cover !== 'open') return (
    <div className="folio-wrap">
      <style>{CSS}</style>
      <Cover d={d} opening={cover === 'opening'} onOpen={openCover} />
      {/* 打印时不要封皮，直接四页 */}
      <div className="folio-stack" style={{ display: 'none' }}>{pages.map((p, i) => <div key={i}>{p}</div>)}</div>
    </div>
  );
  return (
    <div className="folio-wrap folio-open">
      <style>{CSS}</style>
      <div className="folio">
        <div className="folio-spread">
          {L(base[0])}{R(base[1])}
          {turn === 'next' && <div className="folio-leaf next"><div className="front">{pages[1]}</div><div className="back">{pages[2]}</div></div>}
          {turn === 'prev' && <div className="folio-leaf prev"><div className="front">{pages[2]}</div><div className="back">{pages[1]}</div></div>}
        </div>
      </div>
      <div className="folio-nav no-print">
        <button className="lab-btn ghost sm" disabled={spread === 0 || !!turn} onClick={() => go('prev')}>← 证书</button>
        <span className="folio-dots"><i className={spread === 0 ? 'on' : ''} /><i className={spread === 1 ? 'on' : ''} /></span>
        <button className="lab-btn sm" disabled={spread === 1 || !!turn} onClick={() => go('next')}>翻页：成绩 →</button>
      </div>
      <div className="folio-stack">{pages.map((p, i) => <div key={i}>{p}</div>)}</div>
    </div>
  );
}

/** 证书库里的一本：小封皮（烫金职业名、段落、等级）。empty = 还没走的那一段，虚线空位 */
export const MINI_COVER_CSS = `
.mcv { position: relative; width: 100%; aspect-ratio: 210 / 300; border-radius: 3px 10px 10px 3px; container-type: inline-size; cursor: pointer; border: 0; padding: 0; font-family: inherit; text-align: center; overflow: hidden;
  background: radial-gradient(130% 100% at 30% 0%, #2c3266 0%, #181b3c 50%, #0d0f27 100%); color: #f3e3b8;
  box-shadow: 0 14px 30px rgba(10,12,40,.35), inset 7px 0 10px -6px rgba(0,0,0,.6); transition: transform .25s, box-shadow .25s; }
.mcv:hover { transform: translateY(-4px) rotate(-1deg); box-shadow: 0 22px 40px rgba(10,12,40,.45), inset 7px 0 10px -6px rgba(0,0,0,.6); }
.mcv::before { content: ''; position: absolute; inset: 5cqi; border: .8cqi solid rgba(212,180,110,.5); border-radius: 2cqi; pointer-events: none; }
.mcv-foil { background: linear-gradient(100deg, #b98e3e, #f6e1a6 30%, #d2a95a 48%, #fff3cc 62%, #c39648 80%, #e9cf8f); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.mcv.empty { background: rgba(255,255,255,.55); box-shadow: none; color: var(--ink3); outline: 2px dashed rgba(106,92,255,.28); outline-offset: -2px; }
.mcv.empty::before { display: none; }
.mcv.day { background: radial-gradient(130% 100% at 30% 0%, #5a3f9e 0%, #2a1f5c 50%, #120d2e 100%); }
.mcv.locked { filter: grayscale(1) brightness(1.15); opacity: .55; cursor: default; }
.mcv.locked:hover { transform: none; }
`;

export function MiniCover({ role, title, slot, band, name, empty, day, locked, onClick }: { role: string; title: string; slot?: string; band?: number | null; name?: string; empty?: boolean; day?: boolean; locked?: string; onClick: () => void }) {
  return (
    <button className={`mcv${empty ? ' empty' : ''}${day ? ' day' : ''}${locked ? ' locked' : ''}`} onClick={locked ? undefined : onClick} title={locked || (empty ? '还没走这一段' : `${role} · ${title}`)}>
      <div style={{ position: 'absolute', inset: '11cqi 9cqi 10cqi', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {!empty && <span style={{ fontFamily: 'Georgia, serif', fontWeight: 800, fontSize: '11cqi', opacity: .9 }} className="mcv-foil">R²</span>}
        <span className="pg-mono" style={{ fontSize: '5.2cqi', letterSpacing: '.16em', marginTop: empty ? 0 : '3cqi', opacity: .75 }}>{slot || (day ? 'A FULL DAY' : '')}</span>
        <span className={`pg-serif${empty ? '' : ' mcv-foil'}`} style={{ fontSize: '10cqi', fontWeight: 900, lineHeight: 1.3, marginTop: '3cqi' }}>{day ? `${role}的一天` : title}</span>
        <span style={{ flex: 1 }} />
        {empty ? <span style={{ fontSize: '7.5cqi', fontWeight: 700, color: 'var(--v)' }}>去完成 →</span> : <>
          {locked ? <span style={{ fontSize: '12cqi' }}>🔒</span> : <span className="pg-mono mcv-foil" style={{ fontSize: '16cqi', fontWeight: 900, letterSpacing: 0, lineHeight: 1 }}>{band != null ? bandText(band) : ''}</span>}
          <span style={{ fontSize: '5.6cqi', marginTop: '2cqi', opacity: .75 }}>{locked || (day ? (name ? `${name}的证书` : '职业体验证书') : name ? `${name}的成绩` : role)}</span>
        </>}
      </div>
    </button>
  );
}
