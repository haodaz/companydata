'use client';

/**
 * 签证贴、出入境章、护照封皮、纸张底纹：全部 SVG + CSS 画（照 vsbp/scratch/ata/visa2.js 的 canvas 版搬过来）。
 * 防伪波纹、玫瑰花纹、全息光、红色流水号、MRZ 两行、二维码；章是双线边框 + 弧形字 + 墨迹不均 + 微微旋转。
 */
import React, { useEffect, useId, useRef } from 'react';
import type { StampArt, StampIcon, VisaArt, VisaTheme } from './data';
import { fitLen, hash, qrPath, seedOf, textW } from './lib';
import { useHolder } from './holder';
import type { CoverPattern, Look } from './themes';

export const SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",-apple-system,sans-serif';
export const SERIF = '"Songti SC","STSong","Noto Serif SC","Source Han Serif SC","SimSun",serif';
export const MONO = '"SF Mono",Menlo,Consolas,ui-monospace,monospace';
export const PAPER = '#FBF8F1';
const sid = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '');
const r1 = (n: number) => Math.round(n * 10) / 10;
const mix = (hex: string, to: string, t: number) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
};

/* ---------- 底纹路径（模块级缓存，服务端和浏览器算出来一样） ---------- */
const pathCache = new Map<string, string>();
function memo(key: string, f: () => string) { const h = pathCache.get(key); if (h) return h; const v = f(); pathCache.set(key, v); return v; }
function wavesPath(W: number, H: number, n: number, gap: number, top: number) {
  return memo(`w${W}x${H}x${n}`, () => {
    let d = '';
    for (let k = 0; k < n; k++) { for (let x = 0; x <= W; x += 5) { const y = top + k * gap + 6 * Math.sin(x / 32 + k * 0.33) + 3.5 * Math.sin(x / 9.5 - k * 0.5); d += (x ? 'L' : 'M') + r1(x) + ' ' + r1(y); } }
    return d;
  });
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function rosettePath(cx: number, cy: number, R: number, r: number, dd: number, n = 1100) {
  return memo(`r${cx},${cy},${R},${r},${dd}`, () => {
    let d = ''; const T = Math.PI * 2 * r / gcd(R, r);
    for (let i = 0; i <= n; i++) { const t = i / n * T; const x = cx + (R - r) * Math.cos(t) + dd * Math.cos((R - r) / r * t), y = cy + (R - r) * Math.sin(t) - dd * Math.sin((R - r) / r * t); d += (i ? 'L' : 'M') + r1(x) + ' ' + r1(y); }
    return d;
  });
}
function guillochePath(cx: number, cy: number) {
  return memo(`g${cx},${cy}`, () => {
    let d = '';
    for (let k = 0; k < 46; k++) { for (let i = 0; i <= 140; i++) { const a = i / 140 * Math.PI * 2, r = 200 + 24 * Math.sin(a * 9 + k * 0.09); const x = cx + r * Math.cos(a + k * 0.045), y = cy + r * Math.sin(a + k * 0.045); d += (i ? 'L' : 'M') + r1(x) + ' ' + r1(y); } }
    return d;
  });
}

/* ---------- 标志 ---------- */
/** 平方徽记：环 + 菱形 + 人 */
export function VsMark({ x, y, s, col, opacity = 1 }: { x: number; y: number; s: number; col: string; opacity?: number }) {
  return (
    <g opacity={opacity} stroke={col} fill="none">
      <circle cx={x} cy={y} r={s * 0.5} strokeWidth={s * 0.07} />
      <path d={`M${x} ${y - s * 0.3}L${x + s * 0.3} ${y}L${x} ${y + s * 0.3}L${x - s * 0.3} ${y}Z`} strokeWidth={s * 0.05} />
      <text x={x} y={y + s * 0.12} fill={col} stroke="none" fontSize={s * 0.34} fontWeight={900} textAnchor="middle" fontFamily={SERIF}>人</text>
    </g>
  );
}
/** ATA 方块版：红底白字 */
export function AtaSquare({ x, y, s, col = '#D80C18', knock = '#fff' }: { x: number; y: number; s: number; col?: string; knock?: string }) {
  return (
    <g>
      <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill={col} />
      <text x={x} y={y + s * 0.15} style={{ fill: knock }} fontSize={s * 0.4} fontWeight={900} textAnchor="middle" fontFamily={SANS}>ATA</text>
    </g>
  );
}
/** 企业徽记（虚构的北辰连锁）：六边形 + 北 */
export function EntMark({ x, y, s, col, ch = '北' }: { x: number; y: number; s: number; col: string; ch?: string }) {
  const pts = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + i * Math.PI / 3; return `${r1(x + s * 0.5 * Math.cos(a))},${r1(y + s * 0.5 * Math.sin(a))}`; }).join(' ');
  return (
    <g>
      <polygon points={pts} fill="none" stroke={col} strokeWidth={s * 0.07} />
      <text x={x} y={y + s * 0.13} fill={col} fontSize={s * 0.4} fontWeight={900} textAnchor="middle" fontFamily={SERIF}>{ch}</text>
    </g>
  );
}

