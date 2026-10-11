'use client';

/**
 * 开腹台面（外科的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900），自己管手势，往隐藏控件里写。
 *   - 中央是病人的腹壁，斜线是麦氏切口；左边一条「剖面」：六层组织、刀尖沉到哪一层、这一层要到多深
 *   - 上面一排器械，该用的那把在发光；点一下换到手里
 *   - 按住 = 下刀（刀慢慢沉），沉到绿色区间再划；松开 = 提刀
 *   - 血管钳：插进切口往两边一撑；镊子：夹起腹膜后留在原地当左手；牵开器：放进切口
 * 每一层揭开的组织是看得见的：皮肤 → 黄色皮下 → 白色腱膜 → 红色肌层（撑开的楔口）→ 腹膜 → 腹腔。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { ToolShape } from '@/components/lab/ToolShape';
import { LAP_BANDS, LAP_TOOLS } from '@/lib/lab-surgery-spec';

const A = { x: 620, y: 450 }, B = { x: 980, y: 640 };            // 切口两端（场景坐标）
const L = Math.hypot(B.x - A.x, B.y - A.y), UX = (B.x - A.x) / L, UY = (B.y - A.y) / L, NX = -UY, NY = UX;
const CX = 800, CY = 545, RX = 430, RY = 240;                    // 腹壁椭圆
const STRATA = [
  { n: '皮肤', to: 3, c: '#e9c6aa' }, { n: '皮下脂肪', to: 12, c: '#f0d78d' }, { n: '腹外斜肌腱膜', to: 16, c: '#efe9da' },
  { n: '肌层', to: 24, c: '#b35b52' }, { n: '腹膜', to: 28, c: '#d6b2a3' }, { n: '腹腔', to: 36, c: '#5c2a24' },
];
const DEPTH_RATE = 7;      // 按住时刀下沉的速度，mm / 秒（真实时间）
const NEAR = 70;           // 离切口线多近才算在线上

type Pt = { x: number; y: number };
const onLine = (p: Pt) => { const t = ((p.x - A.x) * UX + (p.y - A.y) * UY) / L; const px = A.x + UX * L * t, py = A.y + UY * L * t; return { t: Math.min(1, Math.max(0, t)), dist: Math.hypot(p.x - px, p.y - py) }; };
const at = (t: number) => ({ x: A.x + UX * L * t, y: A.y + UY * L * t });
const ANG = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;

export function LaparotomyStage({ st, running, auto, act, setHidden, toScene }: {
  st: BenchState; running: boolean; auto: boolean;
  /** 记事件的控件（器械、撑开、夹起、牵开器） */ act: (id: string, v: number) => void;
  /** 隐藏控件（刀深、进度、偏离） */ setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => Pt | null;
}) {
  const cut = st.controls.cut || 0, tool = Math.round(st.controls.tool || 0), depth = st.controls.depth || 0;
  const spread = Math.round(st.controls.spread || 0), lift = st.controls.lift === 1, retract = st.controls.retract === 1;
  const bandI = Math.min(4, Math.floor(cut / 20)), band = LAP_BANDS[bandI];
  const bandFrac = Math.min(1, (cut - bandI * 20) / 20);

  // 手：指针位置、按没按、按下去那一刻的位置 / 时间；这一次按住里撑开算过没有
  const [hand, setHand] = useState<Pt | null>(null);
  const press = useRef<{ p: Pt; t: number; moved: boolean; spreadDone: boolean } | null>(null);
  const [pressing, setPressing] = useState(false);
  const canCut = running && !auto;

  // 按住不动：刀慢慢沉（真实时间）。正在划的时候不沉（刀在走，不在往下压）；帧间隔封顶，后台标签页醒来不会一下沉一大截
  const lastMove = useRef(0);
  const bandRef = useRef(band); bandRef.current = band;
  useEffect(() => {
    if (!pressing || !canCut || !(tool === 0 || tool === 1)) return;
    let raf = 0, last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!press.current || now - lastMove.current < 150) return;
      const d = st.controls.depth || 0;
      // 组织有阻力：离这一层还远时沉得快，快到了就慢下来（13–16 这种 3 mm 的区间要留得住）
      const [lo, hi] = bandRef.current.depth;
      const rate = hi > 0 && d >= lo - 1.5 ? (d <= hi ? DEPTH_RATE * 0.18 : DEPTH_RATE * 0.3) : DEPTH_RATE;
      setHidden('depth', Math.min(40, d + rate * dt));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressing, canCut, tool]);

  // 自愈：划到 98% 以上就算这一层到头（浮点 / 松手早了半个像素都别卡人）
  useEffect(() => {
    if (!canCut || bandI >= 4) return;
    if (bandFrac >= 0.98 && cut < bandI * 20 + 20) setHidden('cut', bandI * 20 + 20);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut, canCut]);

  const down = (e: React.PointerEvent) => {
    if (!canCut) return;
    const p = toScene(e.clientX, e.clientY); if (!p) return;
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* 合成事件没有 pointerId */ }
    press.current = { p, t: performance.now(), moved: false, spreadDone: false };
    setHand(p); setPressing(true);
    const { t, dist } = onLine(p);
    if (dist > NEAR) return;
    // 刀从已经切开的层次底部起步（上面的组织早开了），再按住一会儿就到这一层
    if (tool === 0 || tool === 1) setHidden('depth', [0, 12, 16, 24, 28][bandI] || 0);
    // 镊子：夹起腹膜（只在第四层有意义，早夹也记下来）
    if (tool === 3 && !lift && bandI >= 3) act('lift', 1);
    // 牵开器：放进切口
    if (tool === 4 && bandI >= 4 && !retract) { act('retract', 1); setHidden('cut', 100); }
    void t;
  };
  const move = (e: React.PointerEvent) => {
    const p = toScene(e.clientX, e.clientY); if (!p) return;
    setHand(p);
    const pr = press.current; if (!pr || !canCut) return;
    const { t, dist } = onLine(p);
    const movedPx = Math.hypot(p.x - pr.p.x, p.y - pr.p.y);
    if (movedPx > 14) { pr.moved = true; lastMove.current = performance.now(); }
    setHidden('dev', Math.round(dist * 0.9));
    // 血管钳：垂直于切口撑开 ≥ 70 像素算一次（每次按住只算一次）
    if (tool === 2 && band.kind === 'spread' && !pr.spreadDone) {
      const perp = Math.abs((p.x - pr.p.x) * NX + (p.y - pr.p.y) * NY);
      if (onLine(pr.p).dist <= NEAR && perp >= 70 && spread < 3) { pr.spreadDone = true; act('spread', spread + 1); setHidden('cut', 40 + (spread + 1) * 20 / 3); }
      return;
    }
    // 刀 / 电刀：沿线划。刀没沉到这一层就划 = 没切透
    if (!(tool === 0 || tool === 1) || dist > NEAR) { setHidden('shallow', 0); return; }
    const stroke = band.kind === 'stroke' || band.kind === 'liftcut' || band.kind === 'spread';
    if (!stroke) return;
    const [lo] = band.depth;
    const need = band.kind === 'spread' ? 17 : lo;   // 肌层拿刀切（违规）也得沉到肌层才切得动
    if (depth < need) { if (pr.moved) setHidden('shallow', 1); return; }
    setHidden('shallow', 0);
    const [s0, s1] = band.span;
    const frac = Math.min(1, Math.max(0, (t - s0) / (s1 - s0)));
    // 划到头就取整到这一层的 20 分（浮点算出 79.999 会卡住下一层）
    const want = frac >= 0.985 ? bandI * 20 + 20 : bandI * 20 + frac * 20;
    if (want > cut + 0.05 && want - cut < 12) setHidden('cut', Math.min(bandI * 20 + 20, want));
  };
  const up = () => { press.current = null; setPressing(false); setHidden('depth', 0); setHidden('shallow', 0); };

  // ── 画面 ──
  const toolName = LAP_TOOLS[tool]?.name || 'scalpel';
  const head = hand && canCut ? hand : at(bandI >= 4 ? 0.5 : band.span[0] + (band.span[1] - band.span[0]) * (band.kind === 'spread' ? 0.5 : bandFrac));
  const lens = (t0: number, t1: number, half: number) => {
    const p0 = at(t0), p1 = at(t1), m = at((t0 + t1) / 2);
    return `M ${p0.x} ${p0.y} Q ${m.x + NX * half} ${m.y + NY * half} ${p1.x} ${p1.y} Q ${m.x - NX * half} ${m.y - NY * half} ${p0.x} ${p0.y} Z`;
  };
  const skinFrac = cut >= 20 ? 1 : bandFrac, fasciaFrac = cut >= 40 ? 1 : bandI === 1 ? bandFrac : 0;
  const peritFrac = cut >= 80 ? 1 : bandI === 3 ? bandFrac : 0;
  const open = retract ? 2.1 : 1;
  const top = STRATA.findIndex(s => depth <= s.to); const topI = top < 0 ? 5 : top;
  const [lo, hi] = band.depth;
  const inBand = depth >= lo && depth <= hi;
  const needTool = band.tools[0];
  const strip = { x: 70, y: 236, w: 200, h: 500 };
  const mmY = (mm: number) => strip.y + 28 + (strip.h - 56) * Math.min(1, mm / 36);

  return (
    <g>
      {/* 腹壁 */}
      <defs>
        <radialGradient id="lap-abd" cx="44%" cy="34%" r="76%"><stop offset="0%" stopColor="#f3d5ba" /><stop offset="60%" stopColor="#e4bd9d" /><stop offset="100%" stopColor="#c89a77" /></radialGradient>
        <filter id="lap-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10" /></filter>
      </defs>
      <ellipse cx={CX} cy={CY + 14} rx={RX} ry={RY} fill="rgba(0,0,0,.35)" filter="url(#lap-soft)" />
      <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="url(#lap-abd)" />
      {/* 划线标记（术前画的切口线） */}
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(60,30,90,.55)" strokeWidth={3} strokeDasharray="14 10" />
      {/* 第一层：皮肤皮下，划到哪开到哪 */}
      {skinFrac > 0.01 && <path d={lens(0, skinFrac, 26 * open)} fill={STRATA[1].c} stroke="rgba(120,70,50,.6)" strokeWidth={2.5} />}
      {/* 第二层：腱膜露出来（白） */}
      {fasciaFrac > 0.01 && <path d={lens(0, fasciaFrac, 19 * open)} fill={STRATA[2].c} />}
      {/* 第三层：肌层——撑开的楔口，一处一处出现 */}
      {cut >= 40 && <path d={lens(0, 1, 13 * open)} fill={STRATA[3].c} opacity={0.9} />}
      {[0.2, 0.5, 0.8].slice(0, spread).map((t, i) => { const p = at(t); return <ellipse key={i} cx={p.x} cy={p.y} rx={34} ry={13 * open} transform={`rotate(${ANG} ${p.x} ${p.y})`} fill="#7a2f29" stroke="#f1a99e" strokeWidth={2} />; })}
      {/* 第四层：腹膜露出来、被夹起的帐篷、切开后的腹腔 */}
      {cut >= 60 && <path d={lens(0.12, 0.88, 9 * open)} fill={STRATA[4].c} />}
      {lift && (() => { const m = at(0.5); return <path d={`M ${m.x - UX * 40} ${m.y - UY * 40} L ${m.x + NX * 22} ${m.y + NY * 22} L ${m.x + UX * 40} ${m.y + UY * 40} Z`} fill="#e8c7b8" stroke="#8c5a4a" strokeWidth={2} />; })()}
      {peritFrac > 0.01 && <path d={lens(0.34, 0.34 + 0.32 * peritFrac, 6 * open)} fill={STRATA[5].c} />}
      {/* 肌层拿刀切 / 腹膜没提就切：出血点 */}
      {(st.vars.sharp_muscle > 0 || st.vars.blind_perit > 0) && [0.3, 0.45, 0.6, 0.7].map((t, i) => { const p = at(t); return <circle key={i} cx={p.x + NX * (i % 2 ? 9 : -7)} cy={p.y + NY * (i % 2 ? 9 : -7)} r={5 + i} fill="#b3121e" opacity={0.85} />; })}
      {/* 牵开器 */}
      {retract && [1, -1].map(sd => { const m = at(0.5); const mx = m.x + NX * 58 * sd, my = m.y + NY * 58 * sd; return <g key={sd} transform={`translate(${mx} ${my}) rotate(${ANG})`}><rect x={-60} y={-8} width={120} height={16} rx={6} fill="#c3c9d4" stroke="#79818f" strokeWidth={2} /><rect x={-7} y={sd > 0 ? 6 : -28} width={14} height={22} rx={3} fill="#aeb6c4" /></g>; })}
      {/* 留在原地的镊子（左手） */}
      {lift && (() => { const m = at(0.5); return <g transform={`translate(${m.x + NX * 16} ${m.y + NY * 16}) rotate(${ANG - 70})`} opacity={0.92}><ToolShape name="forceps" s={0.8} /></g>; })()}

      {/* 手里的器械（跟着指针；演示时跟着进度） */}
      {(tool !== 3 || !lift) && <g transform={`translate(${head.x} ${head.y}) rotate(${ANG})`} pointerEvents="none" opacity={0.96}>
        <ToolShape name={toolName} s={0.9} />
      </g>}
      {/* 下刀：刀尖处一圈，沉到区间变绿 */}
      {pressing && (tool === 0 || tool === 1) && hand && <g pointerEvents="none">
        <circle cx={hand.x} cy={hand.y} r={18 + depth * 1.2} fill="none" stroke={depth > hi + 3 ? '#ff3b5c' : inBand ? '#3ddc97' : '#ffd166'} strokeWidth={4} opacity={0.9} />
        <text x={hand.x} y={hand.y - 30 - depth} textAnchor="middle" fill="#fff" fontSize={20} fontWeight={800} style={{ textShadow: '0 1px 5px rgba(0,0,0,.9)' }}>{depth.toFixed(0)} mm{depth > hi + 3 ? ' · 太深了' : inBand ? ' · 划' : depth < lo ? ' · 再沉一点' : ''}</text>
      </g>}

      {/* 剖面：六层组织 + 刀尖在哪 + 这一层要到多深 */}
      <g>
        <rect x={strip.x - 16} y={strip.y - 16} width={strip.w + 32} height={strip.h + 32} rx={16} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={strip.x} y={strip.y + 2} fill="#9aa0b8" fontSize={14} fontFamily="ui-monospace, Menlo, monospace" letterSpacing={2}>剖面 · SECTION</text>
        {STRATA.map((s, i) => { const y0 = mmY(i ? STRATA[i - 1].to : 0), y1 = mmY(s.to); const cur = i === Math.min(5, bandI === 0 ? 1 : bandI === 1 ? 2 : bandI === 2 ? 3 : bandI === 3 ? 4 : 5) || (bandI === 0 && i === 0); return (
          <g key={s.n}>
            <rect x={strip.x} y={y0} width={strip.w - 60} height={Math.max(2, y1 - y0)} fill={s.c} stroke={cur ? '#fff' : 'rgba(0,0,0,.25)'} strokeWidth={cur ? 3 : 1} />
            <text x={strip.x + strip.w - 54} y={(y0 + y1) / 2 + 5} fill={cur ? '#fff' : '#9aa0b8'} fontSize={13} fontWeight={cur ? 800 : 500}>{s.n}</text>
          </g>); })}
        {/* 目标区间 */}
        {hi > 0 && <rect x={strip.x - 8} y={mmY(lo)} width={6} height={Math.max(4, mmY(hi) - mmY(lo))} fill="#3ddc97" rx={2} />}
        {hi > 0 && <text x={strip.x - 12} y={mmY(hi) + 16} textAnchor="end" fill="#3ddc97" fontSize={12} fontWeight={700}>{lo}–{hi}</text>}
        {/* 刀尖 */}
        {(tool === 0 || tool === 1) && <g transform={`translate(${strip.x + strip.w - 72} ${mmY(depth)})`}>
          <polygon points="0,0 -16,-9 -16,9" fill={depth > hi + 3 ? '#ff3b5c' : inBand ? '#3ddc97' : '#ffd166'} />
          <text x={-22} y={5} textAnchor="end" fill="#fff" fontSize={13} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{depth.toFixed(0)}</text>
        </g>}
        <text x={strip.x} y={strip.y + strip.h + 8} fill="#9aa0b8" fontSize={12}>{topI < 5 ? `刀尖在：${STRATA[Math.max(0, topI)].n}` : '刀尖已进腹腔'}</text>
      </g>

      {/* 器械盘 */}
      <g>
        <rect x={430} y={60} width={760} height={118} rx={18} fill="rgba(12,16,32,.55)" stroke="rgba(255,255,255,.25)" strokeWidth={2} />
        <text x={450} y={52} fill="#fff" fontSize={18} fontWeight={700} style={{ textShadow: '0 1px 5px rgba(0,0,0,.8)' }}>器械 · 点一下换手里的</text>
        {LAP_TOOLS.map((tl, i) => { const x = 450 + i * 146, sel = tool === tl.v, glow = needTool === tl.v && !sel; return (
          <g key={tl.v} style={{ cursor: canCut ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canCut) act('tool', tl.v); }}>
            {glow && <rect x={x - 6} y={66} width={142} height={106} rx={16} fill="none" stroke="#ffd166" strokeWidth={4} opacity={0.9}><animate attributeName="opacity" values="0.9;0.25;0.9" dur="1.2s" repeatCount="indefinite" /></rect>}
            <rect x={x} y={72} width={130} height={94} rx={14} fill={sel ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.14)'} stroke={sel ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={sel ? 3 : 1.5} />
            <g transform={`translate(${x + 80} 112) scale(0.42)`} pointerEvents="none"><ToolShape name={tl.name} /></g>
            <text x={x + 65} y={158} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={700} pointerEvents="none">{tl.label}</text>
          </g>); })}
      </g>

      {/* 目标标记：该点哪、该划哪一段，画在肚子上 */}
      {(() => {
        const ring = (t: number, label: string, key: string) => { const p = at(t); return (
          <g key={key} pointerEvents="none">
            <circle cx={p.x} cy={p.y} r={30} fill="none" stroke="#ffd166" strokeWidth={4}><animate attributeName="r" values="24;40;24" dur="1.1s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;.35;1" dur="1.1s" repeatCount="indefinite" /></circle>
            <text x={p.x} y={p.y - 48} textAnchor="middle" fill="#ffd166" fontSize={19} fontWeight={800} style={{ textShadow: '0 1px 5px rgba(0,0,0,.9)' }}>{label}</text>
          </g>); };
        // 要划的那一段点亮；提示字写在起点旁边（「从这头」就得真的在这头），起点画个脉动圈
        const seg = (t0: number, t1: number, label: string) => { const p0 = at(t0), p1 = at(t1); return (
          <g pointerEvents="none">
            <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#ffd166" strokeWidth={6} strokeLinecap="round" strokeDasharray="12 10"><animate attributeName="stroke-dashoffset" values="0;-44" dur="1s" repeatCount="indefinite" /></line>
            <circle cx={p0.x} cy={p0.y} r={26} fill="none" stroke="#ffd166" strokeWidth={4}><animate attributeName="r" values="20;34;20" dur="1.1s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;.35;1" dur="1.1s" repeatCount="indefinite" /></circle>
            <text x={p0.x - 36} y={p0.y - 40} textAnchor="end" fill="#ffd166" fontSize={19} fontWeight={800} style={{ textShadow: '0 1px 5px rgba(0,0,0,.9)' }}>{label} →</text>
          </g>); };
        if (!canCut) return null;
        if (band.kind === 'stroke') return band.tools.includes(tool) && !pressing ? seg(bandFrac, 1, bandFrac > 0.02 ? '从这儿接着划' : '从这头按住，沉到位再划') : null;
        if (band.kind === 'spread') return tool === 2 ? [0.2, 0.5, 0.8].slice(spread).map((t, i) => ring(t, i === 0 ? '钳尖插这里，往外撑' : '', `sp${t}`)) : null;
        if (band.kind === 'liftcut') return !lift ? (tool === 3 ? ring(0.5, '镊子点这里，夹起腹膜', 'lift') : null) : tool === 0 ? seg(0.34 + 0.32 * bandFrac, 0.66, '手术刀：这一小段') : null;
        if (band.kind === 'place') return tool === 4 && !retract ? ring(0.5, '牵开器放这里', 'ret') : null;
        return null;
      })()}

      {/* 左手 / 右手 */}
      <g pointerEvents="none">
        <rect x={54} y={96} width={340} height={112} rx={18} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={70} y={126} fill="#9aa0b8" fontSize={13} fontFamily="ui-monospace, Menlo, monospace" letterSpacing={2}>两只手 · HANDS</text>
        <text x={70} y={152} fill="#9aa0b8" fontSize={13}>左手</text>
        <text x={112} y={153} fill={lift ? '#3ddc97' : '#e6e8f5'} fontSize={17} fontWeight={800}>{lift ? '镊子 · 夹着腹膜' : retract ? '扶着牵开器' : '空着'}</text>
        <text x={70} y={180} fill="#9aa0b8" fontSize={13}>右手</text>
        <text x={112} y={181} fill="#ffd166" fontSize={17} fontWeight={800}>{LAP_TOOLS[tool]?.label}（鼠标）</text>
        <text x={70} y={200} fill="#6b7089" fontSize={11.5}>镊子夹住后留在原地当左手，右手接着换器械</text>
      </g>

      {/* 这一层：分步清单，走到哪一步亮到哪 */}
      {(() => {
        const toolOk = band.tools.includes(tool);
        const sunk = (pressing && depth >= lo) || bandFrac > 0.02;   // 划起来了就说明沉到位过
        const strokeSteps = (): [string, boolean][] => [[`拿${LAP_TOOLS[band.tools[0]].label}`, toolOk], [`按住不动，让刀沉到 ${lo}–${hi} mm`, sunk], ['沿线划到头', bandFrac >= 0.98]];
        const list: [string, boolean][] = band.kind === 'stroke' ? strokeSteps()
          : band.kind === 'spread' ? [['拿血管钳', toolOk], ['钳尖插进切口，往外一撑（三处）', spread >= 3]]
          : band.kind === 'liftcut' ? [['拿镊子', tool === 3 || lift], ['点切口中段，夹起腹膜（它就留在那儿当左手）', lift], ['换手术刀', lift && tool === 0], [`按住沉到 ${lo}–${hi} mm`, lift && ((pressing && depth >= lo) || bandFrac > 0.02)], ['在镊子旁边划一小段', bandFrac >= 0.98]]
          : [['拿牵开器', toolOk], ['点切口，放进去', retract]];
        const cur = list.findIndex(x => !x[1]);
        return (
          <g pointerEvents="none">
            <rect x={300} y={744} width={1000} height={118} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
            <text x={326} y={782} fill="#ffd166" fontSize={24} fontWeight={800}>{band.title}</text>
            {band.kind === 'spread' && <text x={1270} y={782} textAnchor="end" fill="#3ddc97" fontSize={22} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{spread}/3</text>}
            {list.map(([label, done], i) => { const x = 326 + (list.length <= 3 ? i * 320 : i * 192), on = i === cur; return (
              <g key={label}>
                <circle cx={x + 9} cy={822} r={9} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
                {done && <text x={x + 9} y={827} textAnchor="middle" fill="#0f1224" fontSize={12} fontWeight={900}>✓</text>}
                <text x={x + 26} y={828} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={list.length <= 3 ? 17 : 14} fontWeight={on ? 800 : 500}>{i + 1}. {label}</text>
              </g>); })}
          </g>
        );
      })()}

      {/* 接手势的面（放最上面，器械盘自己 stopPropagation） */}
      <rect x={0} y={0} width={1600} height={900} fill="transparent" style={{ cursor: canCut ? 'crosshair' : 'default', touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
      {/* 器械盘要能点：再画一遍透明热区在手势面上面 */}
      {LAP_TOOLS.map((tl, i) => <rect key={tl.v} x={450 + i * 146} y={72} width={130} height={94} rx={14} fill="transparent" style={{ cursor: canCut ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canCut) act('tool', tl.v); }} />)}
    </g>
  );
}
