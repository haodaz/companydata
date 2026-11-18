'use client';

/** 底部升起的抽屉：一条 claim 的签发细节 + 「查验真伪」演示动画；外加通用抽屉和轻提示。 */
import React, { useEffect, useRef, useState } from 'react';
import { ISSUERS, LEVELS, STATUS, pageDef, type Claim, type IssuerId, type Level, type Status } from './data';
import { AtaSquare, EntMark, Icon, Qr, Stamp, VsMark, Visa, stampAspect } from './art';
import { fmtTime, nowMs } from './lib';
import { useHolder } from './holder';

/* ---------- 通用抽屉 ---------- */
/** variant=side：宽屏时从右侧滑出（签签对话）；默认宽屏居中弹出、手机从底部升起 */
export function Sheet({ onClose, children, label, variant }: { onClose: () => void; children: (close: () => void) => React.ReactNode; label: string; variant?: 'side' }) {
  const [out, setOut] = useState(false);
  const close = () => setOut(true);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOut(true); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, []);
  return (
    <>
      <div className={`tp-mask${out ? ' out' : ''}${variant ? ` ${variant}` : ''}`} onClick={close} />
      <div className={`tp-sheet${out ? ' out' : ''}${variant ? ` ${variant}` : ''}`} role="dialog" aria-modal="true" aria-label={label} onAnimationEnd={e => { if (out && e.target === e.currentTarget) onClose(); }}>
        <div className="tp-grip"><i /></div>
        <button type="button" className="tp-x" aria-label="关闭" onClick={close}>×</button>
        {children(close)}
      </div>
    </>
  );
}

/* ---------- 轻提示 ---------- */
export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  return <div className="tp-toast" role="status" onAnimationEnd={onDone}>{msg}</div>;
}

/* ---------- 徽标、级别、状态 ---------- */
export function IssuerLogo({ issuer }: { issuer: IssuerId }) {
  if (issuer === 'ata') return (
    <span className="tp-logo wide">
      {/* eslint-disable-next-line @next/next/no-img-element -- 小标志，原图直出 */}
      <img src="/passport/ata-logo.png" alt="全美在线 ATA" />
    </span>
  );
  if (issuer === 'joint') return <span className="tp-logo wide"><svg viewBox="0 0 76 34" style={{ width: 64, height: 30 }}><AtaSquare x={17} y={17} s={28} /><VsMark x={56} y={17} s={28} col="#5B4BDB" /></svg></span>;
  if (issuer === 'enterprise' || issuer === 'employer') return <span className="tp-logo"><svg viewBox="0 0 40 40"><EntMark x={20} y={20} s={34} col="#0F7A62" ch={issuer === 'employer' ? '青' : '北'} /></svg></span>;
  if (issuer === 'self') return <span className="tp-logo"><svg viewBox="0 0 40 40"><Icon kind="pen" x={20} y={20} s={30} col="#2B4C9B" /></svg></span>;
  return <span className="tp-logo"><svg viewBox="0 0 40 40"><VsMark x={20} y={20} s={32} col={issuer === 'baiye' ? '#B4532A' : '#5B4BDB'} /></svg></span>;
}
export const LevelBadge = ({ level }: { level: Level }) => <span className="tp-badge" style={{ ['--c' as string]: LEVELS[level].color, ['--b' as string]: LEVELS[level].bg }}>{LEVELS[level].name}</span>;
export const StatusBadge = ({ status }: { status: Status }) => <span className="tp-badge" style={{ ['--c' as string]: STATUS[status].color, ['--b' as string]: `${STATUS[status].color}17` }}>{STATUS[status].name}</span>;