/* ---------- 头像：证件照位。演示护照是郝大壮的插画；真实护照是本人上传的照片，没传就是中性剪影 + 姓氏首字 ---------- */
export function Portrait({ x, y, w, h, color, ink, id }: { x: number; y: number; w: number; h: number; color: string; ink: string; id: string }) {
  const holder = useHolder();
  const bg1 = mix(color, '#FFFFFF', 0.9), bg2 = mix(color, '#FFFFFF', 0.72);   // 底色跟着本人选的头像色走
  const s = w / 128;   // 剪影按 128×160 画，再按框缩放
  return (
    <g>
      <defs>
        <linearGradient id={`${id}pg`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={bg1} /><stop offset="1" stopColor={bg2} /></linearGradient>
        <clipPath id={`${id}pc`}><rect x={x} y={y} width={w} height={h} rx={10} /></clipPath>
      </defs>
      <g clipPath={`url(#${id}pc)`}>
        <rect x={x} y={y} width={w} height={h} fill={`url(#${id}pg)`} />
        {holder.photo
          ? <image href={holder.photo} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
          : (
            <g transform={`translate(${x} ${y}) scale(${r1(s * 1000) / 1000})`}>
              <path d="M10 160C12 124 34 106 64 106S116 124 118 160Z" fill={mix(color, '#FFFFFF', 0.45)} />
              <path d="M50 96h28v16c0 8-28 8-28 0Z" fill={mix(color, '#FFFFFF', 0.55)} />
              <circle cx={64} cy={64} r={31} fill={mix(color, '#FFFFFF', 0.4)} />
              <text x={64} y={75} textAnchor="middle" fontSize={32} fontWeight={900} fill="#fff" fontFamily={SERIF}>{holder.initial}</text>
            </g>
          )}
      </g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="none" stroke={ink} strokeOpacity={0.35} strokeWidth={1.2} />
    </g>
  );
}

/** 二维码（真的能扫） */
export function Qr({ text, x, y, size, col = '#1D2450', pad = 0 }: { text: string; x: number; y: number; size: number; col?: string; pad?: number }) {
  const q = qrPath(text), s = size / q.size;
  return (
    <g>
      {pad > 0 && <rect x={x - pad} y={y - pad} width={size + pad * 2} height={size + pad * 2} fill="#fff" rx={pad * 0.6} />}
      <path d={q.d} transform={`translate(${x} ${y}) scale(${r1(s * 100) / 100})`} fill={col} shapeRendering="crispEdges" />
    </g>
  );
}

/* ---------- 签证贴 ---------- */
export const VISA_THEMES: Record<VisaTheme, { c1: string; c2: string; ink: string; ink2: string }> = {
  vs: { c1: '#F4F1FF', c2: '#DDD5FF', ink: '#4B3BD6', ink2: '#1E9FD6' },
  ata: { c1: '#FFF6F4', c2: '#F8D3CF', ink: '#B3121C', ink2: '#D99A2B' },
  baiye: { c1: '#FFF7EE', c2: '#FBD8BC', ink: '#B4532A', ink2: '#D99A2B' },
  work: { c1: '#EFFAF5', c2: '#CBEBDD', ink: '#0F7A62', ink2: '#1E9FD6' },
  grant: { c1: '#F3F5FB', c2: '#DCE1F1', ink: '#1D2450', ink2: '#6D5BFF' },
};
const VW = 640, VH = 400;
function signature(x: number, y: number, seed: number) {
  let d = `M${x} ${y}`;
  for (let i = 0; i < 12; i++) d += `Q${x + i * 11 + 5.5} ${r1(y - 12 + 24 * hash(i + seed))} ${x + i * 11 + 11} ${r1(y + 3 - 7 * hash(i * 3 + seed))}`;
  return d;
}
/**
 * 特殊质感的追光（参考主人在 coco 项目里做的 HoloCard，收得更克制）：指针 / 手指在签上移动时签朝它微微倾斜、细光带跟着走；
 * 没人碰时光自己慢慢挪一点；有陀螺仪就轻微跟着手机倾斜；prefers-reduced-motion 时不动。
 */
function useFinishLight(ref: React.RefObject<HTMLDivElement | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !on || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = { x: 0.5, y: 0.5, on: 0 }, cur = { x: 0.5, y: 0.5, on: 0 };
    let touching = false, tilt = false, raf = 0;
    const t0 = performance.now() + Math.random() * 4000;
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); target.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); target.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); target.on = 1; touching = true; };
    const leave = () => { touching = false; };
    const orient = (e: DeviceOrientationEvent) => { if (touching || e.gamma == null || e.beta == null) return; tilt = true; target.x = 0.5 + Math.max(-1, Math.min(1, e.gamma / 30)) * 0.35; target.y = 0.5 + Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * 0.25; target.on = 0.6; };
    const tick = (now: number) => {
      if (!touching && !tilt) { const t = (now - t0) / 1000; target.x = 0.5 + Math.sin(t * 0.5) * 0.3; target.y = 0.5 + Math.sin(t * 0.33 + 1) * 0.12; target.on = 0.22; }
      const k = touching ? 0.16 : 0.05;
      cur.x += (target.x - cur.x) * k; cur.y += (target.y - cur.y) * k; cur.on += (target.on - cur.on) * 0.08;
      const dx = cur.x - 0.5, dy = cur.y - 0.5, st = el.style;
      st.setProperty('--px', `${(cur.x * 100).toFixed(1)}%`); st.setProperty('--py', `${(cur.y * 100).toFixed(1)}%`);
      st.setProperty('--dx', dx.toFixed(3)); st.setProperty('--on', cur.on.toFixed(3));
      st.setProperty('--rx', `${(-dy * 7 * cur.on).toFixed(2)}deg`); st.setProperty('--ry', `${(dx * 9 * cur.on).toFixed(2)}deg`);
      raf = requestAnimationFrame(tick);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave); el.addEventListener('pointercancel', leave);
    window.addEventListener('deviceorientation', orient);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); el.removeEventListener('pointercancel', leave); window.removeEventListener('deviceorientation', orient); };
  }, [ref, on]);
}

