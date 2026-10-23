'use client';

/**
 * 百业学院教务 · 共用小件（2026-10-23）。气质沿用学院官网：象牙纸底、深蓝、金线、衬线中文大标题 + 斜体英文副题、
 * 罗马数字章节号、金色花饰分隔线、院徽。数据表也要像一所学院的学籍册，不要后台味。
 */
import React from 'react';
import { App } from 'antd';
import { Portrait } from './Portrait';
export { Portrait };

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
/** 学员立绘位：透明底半身像（不圈在圆框里）；没有就一枚小院徽 */
export function Face({ src, size = 36 }: { src?: string | null; size?: number }) { return <Portrait src={src} h={Math.round(size * 1.45)} />; }

export const STATUS_TONE: Record<string, 'navy' | 'gold' | 'ok' | 'warn' | 'mute' | 'bad'> = {
  enrolled: 'navy', training: 'gold', examining: 'gold', graduated: 'ok', remedial: 'warn', withdrawn: 'mute',
  new: 'navy', contacted: 'gold', won: 'ok', closed: 'mute', admitted: 'ok', delivered: 'ok',
  proposed: 'navy', offered: 'gold', placed: 'ok', ended: 'mute',
};

export const ADMIN_CSS = `
.ca { display: flex; min-height: 100vh; color: var(--navy); font-size: 14.5px; font-weight: 500;
  background: var(--ivory) radial-gradient(1200px 600px at 100% -10%, rgba(176,141,87,.10), transparent 60%); }
/* 侧栏也是纸色：蓝金是主副色，不大面积铺（用户 10-23：深色一铺，录屏 / 截图一糊什么都看不见） */
.ca-side { width: 236px; flex-shrink: 0; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; background: var(--paper); border-right: 1px solid var(--line); }
.ca-brand { padding: 24px 20px 18px; border-bottom: 1px solid var(--line); display: flex; gap: 12px; align-items: center; }
.ca-brand .crest { width: 46px; height: 46px; border-radius: 50%; background: #fff; display: grid; place-items: center; flex-shrink: 0; box-shadow: 0 0 0 1.5px rgba(176,141,87,.6); }
.ca-brand .crest img { width: 38px; height: 38px; }
.ca-brand b { display: block; font-family: var(--serif); font-size: 19px; font-weight: 900; color: var(--navy); letter-spacing: .06em; line-height: 1.2; }
.ca-brand small { display: block; font: 700 11px/1.4 var(--en), 'PingFang SC', sans-serif; letter-spacing: .16em; color: var(--gold); margin-top: 4px; }
.ca-nav { padding: 14px 10px; display: grid; gap: 2px; }
.ca-nav a { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; font-size: 14.5px; font-weight: 600; color: var(--navy2); }
.ca-nav a:hover { background: rgba(22,32,74,.05); color: var(--navy); }
.ca-nav a.on { background: rgba(176,141,87,.13); color: var(--navy); font-weight: 800; box-shadow: inset 3px 0 0 var(--gold); }
.ca-nav a i { font: italic 600 13px var(--en); color: var(--gold); width: 26px; letter-spacing: .04em; }
.ca-nav .sec { font: 700 10.5px var(--en); letter-spacing: .26em; color: var(--ink3); padding: 16px 12px 4px; }
.ca-deans { margin: 10px 14px 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
.ca-deans .k { font: 700 10px var(--en); letter-spacing: .24em; color: var(--gold); margin-bottom: 8px; }
.ca-dean { display: flex; align-items: center; gap: 9px; padding: 4px 0; font-size: 13px; font-weight: 600; color: var(--navy); }
.ca-dean .seal { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 700 11px var(--en); color: #1c1606; background: linear-gradient(135deg, #d9b878, #b08d57); flex-shrink: 0; }
.ca-dean .seal.b { background: var(--navy); color: #fff; }
.ca-dean small { display: block; font-size: 11.5px; font-weight: 500; color: var(--ink2); }
.ca-side-foot { margin-top: auto; padding: 14px 20px 18px; font-size: 12.5px; color: var(--ink2); line-height: 1.7; border-top: 1px solid var(--line); }
.ca-side-foot .motto { font-family: var(--serif); color: var(--navy); font-weight: 800; font-size: 14px; }
.ca-side-foot .motto span { display: block; font: italic 12px var(--en); color: var(--ink3); font-weight: 400; }
.ca-main { flex: 1; min-width: 0; padding: 30px clamp(18px, 3vw, 44px) 70px; }
.ca-eyebrow { font: 700 12px/1.4 var(--en); letter-spacing: .26em; color: var(--gold); text-transform: uppercase; }
.ca-eyebrow.sm { font-size: 11px; letter-spacing: .22em; margin-bottom: 2px; }
.ca-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.ca-head h1 { font-family: var(--serif); font-size: 32px; font-weight: 900; margin: 8px 0 0; letter-spacing: .03em; line-height: 1.2; }
.ca-head h1 span { display: block; font: italic 400 15px var(--en); color: var(--ink2); letter-spacing: .01em; margin-top: 6px; }
.ca-head p { margin: 10px 0 0; color: var(--ink2); font-size: 14.5px; font-weight: 500; max-width: 760px; line-height: 1.8; }
.ca-rule { display: flex; align-items: center; gap: 12px; margin: 6px 0 18px; color: var(--gold); font-size: 11px; }
.ca-rule i { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(176,141,87,.6), transparent); }
.ca-rule span { font: italic 600 12px var(--en); letter-spacing: .18em; }
.ca-card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin-bottom: 16px; position: relative;
  box-shadow: 0 1px 0 rgba(22,32,74,.03), 0 12px 30px -24px rgba(22,32,74,.25); }
.ca-card::before { content: ''; position: absolute; left: 20px; right: 20px; top: 0; height: 2px; background: linear-gradient(90deg, transparent, rgba(176,141,87,.55), transparent); border-radius: 2px; }
.ca-card-h { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.ca-card-h h3 { font-family: var(--serif); font-size: 18px; font-weight: 800; margin: 0; letter-spacing: .02em; }
.ca-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.ca-stat { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px 16px; position: relative; overflow: hidden; }
.ca-stat i { position: absolute; right: 16px; top: 10px; font: italic 500 42px var(--en); color: rgba(176,141,87,.16); }
.ca-stat b { display: block; font-family: var(--serif); font-size: 34px; font-weight: 900; line-height: 1.1; font-variant-numeric: tabular-nums; }
.ca-stat span { display: block; font-size: 14px; color: var(--navy2); margin-top: 8px; font-weight: 700; }
.ca-stat small { display: block; font-size: 12.5px; color: var(--ink2); margin-top: 3px; }
.ca-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ca-table th { text-align: left; font: 700 11px/1.4 var(--en), "PingFang SC", sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--ink2); padding: 8px 10px; border-bottom: 1.5px solid var(--navy); white-space: nowrap; }
.ca-table td { padding: 11px 10px; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.6; font-weight: 500; }
.ca-table tr.click:hover td { background: rgba(176,141,87,.06); cursor: pointer; }
.ca-table .who { min-width: 260px; }
.ca-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ca-table .serif { font-family: var(--serif); font-weight: 800; font-size: 15px; }
.ca-score { font-family: var(--serif); font-size: 17px; font-weight: 900; } .ca-score.ok { color: #0d7a52; } .ca-score.bad { color: #b42318; }
/* 立绘：透明底半身像，不圈框；行里的小像会探出一点行高 */
.ca-por { display: inline-block; position: relative; aspect-ratio: 5 / 6; overflow: hidden; flex-shrink: 0; vertical-align: middle; margin: -6px 0; }
.ca-por img { position: absolute; left: 50%; top: 0; width: 100%; height: auto; transform: translateX(-50%); filter: drop-shadow(0 4px 10px rgba(22,32,74,.18)); }
.ca-por.ph { display: inline-grid; place-items: center; } .ca-por.ph img { position: static; width: 60%; transform: none; opacity: .6; filter: none; }
.ca-pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.ca-pill.navy { background: rgba(22,32,74,.08); color: var(--navy); } .ca-pill.gold { background: rgba(176,141,87,.18); color: #6b4e1f; }
.ca-pill.ok { background: rgba(18,160,107,.13); color: #0b6b47; } .ca-pill.warn { background: rgba(214,132,22,.16); color: #7a4a00; }
.ca-pill.mute { background: rgba(0,0,0,.06); color: var(--ink2); } .ca-pill.bad { background: rgba(180,35,24,.1); color: #9e1f14; }
.ca-btn { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 18px; border-radius: 999px; border: 0; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background .15s, transform .1s; }
.ca-btn:active { transform: translateY(1px); }
.ca-btn.sm { height: 30px; padding: 0 13px; font-size: 13px; }
.ca-btn.navy { background: var(--navy); color: #fff; } .ca-btn.navy:hover { background: #24306a; }
.ca-btn.gold { background: linear-gradient(120deg, #b08d57, #d9b878); color: #1c1606; }
.ca-btn.ghost { background: #fff; color: var(--navy); box-shadow: inset 0 0 0 1.5px var(--line); } .ca-btn.ghost:hover { background: rgba(22,32,74,.05); }
.ca-btn.danger { background: transparent; color: #b42318; box-shadow: inset 0 0 0 1.5px rgba(180,35,24,.3); }
.ca-btn:disabled { opacity: .45; cursor: default; }
.ca-spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: ca-rot .7s linear infinite; }
@keyframes ca-rot { to { transform: rotate(360deg); } }
.ca-empty { padding: 40px 16px; text-align: center; color: var(--ink2); font-size: 14.5px; line-height: 1.9; }
.ca-empty-mark { font-size: 18px; color: var(--gold); margin-bottom: 6px; }
.ca-mute { color: var(--ink2); } .ca-ok { color: #0d7a52; } .ca-bad { color: #b42318; }
.ca-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ca-kv { font-size: 13.5px; color: var(--ink2); line-height: 1.75; font-weight: 500; } .ca-kv b { color: var(--navy); font-weight: 700; margin-right: 6px; }
.ca-input { padding: 9px 13px; border-radius: 10px; border: 1px solid var(--line); background: #fff; font-size: 14px; color: var(--navy); outline: none; font-family: inherit; min-width: 200px; }
.ca-input:focus { border-color: var(--navy2); }
.ca-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); }
.ca-tabs button { border: 0; background: transparent; padding: 8px 14px; font-size: 14px; font-weight: 700; color: var(--ink2); cursor: pointer; font-family: inherit; margin-bottom: -1px; }
.ca-tabs button.on { color: var(--navy); box-shadow: inset 0 -2px 0 var(--gold); }
.ca-steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.ca-step { border: 1px solid var(--line); border-radius: 10px; padding: 12px 13px; background: #fff; font-size: 13px; color: var(--ink2); line-height: 1.6; position: relative; font-weight: 500; }
.ca-step i { display: block; font: italic 600 12px var(--en); color: var(--gold); margin-bottom: 4px; }
.ca-step b { display: block; color: var(--navy); font-size: 14.5px; margin-bottom: 3px; font-family: var(--serif); font-weight: 800; }
.ca-step.on { border-color: var(--gold); background: rgba(176,141,87,.08); box-shadow: 0 0 0 3px rgba(176,141,87,.14); }
.ca-step.done { background: rgba(18,160,107,.06); border-color: rgba(18,160,107,.3); }
.ca-note { background: #fff; border-left: 3px solid var(--gold); border-radius: 0 10px 10px 0; padding: 10px 14px; font-size: 13.5px; color: var(--navy2); line-height: 1.8; font-weight: 500; }
.ca-note ul { margin: 4px 0 0; padding-left: 18px; }
.ca-layers { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.ca-layer { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: #fff; }
.ca-layer i { display: block; font: italic 600 11px var(--en); letter-spacing: .18em; color: var(--gold); }
.ca-layer b { display: block; font-family: var(--serif); font-size: 15.5px; margin: 4px 0 5px; font-weight: 800; }
.ca-layer span { display: block; font-size: 13px; color: var(--ink2); line-height: 1.65; }
.ca-layer small { display: block; margin-top: 8px; font-size: 12.5px; color: var(--navy2); font-weight: 700; }
.ca-log { font-size: 13px; color: var(--navy2); line-height: 1.75; border-left: 3px solid var(--gold2); padding-left: 12px; margin: 8px 0; }
/* 学籍卡：纸色，立绘站在卡片前面、头顶冒出一截 */
.ca-hero { display: flex; gap: 22px; align-items: flex-end; padding: 0 26px 18px 26px; border-radius: 16px; margin: 44px 0 18px; position: relative;
  background: var(--paper); border: 1px solid var(--line); box-shadow: 0 1px 0 rgba(22,32,74,.03), 0 12px 30px -24px rgba(22,32,74,.25); }
.ca-hero::before { content: ''; position: absolute; left: 20px; right: 20px; top: 0; height: 2px; background: linear-gradient(90deg, transparent, rgba(176,141,87,.6), transparent); }
.ca-hero img.bg { position: absolute; right: 18px; top: 14px; width: 120px; opacity: .07; pointer-events: none; }
.ca-hero .ca-por.hero { height: 210px; margin: -44px 0 0; flex-shrink: 0; }
.ca-hero .ca-por.hero img { filter: drop-shadow(0 10px 18px rgba(22,32,74,.22)); }
.ca-hero .txt { padding-top: 22px; min-width: 0; }
.ca-hero h2 { font-family: var(--serif); font-size: 28px; margin: 2px 0 6px; font-weight: 900; letter-spacing: .03em; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ca-hero .sub { color: var(--navy2); font-size: 14px; line-height: 1.75; font-weight: 500; }
.ca-hero .en { font: italic 600 13px var(--en); color: var(--gold); letter-spacing: .04em; }
.ca-hero .nums { margin-left: auto; display: flex; gap: 26px; text-align: right; padding-top: 22px; flex-shrink: 0; }
.ca-hero .nums b { display: block; font-family: var(--serif); font-size: 30px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--navy); } .ca-hero .nums span { font-size: 12.5px; color: var(--ink2); font-weight: 600; }
.ca-notebook { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ca-notebook ul { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px; color: var(--navy2); line-height: 1.7; font-weight: 500; }
@media (max-width: 960px) { .ca { flex-direction: column; } .ca-side { position: static; height: auto; width: auto; } .ca-nav { display: flex; flex-wrap: wrap; } .ca-steps { grid-template-columns: repeat(2, 1fr); } .ca-notebook { grid-template-columns: 1fr; } .ca-hero { flex-wrap: wrap; } .ca-hero .nums { margin-left: 0; } }
`;