/* ---------- 查验真伪（演示） ---------- */
type Line = { t: string; s: 'wait' | 'run' | 'ok' | 'warn' | 'bad' };
function signerOf(c: Claim) {
  if (c.demo) return '演示签章 · 没有真实签发方签名';
  if (c.issuer === 'self') return '本人签名（护照私钥）';
  if (c.issuer === 'ata') return 'ATA 签发签名';
  if (c.issuer === 'joint') return 'ATA × 平方创想 联合签名';
  if (c.issuer === 'enterprise' || c.issuer === 'employer') return `${c.issuerName || ISSUERS[c.issuer].name} 确认签名 + 平方背书`;
  return '平方创想 鉴真签名';
}
function VerifyBox({ c }: { c: Claim }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [result, setResult] = useState<{ at: string } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)); }, []);
  const final: Line['s'] = c.demo ? 'warn' : c.status === 'valid' ? 'ok' : c.status === 'expired' || c.status === 'revoked' ? 'bad' : 'warn';
  const run = () => {
    timers.current.forEach(t => window.clearTimeout(t)); timers.current = [];
    const L: Line[] = [
      { t: `读取查验码 ${c.code}`, s: 'wait' },
      { t: `核对签名：${signerOf(c)}`, s: 'wait' },
      { t: `比对内容哈希 ${c.hash}`, s: 'wait' },
      { t: c.status === 'valid' ? '查询状态：有效，未被撤回' : `查询状态：${STATUS[c.status].name}`, s: 'wait' },
    ];
    setResult(null); setLines(L.map((l, i) => (i === 0 ? { ...l, s: 'run' } : l)));
    L.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => {
        setLines(cur => cur && cur.map((l, j) => (j === i ? { ...l, s: i === 1 && (c.issuer === 'self' || c.demo) ? 'warn' : i === 3 ? final : 'ok' } : j === i + 1 ? { ...l, s: 'run' } : l)));
        if (i === L.length - 1) setResult({ at: fmtTime(nowMs()) });
      }, 520 * (i + 1)));
    });
  };
  const ok = c.status === 'valid' && !c.demo;
  const passStamp = c.demo
    ? { shape: 'round' as const, top: 'DEMO · 演示签章', bottom: 'NOT REALLY ISSUED', icon: 'star' as const, main: '演示', sub: '非真实签发', color: '#B7791F' }
    : ok
    ? { shape: 'round' as const, top: 'VERIFIED · 查验通过', bottom: 'TALENT PASSPORT', icon: 'check' as const, main: '真', sub: '签名一致', color: '#0F7A62' }
    : c.status === 'revoked' || c.status === 'expired'
      ? { shape: 'round' as const, top: 'INVALID · 已失效', bottom: 'TALENT PASSPORT', icon: 'lock' as const, main: c.status === 'revoked' ? '撤回' : '过期', sub: '不可再用', color: '#C0262D' }
      : { shape: 'round' as const, top: 'SELF · 本人自述', bottom: 'NOT YET VERIFIED', icon: 'pen' as const, main: '自述', sub: '签名属实', color: '#B7791F' };
  return (
    <>
      <button type="button" className="tp-btn v block" style={{ marginTop: 12 }} onClick={run} disabled={!!lines && !result}>
        {lines && !result ? '查验中…' : lines ? '再查验一次' : '查验真伪'}
      </button>
      {lines && (
        <div className="tp-check" aria-live="polite">
          {lines.map((l, i) => <div key={i} className={`tp-check-l ${l.s}`}><i>{l.s === 'ok' ? '✓' : l.s === 'warn' ? '!' : l.s === 'bad' ? '×' : ''}</i><span>{l.t}</span></div>)}
          {result && (
            <div className="tp-pass">
              <Stamp s={passStamp} seedKey={c.id + 'pass'} />
              <div>
                <b style={{ color: passStamp.color }}>{c.demo ? '这是一条演示签章，不是真实签发' : ok ? '查验通过：内容未被改动' : c.status === 'revoked' ? '这条已被撤回' : c.status === 'expired' ? '这条已过期' : c.status === 'review' ? '签名属实，核验还在进行' : '签名属实，但只是本人自述'}</b>
                <span>{c.demo ? '用来体验护照里签章的样子。真的要去「去认证」里考、做、接题拿。' : ok ? `由${c.issuerName || ISSUERS[c.issuer].name}签发，签名与哈希一致。` : c.level === 'self' ? '内容由本人填写，尚未经第三方核实，请结合其它签章判断。' : '以当前状态为准。'}</span>
                <span className="tp-mono" style={{ fontSize: 11, marginTop: 4 }}>查验时间 {result.at}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- claim 抽屉 ---------- */
export function ClaimDrawer({ c, avatar, onClose, actions, shareOrigin }: { c: Claim; avatar: string; onClose: () => void; actions?: (close: () => void) => React.ReactNode; shareOrigin?: string }) {
  const holder = useHolder();
  const iss = ISSUERS[c.issuer];
  const baseName = c.issuer === 'self' ? `${holder.name}（本人）` : c.issuerName || iss.name;
  const issuerName = c.issuer === 'enterprise' ? `${baseName}（企业出题）` : baseName;
  const qrText = holder.demo
    ? `${shareOrigin || 'https://talent-passport'}/passport/s/dz-share?p=i${pageDef(c.page).code}&c=${encodeURIComponent(c.id)}`
    : `TALENT-PASSPORT/${holder.passportNo}/VERIFY/${c.code}`;
  const round = c.stamp?.shape === 'round' || (c.stamp ? stampAspect(c.stamp.shape) > 0.8 : false);
  return (
    <Sheet onClose={onClose} label={c.title}>
      {close => (
        <>
          <div className={`tp-dr-art${round ? ' round' : ''}`}>
            {c.visa ? <Visa v={c.visa} avatar={avatar} /> : c.stamp ? <Stamp s={c.stamp} seedKey={c.id + 'dr'} /> : null}
          </div>
          <div className="tp-dr-head">
            <IssuerLogo issuer={c.issuer} />
            <div className="tp-dr-issuer"><b>{issuerName}</b><span>{iss.en}</span></div>
          </div>
          {c.demo && <div className="tp-dr-demo"><b>演示</b><span>这是从演示签章库加进来的，用来体验护照的样子，不是真实签发，也不代表本人真的考过 / 做过。</span></div>}
          <div className="tp-dr-title">{c.title}</div>
          <p className="tp-dr-stmt">{c.statement}</p>
          <div className="tp-badges"><LevelBadge level={c.level} /><StatusBadge status={c.status} /></div>

          {c.scores && c.scores.length > 1 && (
            <div className="tp-sec">
              <div className="tp-sec-h">分项 · BREAKDOWN</div>
              <div className="tp-scores">
                {c.scores.map(s => (
                  <div key={s.name} className="tp-score" style={{ ['--c' as string]: s.v / s.max < 0.75 ? '#5B4BDB' : '#D80C18' }}>
                    <span>{s.name}</span><i><b style={{ width: `${(s.v / s.max) * 100}%` }} /></i><span>{s.v.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="tp-sec">
            <div className="tp-sec-h">签发细节 · CLAIM</div>
            <div className="tp-dl">
              <div>编号</div><div className="m">{c.id}</div>
              <div>签发方</div><div>{issuerName}</div>
              <div>签发日期</div><div className="m">{c.issuedAt}</div>
              <div>有效期</div><div>{c.validUntil}</div>
              <div>方法</div><div>{c.method}</div>
              <div>核验级别</div><div><LevelBadge level={c.level} /> <span style={{ fontSize: 12, color: '#6B7290' }}>{LEVELS[c.level].en}</span></div>
              <div>状态</div><div><StatusBadge status={c.status} /></div>
              {c.facts?.map(([k, v]) => <React.Fragment key={k}><div>{k}</div><div>{v}</div></React.Fragment>)}
            </div>
          </div>

          <div className="tp-sec">
            <div className="tp-sec-h">依据与证据 · EVIDENCE</div>
            <div className="tp-ev">
              {c.evidence.map((e, i) => (
                <div key={i} className="tp-ev-i">
                  <i className={e.ok === true ? '' : e.ok === 'review' ? 'r' : 'n'}>{e.ok === true ? '✓' : e.ok === 'review' ? '…' : '–'}</i>
                  <div style={{ minWidth: 0 }}><b>{e.label}</b><span>{e.detail}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="tp-sec">
            <div className="tp-sec-h">查验 · VERIFY</div>
            <div className="tp-verify">
              <svg viewBox="-4 -4 108 108"><rect x={-4} y={-4} width={108} height={108} fill="#fff" /><Qr text={qrText} x={0} y={0} size={100} /></svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#6B7290' }}>查验码</div>
                <div className="tp-verify-code">{c.code}</div>
                <div className="tp-verify-hash">{c.hash}</div>
                <div style={{ fontSize: 12, color: '#6B7290', marginTop: 6 }}>扫码或输入查验码，可在任何设备上查验</div>
              </div>
            </div>
            <VerifyBox c={c} />
          </div>
          {actions && <div className="tp-sec" style={{ display: 'grid', gap: 8 }}>{actions(close)}</div>}
        </>
      )}
    </Sheet>
  );
}