export function Visa({ v, avatar, qrText, className, style }: { v: VisaArt; avatar: string; qrText?: string; className?: string; style?: React.CSSProperties }) {
  const id = sid(useId());
  const fxRef = useRef<HTMLDivElement>(null);
  const fx = v.finish && v.finish !== 'matte' ? v.finish : undefined;
  useFinishLight(fxRef, !!fx);
  const t = VISA_THEMES[v.theme], ink = t.ink, seed = seedOf(v.no);
  const issuer = (() => {
    if (v.theme === 'ata') return (
      <g>
        <image href="/passport/ata-logo.png" x={22} y={18} width={140} height={25.8} preserveAspectRatio="xMinYMid meet" />
        <text x={22} y={58} fontSize={9.5} fontWeight={800} fill={ink} fillOpacity={0.75} fontFamily={MONO}>ATA INC. · 全美在线</text>
      </g>
    );
    if (v.theme === 'grant') return (
      <g>
        <AtaSquare x={36} y={34} s={28} />
        <VsMark x={74} y={34} s={28} col={ink} />
        <text x={96} y={39} fontSize={17} fontWeight={900} fill={ink} fontFamily={SERIF}>ATA × 平方创想</text>
        <text x={22} y={62} fontSize={9} fontWeight={800} fill={ink} fillOpacity={0.7} fontFamily={MONO}>{v.issuerEn || '联合签发 · JOINTLY ISSUED'}</text>
      </g>
    );
    const line = v.issuerLine || '平方创想';
    return (
      <g>
        {v.theme === 'work' ? <EntMark x={38} y={36} s={32} col={ink} /> : <VsMark x={38} y={36} s={32} col={ink} />}
        <text x={62} y={40} fontSize={17} fontWeight={900} fill={ink} fontFamily={SERIF} {...fitLen(line, 17, 230)}>{line}</text>
        <text x={62} y={55} fontSize={9} fontWeight={800} fill={ink} fillOpacity={0.7} fontFamily={MONO}>{v.issuerEn || 'VISIONSQUARE'}</text>
      </g>
    );
  })();
  const micro = (v.theme === 'ata' ? 'ATA·全美在线·' : v.theme === 'work' ? 'REALWORK·真活·' : 'VISIONSQUARE·平方·').repeat(16);
  return (
    <div ref={fxRef} className={`tp-visa ${className || ''}`} data-finish={fx} style={style}>
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`${v.type} ${v.no}`}>
        <defs>
          <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={t.c1} /><stop offset=".55" stopColor={t.c2} /><stop offset="1" stopColor={t.c1} /></linearGradient>
          <radialGradient id={`${id}sp`} cx=".75" cy=".2" r=".6"><stop offset="0" stopColor="#fff" stopOpacity=".6" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <linearGradient id={`${id}ovd`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF9AC8" /><stop offset=".35" stopColor="#9FE8F2" /><stop offset=".7" stopColor="#C3B8FF" /><stop offset="1" stopColor="#FFE08F" />
            <animateTransform attributeName="gradientTransform" type="rotate" from="0 .5 .5" to="360 .5 .5" dur="6s" repeatCount="indefinite" />
          </linearGradient>
          <clipPath id={`${id}cl`}><rect x="0" y="0" width={VW} height={VH} rx="16" /></clipPath>
        </defs>
        <g clipPath={`url(#${id}cl)`}>
          <rect width={VW} height={VH} fill={`url(#${id}bg)`} />
          <rect width={VW} height={VH} fill={`url(#${id}sp)`} />
          <path d={wavesPath(VW, VH, 34, 11.5, 20)} stroke={ink} strokeOpacity={0.085} strokeWidth={0.6} fill="none" />
          <path d={rosettePath(470, 230, 110, 39, 64)} stroke={ink} strokeOpacity={0.16} strokeWidth={0.6} fill="none" />
          <path d={rosettePath(470, 230, 74, 27, 40)} stroke={t.ink2} strokeOpacity={0.15} strokeWidth={0.6} fill="none" />
          <path d={rosettePath(110, 330, 66, 22, 38)} stroke={ink} strokeOpacity={0.1} strokeWidth={0.6} fill="none" />
          <g opacity={0.06}>{v.theme === 'ata' ? <AtaSquare x={320} y={205} s={170} col={ink} knock={t.c2} /> : v.theme === 'work' ? <EntMark x={320} y={205} s={190} col={ink} /> : <VsMark x={320} y={205} s={190} col={ink} />}</g>
          <text x={0} y={80} fontSize={5.5} fontWeight={700} fill={ink} fillOpacity={0.24} fontFamily={MONO}>{micro}</text>
          {issuer}
          <text x={618} y={48} textAnchor="end" fontSize={34} fontWeight={900} fill={ink} fontFamily={SERIF}>{v.type}</text>
          <text x={618} y={66} textAnchor="end" fontSize={9.5} fontWeight={800} fill={ink} fillOpacity={0.75} fontFamily={MONO}>{v.typeEn}</text>
          <text className="tp-visa-no" x={618} y={92} textAnchor="end" fontSize={16} fontWeight={800} fill="#C8102E" fontFamily={MONO} letterSpacing={0.5}>{v.no}</text>
          <Portrait x={22} y={98} w={128} h={160} color={avatar} ink={ink} id={id} />
          {v.fields.map(([k, val], i) => {
            const col = i % 2, row = Math.floor(i / 2), x = 166 + col * 148, y = 112 + row * 52, big = i === 0, max = col ? 160 : 140, size = big ? 20 : 16;
            return (
              <g key={k}>
                <text x={x} y={y} fontSize={8.5} fontWeight={800} fill={ink} fillOpacity={0.7} fontFamily={MONO}>{k}</text>
                <text x={x} y={y + 22} fontSize={size} fontWeight={900} fill="#20243F" fontFamily={SANS} {...fitLen(val, size, max)}>{val}</text>
              </g>
            );
          })}
          <Qr text={qrText || `TALENT-PASSPORT/VERIFY/${v.no.replace(/\s+/g, '')}`} x={496} y={106} size={112} col="#1D2450" pad={5} />
          <text x={166} y={276} fontSize={8.5} fontWeight={700} fill={ink} fillOpacity={0.65} fontFamily={MONO}>Signature of issuing officer · 签发</text>
          <path d={signature(170, 300, seed)} stroke={ink} strokeOpacity={0.8} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <g transform="translate(134 252)">
            <circle r={24} fill={`url(#${id}ovd)`} opacity={0.6} />
            {[6, 11, 16, 21].map(r => <circle key={r} r={r} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={0.8} />)}
          </g>
          <rect x={0} y={322} width={VW} height={78} fill="#fff" fillOpacity={0.55} />
          {v.mrz.map((m, i) => <text key={i} x={18} y={352 + i * 30} fontSize={15} fontWeight={600} fill="#2B2F45" fontFamily={MONO} textLength={604} lengthAdjust="spacingAndGlyphs">{m}</text>)}
        </g>
        <rect x={1} y={1} width={VW - 2} height={VH - 2} rx={16} fill="none" stroke={ink} strokeOpacity={0.55} strokeWidth={1.6} />
        <rect x={9} y={9} width={VW - 18} height={VH - 18} rx={11} fill="none" stroke={ink} strokeOpacity={0.22} strokeWidth={1} />
      </svg>
      <i className="tp-visa-holo" style={{ left: `${22 / VW * 100}%`, top: `${98 / VH * 100}%`, width: `${128 / VW * 100}%`, height: `${160 / VH * 100}%` }} />
      <i className="tp-visa-shine" />
      {fx && <><i className="tp-fx-band" /><i className="tp-fx-corner" /></>}
    </div>
  );
}

