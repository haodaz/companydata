'use client';

/**
 * 百业学院教务 · 共用小件（2026-10-23）。气质沿用学院官网：象牙纸底、深蓝、金线、衬线中文大标题 + 斜体英文副题、
 * 罗马数字章节号、金色花饰分隔线、院徽。数据表也要像一所学院的学籍册，不要后台味。
 */
import React from 'react';
import { App } from 'antd';

export async function api<T = any>(path: string, init?: RequestInit & { json?: any }): Promise<T> {
  const r = await fetch(`/api/college/admin${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body, cache: 'no-store' });
  const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  if (!j.ok) throw new Error(j.error || '请求失败');
  return j;
}
export function useToast() { const { message } = App.useApp(); return { ok: (t: string) => message.success(t), err: (e: any) => message.error(String(e?.message || e)) }; }

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** 页首：金色小标 + 衬线大标题 + 斜体英文 + 引言；右侧放动作 */
export function PageHead({ eyebrow, zh, en, lead, extra }: { eyebrow: string; zh: React.ReactNode; en: string; lead?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="ca-head">
      <div><div className="ca-eyebrow">{eyebrow}</div><h1>{zh}<span>{en}</span></h1>{lead && <p>{lead}</p>}</div>
      {extra && <div className="ca-row">{extra}</div>}
    </div>
  );
}
/** 花饰分隔线 */
export function Rule({ label }: { label?: string }) { return <div className="ca-rule"><i /><span>{label || '✦'}</span><i /></div>; }
export function Card({ eyebrow, title, extra, children, style, className }: { eyebrow?: string; title?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <section className={`ca-card${className ? ' ' + className : ''}`} style={style}>{(title || extra || eyebrow) && <header className="ca-card-h"><div>{eyebrow && <div className="ca-eyebrow sm">{eyebrow}</div>}{title && <h3>{title}</h3>}</div><div className="ca-row">{extra}</div></header>}{children}</section>;
}
export function Pill({ tone = 'navy', children }: { tone?: 'navy' | 'gold' | 'ok' | 'warn' | 'mute' | 'bad'; children: React.ReactNode }) { return <span className={`ca-pill ${tone}`}>{children}</span>; }
export function Btn({ kind = 'ghost', sm, busy, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'navy' | 'gold' | 'ghost' | 'danger'; sm?: boolean; busy?: boolean }) {
  return <button {...rest} disabled={rest.disabled || busy} className={`ca-btn ${kind}${sm ? ' sm' : ''}`}>{busy ? <span className="ca-spin" /> : null}{children}</button>;
}
export function Stat({ v, k, sub, roman }: { v: React.ReactNode; k: string; sub?: string; roman?: string }) { return <div className="ca-stat">{roman && <i>{roman}</i>}<b>{v}</b><span>{k}</span>{sub && <small>{sub}</small>}</div>; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="ca-empty"><div className="ca-empty-mark">✦</div>{children}</div>; }
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '—');
export const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const score = (v: number | null | undefined) => (v == null ? <span className="ca-mute">—</span> : <b className={`ca-score ${Number(v) >= 60 ? 'ok' : 'bad'}`}>{Math.round(Number(v))}</b>);
/** 学员头像位：NOVA 的立绘，没有就一枚小院徽 */
export function Face({ src, size = 36 }: { src?: string | null; size?: number }) { return src ? <img className="ca-face" src={src} alt="" style={{ width: size, height: size }} /> : <span className="ca-face ph" style={{ width: size, height: size }}><img src="/college/crest.svg" alt="" /></span>; }

export const STATUS_TONE: Record<string, 'navy' | 'gold' | 'ok' | 'warn' | 'mute' | 'bad'> = {
  enrolled: 'navy', training: 'gold', examining: 'gold', graduated: 'ok', remedial: 'warn', withdrawn: 'mute',
  new: 'navy', contacted: 'gold', won: 'ok', closed: 'mute', admitted: 'ok', delivered: 'ok',
  proposed: 'navy', offered: 'gold', placed: 'ok', ended: 'mute',
};

export const ADMIN_CSS = `
.ca { display: flex; min-height: 100vh; color: var(--navy);
  background: var(--ivory) radial-gradient(1200px 600px at 100% -10%, rgba(176,141,87,.10), transparent 60%); }
.ca-side { width: 236px; flex-shrink: 0; color: rgba(255,255,255,.8); display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
  background: radial-gradient(120% 60% at 0% 0%, #22306a 0%, #16204a 45%, #0d1230 100%); border-right: 1px solid rgba(217,184,120,.18); }
.ca-brand { padding: 26px 20px 18px; border-bottom: 1px solid rgba(217,184,120,.18); display: flex; gap: 12px; align-items: center; }
.ca-brand .crest { width: 46px; height: 46px; border-radius: 50%; background: var(--ivory); display: grid; place-items: center; flex-shrink: 0; box-shadow: 0 0 0 3px rgba(217,184,120,.35); }
.ca-brand .crest img { width: 36px; height: 36px; }
.ca-brand b { display: block; font-family: var(--serif); font-size: 18px; font-weight: 900; color: #fff; letter-spacing: .06em; line-height: 1.2; }
.ca-brand small { display: block; font: 600 10.5px/1.4 var(--en), 'PingFang SC', sans-serif; letter-spacing: .16em; color: var(--gold2); margin-top: 4px; }
.ca-nav { padding: 14px 10px; display: grid; gap: 2px; }
.ca-nav a { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; font-size: 14px; color: rgba(255,255,255,.78); }
.ca-nav a:hover { background: rgba(255,255,255,.06); color: #fff; }
.ca-nav a.on { background: rgba(217,184,120,.14); color: #f3dfae; font-weight: 700; box-shadow: inset 2px 0 0 var(--gold2); }
.ca-nav a i { font: italic 500 12.5px var(--en); color: var(--gold2); width: 26px; letter-spacing: .04em; }
.ca-nav .sec { font: 700 10px var(--en); letter-spacing: .26em; color: rgba(255,255,255,.38); padding: 16px 12px 4px; }
.ca-deans { margin: 10px 14px 0; padding: 12px 12px; border: 1px solid rgba(217,184,120,.22); border-radius: 10px; background: rgba(255,255,255,.03); }
.ca-deans .k { font: 700 9.5px var(--en); letter-spacing: .24em; color: var(--gold2); margin-bottom: 8px; }
.ca-dean { display: flex; align-items: center; gap: 9px; padding: 4px 0; font-size: 12.5px; color: rgba(255,255,255,.85); }
.ca-dean .seal { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 700 11px var(--en); color: #1c1606; background: linear-gradient(135deg, #d9b878, #b08d57); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.35); flex-shrink: 0; }
.ca-dean .seal.b { background: var(--ivory); color: var(--navy); }
.ca-dean small { display: block; font-size: 11px; color: rgba(255,255,255,.5); }
.ca-side-foot { margin-top: auto; padding: 14px 20px 18px; font-size: 12px; color: rgba(255,255,255,.5); line-height: 1.7; border-top: 1px solid rgba(217,184,120,.18); }
.ca-side-foot .motto { font-family: var(--serif); color: var(--gold2); font-size: 13.5px; }
.ca-side-foot .motto span { display: block; font: italic 11.5px var(--en); color: rgba(255,255,255,.55); }
.ca-main { flex: 1; min-width: 0; padding: 30px clamp(18px, 3vw, 44px) 70px; }
.ca-eyebrow { font: 700 11.5px/1.4 var(--en); letter-spacing: .26em; color: var(--gold); text-transform: uppercase; }
.ca-eyebrow.sm { font-size: 10.5px; letter-spacing: .22em; margin-bottom: 2px; }
.ca-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.ca-head h1 { font-family: var(--serif); font-size: 32px; font-weight: 900; margin: 8px 0 0; letter-spacing: .03em; line-height: 1.2; }
.ca-head h1 span { display: block; font: italic 400 14.5px var(--en); color: var(--ink3); letter-spacing: .01em; margin-top: 6px; }
.ca-head p { margin: 10px 0 0; color: var(--ink2); font-size: 14px; max-width: 760px; line-height: 1.8; }
.ca-rule { display: flex; align-items: center; gap: 12px; margin: 6px 0 18px; color: var(--gold); font-size: 11px; }
.ca-rule i { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(176,141,87,.6), transparent); }
.ca-rule span { font: italic 500 12px var(--en); letter-spacing: .18em; }
.ca-card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin-bottom: 16px; position: relative;
  box-shadow: 0 1px 0 rgba(22,32,74,.03), 0 12px 30px -24px rgba(22,32,74,.25); }
.ca-card::before { content: ''; position: absolute; left: 20px; right: 20px; top: 0; height: 2px; background: linear-gradient(90deg, transparent, rgba(176,141,87,.55), transparent); border-radius: 2px; }
.ca-card-h { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.ca-card-h h3 { font-family: var(--serif); font-size: 18px; font-weight: 800; margin: 0; letter-spacing: .02em; }
.ca-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.ca-stat { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px 16px; position: relative; overflow: hidden; }
.ca-stat i { position: absolute; right: 16px; top: 10px; font: italic 500 42px var(--en); color: rgba(176,141,87,.14); }
.ca-stat b { display: block; font-family: var(--serif); font-size: 34px; font-weight: 900; line-height: 1.1; font-variant-numeric: tabular-nums; }
.ca-stat span { display: block; font-size: 13.5px; color: var(--ink2); margin-top: 8px; font-weight: 600; }
.ca-stat small { display: block; font-size: 12px; color: var(--ink3); margin-top: 3px; }
.ca-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.ca-table th { text-align: left; font: 700 10.5px/1.4 var(--en), "PingFang SC", sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--ink3); padding: 8px 10px; border-bottom: 1.5px solid var(--navy); white-space: nowrap; }
.ca-table td { padding: 11px 10px; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.6; }
.ca-table tr.click:hover td { background: rgba(176,141,87,.05); cursor: pointer; }
.ca-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ca-table .serif { font-family: var(--serif); font-weight: 800; font-size: 14.5px; }
.ca-score { font-family: var(--serif); font-size: 16px; } .ca-score.ok { color: #0d7a52; } .ca-score.bad { color: #b42318; }
.ca-face { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; box-shadow: 0 0 0 2px var(--paper), 0 0 0 3px rgba(176,141,87,.45); flex-shrink: 0; display: inline-grid; place-items: center; background: var(--ivory); }
.ca-face.ph img { width: 60%; height: 60%; opacity: .7; }
.ca-pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.ca-pill.navy { background: rgba(22,32,74,.08); color: var(--navy2); } .ca-pill.gold { background: rgba(176,141,87,.16); color: #7a5c2a; }
.ca-pill.ok { background: rgba(18,160,107,.12); color: #0d7a52; } .ca-pill.warn { background: rgba(214,132,22,.14); color: #8a5200; }
.ca-pill.mute { background: rgba(0,0,0,.06); color: var(--ink3); } .ca-pill.bad { background: rgba(180,35,24,.1); color: #b42318; }
.ca-btn { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 18px; border-radius: 999px; border: 0; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background .15s, transform .1s; }
.ca-btn:active { transform: translateY(1px); }
.ca-btn.sm { height: 30px; padding: 0 13px; font-size: 12.5px; }
.ca-btn.navy { background: var(--navy); color: #fff; } .ca-btn.navy:hover { background: #24306a; }
.ca-btn.gold { background: linear-gradient(120deg, #b08d57, #d9b878); color: #1c1606; }
.ca-btn.ghost { background: transparent; color: var(--navy); box-shadow: inset 0 0 0 1.5px var(--line); } .ca-btn.ghost:hover { background: rgba(22,32,74,.05); }
.ca-btn.danger { background: transparent; color: #b42318; box-shadow: inset 0 0 0 1.5px rgba(180,35,24,.3); }
.ca-btn:disabled { opacity: .45; cursor: default; }
.ca-spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: ca-rot .7s linear infinite; }
@keyframes ca-rot { to { transform: rotate(360deg); } }
.ca-empty { padding: 40px 16px; text-align: center; color: var(--ink3); font-size: 14px; line-height: 1.9; }
.ca-empty-mark { font-size: 18px; color: var(--gold); margin-bottom: 6px; }
.ca-mute { color: var(--ink3); } .ca-ok { color: #0d7a52; } .ca-bad { color: #b42318; }
.ca-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ca-kv { font-size: 13px; color: var(--ink2); line-height: 1.75; } .ca-kv b { color: var(--navy); font-weight: 600; margin-right: 6px; }
.ca-input { padding: 9px 13px; border-radius: 10px; border: 1px solid var(--line); background: #fff; font-size: 13.5px; color: var(--navy); outline: none; font-family: inherit; min-width: 200px; }
.ca-input:focus { border-color: var(--navy2); }
.ca-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); }
.ca-tabs button { border: 0; background: transparent; padding: 8px 14px; font-size: 13.5px; font-weight: 600; color: var(--ink2); cursor: pointer; font-family: inherit; margin-bottom: -1px; }
.ca-tabs button.on { color: var(--navy); box-shadow: inset 0 -2px 0 var(--gold); }
.ca-steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.ca-step { border: 1px solid var(--line); border-radius: 10px; padding: 12px 13px; background: #fff; font-size: 12.5px; color: var(--ink2); line-height: 1.6; position: relative; }
.ca-step i { display: block; font: italic 500 12px var(--en); color: var(--gold); margin-bottom: 4px; }
.ca-step b { display: block; color: var(--navy); font-size: 14px; margin-bottom: 3px; font-family: var(--serif); }
.ca-step.on { border-color: var(--gold); background: rgba(176,141,87,.07); box-shadow: 0 0 0 3px rgba(176,141,87,.12); }
.ca-step.done { background: rgba(18,160,107,.05); border-color: rgba(18,160,107,.25); }
.ca-note { background: rgba(22,32,74,.035); border-left: 3px solid var(--gold); border-radius: 0 10px 10px 0; padding: 10px 14px; font-size: 13px; color: var(--ink2); line-height: 1.8; }
.ca-note ul { margin: 4px 0 0; padding-left: 18px; }
.ca-layers { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.ca-layer { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: #fff; }
.ca-layer i { display: block; font: italic 500 11px var(--en); letter-spacing: .18em; color: var(--gold); }
.ca-layer b { display: block; font-family: var(--serif); font-size: 15px; margin: 4px 0 5px; }
.ca-layer span { display: block; font-size: 12.5px; color: var(--ink2); line-height: 1.65; }
.ca-layer small { display: block; margin-top: 8px; font-size: 12px; color: var(--navy2); font-weight: 600; }
.ca-log { font-size: 12.5px; color: var(--ink2); line-height: 1.75; border-left: 3px solid var(--gold2); padding-left: 12px; margin: 8px 0; }
.ca-hero { display: flex; gap: 20px; align-items: center; padding: 22px 24px; border-radius: 16px; color: #fff; margin-bottom: 18px; position: relative; overflow: hidden;
  background: radial-gradient(120% 90% at 85% 0%, #2c3768 0%, #16204a 50%, #0b0f22 100%); }
.ca-hero img.bg { position: absolute; right: -40px; bottom: -60px; width: 260px; opacity: .08; pointer-events: none; }
.ca-hero .ca-face { width: 72px; height: 72px; box-shadow: 0 0 0 3px rgba(217,184,120,.6); }
.ca-hero h2 { font-family: var(--serif); font-size: 26px; margin: 2px 0 4px; font-weight: 900; letter-spacing: .03em; }
.ca-hero .sub { color: rgba(255,255,255,.75); font-size: 13.5px; line-height: 1.7; }
.ca-hero .en { font: italic 400 13px var(--en); color: var(--gold2); }
.ca-hero .nums { margin-left: auto; display: flex; gap: 26px; text-align: right; }
.ca-hero .nums b { display: block; font-family: var(--serif); font-size: 28px; font-variant-numeric: tabular-nums; } .ca-hero .nums span { font-size: 12px; color: rgba(255,255,255,.6); }
.ca-notebook { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ca-notebook ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--ink2); line-height: 1.7; }
@media (max-width: 960px) { .ca { flex-direction: column; } .ca-side { position: static; height: auto; width: auto; } .ca-nav { display: flex; flex-wrap: wrap; } .ca-steps { grid-template-columns: repeat(2, 1fr); } .ca-notebook { grid-template-columns: 1fr; } .ca-hero .nums { margin-left: 0; } }
`;