/* ---------- 出入境章 ---------- */
const STAMP_SIZE: Record<StampArt['shape'], [number, number]> = { round: [240, 240], rect: [380, 180], oval: [360, 200], tag: [400, 180], cham: [330, 200] };
export const stampAspect = (s: StampArt['shape']) => STAMP_SIZE[s][1] / STAMP_SIZE[s][0];
function shapeEl(shape: StampArt['shape'], w: number, h: number, i: number, sw: number, col: string) {
  const common = { fill: 'none', stroke: col, strokeWidth: sw };
  if (shape === 'round') return <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - i} {...common} />;
  if (shape === 'oval') return <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - i} ry={h / 2 - i} {...common} />;
  if (shape === 'rect') return <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={10} {...common} />;
  if (shape === 'tag') { const k = h * 0.32; return <polygon points={`${k + i * 0.4},${i} ${w - k - i * 0.4},${i} ${w - i},${h / 2} ${w - k - i * 0.4},${h - i} ${k + i * 0.4},${h - i} ${i},${h / 2}`} strokeLinejoin="round" {...common} />; }
  const k = h * 0.22; return <polygon points={`${k + i},${i} ${w - k - i},${i} ${w - i},${k + i} ${w - i},${h - k - i} ${w - k - i},${h - i} ${k + i},${h - i} ${i},${h - k - i} ${i},${k + i}`} strokeLinejoin="round" {...common} />;
}
export function Icon({ kind, x, y, s, col }: { kind: StampIcon; x: number; y: number; s: number; col: string }) {
  const sw = s * 0.12;
  let el: React.ReactNode = null;
  if (kind === 'ata') return <AtaSquare x={x} y={y} s={s * 0.95} col={col} knock="var(--paper, #FBF8F1)" />;
  if (kind === 'plane') el = <g transform="rotate(-28)"><path d={`M${-s * 0.6} 0L${s * 0.6} ${-s * 0.1}L${s * 0.6} ${s * 0.1}Z`} /><path d={`M0 ${-s * 0.05}L${-s * 0.25} ${-s * 0.55}L${-s * 0.05} ${-s * 0.55}L${s * 0.25} ${-s * 0.05}Z`} /><path d={`M0 ${s * 0.05}L${-s * 0.25} ${s * 0.55}L${-s * 0.05} ${s * 0.55}L${s * 0.25} ${s * 0.05}Z`} /></g>;
  if (kind === 'star') el = <polygon points={Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? s * 0.22 : s * 0.55, a = i / 10 * Math.PI * 2 - Math.PI / 2; return `${r1(r * Math.cos(a))},${r1(r * Math.sin(a))}`; }).join(' ')} />;
  if (kind === 'pen') el = <g transform="rotate(-40)"><rect x={-s * 0.12} y={-s * 0.6} width={s * 0.24} height={s * 0.85} /><path d={`M${-s * 0.12} ${s * 0.25}L${s * 0.12} ${s * 0.25}L0 ${s * 0.55}Z`} /></g>;
  if (kind === 'book') el = <g fill="none" stroke={col} strokeWidth={sw}><path d={`M0 ${-s * 0.3}Q${-s * 0.3} ${-s * 0.45} ${-s * 0.6} ${-s * 0.35}L${-s * 0.6} ${s * 0.4}Q${-s * 0.3} ${s * 0.3} 0 ${s * 0.45}Q${s * 0.3} ${s * 0.3} ${s * 0.6} ${s * 0.4}L${s * 0.6} ${-s * 0.35}Q${s * 0.3} ${-s * 0.45} 0 ${-s * 0.3}Z`} /><path d={`M0 ${-s * 0.3}L0 ${s * 0.45}`} /></g>;
  if (kind === 'check') el = <path d={`M${-s * 0.45} 0L${-s * 0.1} ${s * 0.35}L${s * 0.5} ${-s * 0.35}`} fill="none" stroke={col} strokeWidth={s * 0.18} strokeLinecap="round" strokeLinejoin="round" />;
  if (kind === 'chip') el = <g fill="none" stroke={col} strokeWidth={sw}><rect x={-s * 0.45} y={-s * 0.35} width={s * 0.9} height={s * 0.7} rx={s * 0.12} /><path d={`M${-s * 0.45} 0H${s * 0.45}M0 ${-s * 0.35}V${s * 0.35}`} /></g>;
  if (kind === 'case') el = <g><rect x={-s * 0.55} y={-s * 0.25} width={s * 1.1} height={s * 0.7} rx={s * 0.1} /><path d={`M${-s * 0.22} ${-s * 0.25}V${-s * 0.45}H${s * 0.22}V${-s * 0.25}`} fill="none" stroke={col} strokeWidth={sw} /></g>;
  if (kind === 'eye') el = <g fill="none" stroke={col} strokeWidth={sw}><path d={`M${-s * 0.6} 0Q0 ${-s * 0.6} ${s * 0.6} 0Q0 ${s * 0.6} ${-s * 0.6} 0Z`} /><circle r={s * 0.18} fill={col} /></g>;
  if (kind === 'lock') el = <g><rect x={-s * 0.42} y={-s * 0.05} width={s * 0.84} height={s * 0.6} rx={s * 0.08} /><path d={`M${-s * 0.25} ${-s * 0.05}V${-s * 0.25}A${s * 0.25} ${s * 0.25} 0 0 1 ${s * 0.25} ${-s * 0.25}V${-s * 0.05}`} fill="none" stroke={col} strokeWidth={sw} /></g>;
  return <g transform={`translate(${r1(x)} ${r1(y)})`} fill={col}>{el}</g>;
}
/** 墨迹：细噪点把字和边框啃出小白点 + 大块的浓淡不均 + 轻微抖动 */
function InkFilter({ id, seed }: { id: string; seed: number }) {
  return (
    <filter id={id} x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed % 97} result="fine" />
      <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={(seed % 89) + 3} result="coarse" />
      <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5 3.4" result="fineA" />
      <feColorMatrix in="coarse" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 2.05" result="coarseA" />
      <feComposite in="fineA" in2="coarseA" operator="arithmetic" k1={1} k2={0} k3={0} k4={0} result="mask" />
      <feComposite in="SourceGraphic" in2="mask" operator="in" result="inked" />
      <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves={1} seed={(seed % 71) + 5} result="warp" />
      <feDisplacementMap in="inked" in2="warp" scale={2.4} xChannelSelector="R" yChannelSelector="G" />
    </filter>
  );
}
function ArcText({ text, cx, cy, R, where, size, col, id, weight = 800 }: { text: string; cx: number; cy: number; R: number; where: 'top' | 'bottom'; size: number; col: string; id: string; weight?: number }) {
  const avail = Math.PI * R * 0.78, est = textW(text, size) + Array.from(text).length * size * 0.16;
  const sz = est > avail ? size * avail / est : size;
  const r = where === 'top' ? R - sz * 0.35 : R + sz * 0.35;
  const d = where === 'top' ? `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}` : `M${cx - r} ${cy}A${r} ${r} 0 0 0 ${cx + r} ${cy}`;
  return (
    <>
      <path id={id} d={d} fill="none" />
      <text fontSize={r1(sz)} fontWeight={weight} fill={col.startsWith('var(') ? undefined : col} style={col.startsWith('var(') ? { fill: col } : undefined} fontFamily={SANS} letterSpacing={r1(sz * 0.16)}>
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{text}</textPath>
      </text>
    </>
  );
}
export function Stamp({ s, seedKey, className, style }: { s: StampArt; seedKey: string; className?: string; style?: React.CSSProperties }) {
  const id = sid(useId());
  const [w, h] = STAMP_SIZE[s.shape], col = s.color, seed = seedOf(seedKey), cx = w / 2, cy = h / 2;
  let body: React.ReactNode;
  if (s.shape === 'round') {
    const S = Math.min(w, h), R = S / 2 - 30, iconK = s.icon === 'ata' ? 'star' : s.icon;
    const mainSize = Math.min(S * 0.17, (R * 1.7) / Math.max(1, textW(s.main, 1)));
    body = (
      <>
        <ArcText text={s.top} cx={cx} cy={cy} R={R} where="top" size={S * 0.075} col={col} id={`${id}t`} />
        {s.bottom && <ArcText text={s.bottom} cx={cx} cy={cy} R={R} where="bottom" size={S * 0.062} col={col} id={`${id}b`} weight={700} />}
        <Icon kind={iconK} x={cx - R - 1} y={cy} s={S * 0.07} col={col} />
        <Icon kind={iconK} x={cx + R + 1} y={cy} s={S * 0.07} col={col} />
        {s.icon === 'ata' && <AtaSquare x={cx} y={cy - S * 0.16} s={S * 0.15} col={col} knock="var(--paper, #FBF8F1)" />}
        <text x={cx} y={cy + S * (s.icon === 'ata' ? 0.06 : 0.04)} textAnchor="middle" fontSize={r1(mainSize)} fontWeight={900} fill={col} fontFamily={SANS}>{s.main}</text>
        {s.sub && <text x={cx} y={cy + S * 0.17} textAnchor="middle" fontSize={S * 0.075} fontWeight={800} fill={col} fontFamily={MONO} {...fitLen(s.sub, S * 0.075, R * 1.3)}>{s.sub}</text>}
      </>
    );
  } else {
    const narrow = s.shape === 'tag' ? 0.6 : s.shape === 'oval' ? 0.62 : 0.74;
    const tSize = h * 0.115, tw = Math.min(textW(s.top, tSize), w * narrow - h * 0.3);
    body = (
      <>
        <text x={cx} y={h * 0.28} textAnchor="middle" fontSize={r1(tSize)} fontWeight={800} fill={col} fontFamily={SANS} {...fitLen(s.top, tSize, w * narrow - h * 0.3)}>{s.top}</text>
        <Icon kind={s.icon} x={cx - tw / 2 - h * 0.11} y={h * 0.24} s={h * 0.12} col={col} />
        <Icon kind={s.icon} x={cx + tw / 2 + h * 0.11} y={h * 0.24} s={h * 0.12} col={col} />
        <line x1={w * (s.shape === 'oval' ? 0.16 : 0.14)} x2={w * (s.shape === 'oval' ? 0.84 : 0.86)} y1={h * 0.35} y2={h * 0.35} stroke={col} strokeWidth={1.4} />
        <text x={cx} y={h * 0.6} textAnchor="middle" fontSize={r1(h * 0.235)} fontWeight={900} fill={col} fontFamily={SANS} {...fitLen(s.main, h * 0.235, w * (narrow + 0.08))}>{s.main}</text>
        {s.date && <text x={cx} y={h * 0.76} textAnchor="middle" fontSize={r1(h * 0.105)} fontWeight={800} fill={col} fontFamily={MONO} {...fitLen(s.date, h * 0.105, w * narrow)}>{s.date}</text>}
        {s.sub && <text x={cx} y={h * 0.885} textAnchor="middle" fontSize={r1(h * 0.09)} fontWeight={700} fill={col} fontFamily={SANS} {...fitLen(s.sub, h * 0.09, w * (narrow - 0.1))}>{s.sub}</text>}
      </>
    );
  }
  return (
    <svg className={`tp-stamp ${className || ''}`} style={style} viewBox={`-12 -12 ${w + 24} ${h + 24}`} role="img" aria-label={`${s.top} ${s.main}`}>
      <defs><InkFilter id={`${id}ink`} seed={seed} /></defs>
      <g filter={`url(#${id}ink)`}>
        {shapeEl(s.shape, w, h, 2, 4.5, col)}
        {shapeEl(s.shape, w, h, 11, 1.6, col)}
        {body}
      </g>
    </svg>
  );
}

/* ---------- 纸：奶白底 + 防伪波纹 + 中间的扭索纹圈 ---------- */
export function Paper({ tint }: { tint: string }) {
  return (
    <svg className="tp-paper" viewBox="0 0 707 1000" preserveAspectRatio="none" aria-hidden>
      <path d={wavesPath(707, 1000, 40, 24.5, 26)} stroke={tint} strokeOpacity={0.07} strokeWidth={1} fill="none" />
      <path d={guillochePath(353, 540)} stroke={tint} strokeOpacity={0.035} strokeWidth={0.8} fill="none" />
      <rect x={18} y={18} width={671} height={964} fill="none" stroke="#1D2450" strokeOpacity={0.26} strokeWidth={1.3} />
      <rect x={25} y={25} width={657} height={950} fill="none" stroke="#1D2450" strokeOpacity={0.18} strokeWidth={0.6} />
    </svg>
  );
}

/* ---------- 封皮：深藏青 + 金色烫字 ---------- */
export function CoverEmblem() {
  const id = sid(useId());
  return (
    <svg viewBox="0 0 300 300" className="tp-cover-emblem" aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">{FOIL_STOPS.map(([o, v]) => <stop key={o} offset={o} style={{ stopColor: `var(${v[0]}, ${v[1]})` }} />)}</linearGradient>
      </defs>
      <circle cx={150} cy={150} r={140} fill="none" stroke={`url(#${id}g)`} strokeWidth={5} />
      <circle cx={150} cy={150} r={128} fill="none" stroke={`url(#${id}g)`} strokeWidth={1.5} />
      <ArcText text="TALENT PASSPORT · 可信人才档案" cx={150} cy={150} R={112} where="top" size={17} col="var(--ftext, #E6C987)" id={`${id}t`} weight={700} />
      <ArcText text="ATA × VISIONSQUARE" cx={150} cy={150} R={112} where="bottom" size={15} col="var(--ftext, #E6C987)" id={`${id}b`} weight={700} />
      <circle cx={34} cy={150} r={3} style={{ fill: 'var(--ftext, #E6C987)' }} /><circle cx={266} cy={150} r={3} style={{ fill: 'var(--ftext, #E6C987)' }} />
      <rect x={95} y={95} width={110} height={110} rx={10} fill="none" stroke={`url(#${id}g)`} strokeWidth={5} />
      <path d="M150 105L195 150L150 195L105 150Z" fill="none" stroke={`url(#${id}g)`} strokeWidth={4} strokeLinejoin="round" />
      <text x={150} y={168} textAnchor="middle" fontSize={48} fontWeight={900} fill={`url(#${id}g)`} fontFamily={SERIF}>人</text>
    </svg>
  );
}
/** 封面的烫印纹样：画在封皮底下，颜色跟着烫金 / 烫银走 */
export function CoverPat({ kind }: { kind: CoverPattern }) {
  const id = sid(useId());
  if (kind === 'plain') return null;
  const tile = kind === 'fret'
    ? <path d="M2 2h16v16H6V6h8v8h-4" fill="none" strokeWidth={1.1} style={{ stroke: 'var(--ftext, #E6C987)' }} />
    : kind === 'wave'
      ? <path d="M0 10c5-6 10-6 20 0s15 6 20 0M0 20c5-6 10-6 20 0s15 6 20 0" fill="none" strokeWidth={.8} style={{ stroke: 'var(--ftext, #E6C987)' }} />
      : <><circle cx={5} cy={5} r={.9} style={{ fill: 'var(--ftext, #E6C987)' }} /><path d="M15 12.5l.8 1.9 2 .2-1.5 1.3.5 2-1.8-1.1-1.8 1.1.5-2-1.5-1.3 2-.2Z" style={{ fill: 'var(--ftext, #E6C987)' }} /></>;
  const w = kind === 'wave' ? 40 : 20, h = 20;
  return (
    <svg className={`tp-cover-pat ${kind}`} aria-hidden>
      <defs><pattern id={`${id}p`} width={w} height={h} patternUnits="userSpaceOnUse">{tile}</pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${id}p)`} />
    </svg>
  );
}
const FOIL_STOPS: [string, [string, string]][] = [['0', ['--f1', '#B98E3E']], ['.35', ['--f2', '#F6E1A6']], ['.55', ['--f3', '#D2A95A']], ['.75', ['--f4', '#FFF3CC']], ['1', ['--f5', '#C39648']]];
export function Cover({ owner, hint, className, look }: { owner?: string; hint?: string; className?: string; look?: Look }) {
  const holder = useHolder();
  const lk = look || holder.look;
  return (
    <div className={`tp-cover ${className || ''}`}>
      {lk && <CoverPat kind={lk.pattern} />}
      <div className="tp-cover-grain" />
      <div className="tp-cover-spine" />
      <div className="tp-cover-in">
        <div className="tp-cover-top">
          <div className="tp-serif tp-foil tp-cover-brand">ATA × 平方创想</div>
          <div className="tp-mono tp-cover-sub">TALENT PASSPORT · 联合签发</div>
        </div>
        <CoverEmblem />
        <div className="tp-serif tp-foil tp-cover-title">人才护照</div>
        <div className="tp-mono tp-cover-en">TALENT PASSPORT</div>
        <i className="tp-cover-rule" />
        {owner && <div className="tp-serif tp-cover-owner">{owner}</div>}
        {lk?.motto && <div className="tp-serif tp-foil tp-cover-motto">「{lk.motto}」</div>}
        <div className="tp-cover-chiprow">
          <i className="tp-chip" />
          <svg viewBox="0 0 40 26" className="tp-epass" aria-hidden><rect x="1.5" y="1.5" width="37" height="23" rx="3" fill="none" strokeWidth="2" style={{ stroke: 'var(--ftext, #E6C987)' }} /><path d="M1.5 9H38.5M1.5 17H38.5" strokeWidth="2" style={{ stroke: 'var(--ftext, #E6C987)' }} /><circle cx="20" cy="13" r="4.5" strokeWidth="2" style={{ fill: 'var(--cv2, #1B1E44)', stroke: 'var(--ftext, #E6C987)' }} /></svg>
        </div>
        {hint && <div className="tp-cover-hint">{hint}</div>}
      </div>
      <i className="tp-cover-sheen" />
    </div>
  );
}

/* ---------- 长处页的奖章 ---------- */
export function Medal({ n, color = '#C9A24A' }: { n: number; color?: string }) {
  const id = sid(useId());
  const pts = Array.from({ length: 32 }, (_, i) => { const r = i % 2 ? 40 : 46, a = i / 32 * Math.PI * 2; return `${r1(50 + r * Math.cos(a))},${r1(48 + r * Math.sin(a))}`; }).join(' ');
  return (
    <svg viewBox="0 0 100 120" className="tp-medal" aria-hidden>
      <defs><linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={mix(color, '#FFFFFF', 0.45)} /><stop offset=".5" stopColor={color} /><stop offset="1" stopColor={mix(color, '#000000', 0.25)} /></linearGradient></defs>
      <path d="M32 80L22 118L38 108L46 120L52 84Z" fill="#5B4BDB" /><path d="M68 80L78 118L62 108L54 120L48 84Z" fill="#4335B8" />
      <polygon points={pts} fill={`url(#${id}m)`} />
      <circle cx={50} cy={48} r={33} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={1.2} />
      <circle cx={50} cy={48} r={28} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="2 2" />
      <text x={50} y={60} textAnchor="middle" fontSize={34} fontWeight={900} fill="#fff" fontFamily={SERIF}>{n}</text>
    </svg>
  );
}
