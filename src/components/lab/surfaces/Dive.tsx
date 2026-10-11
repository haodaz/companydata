'use client';

/**
 * 礁区导潜（潜导的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）——侧视图，水面在上、珊瑚礁在下。
 *   拖着「你」走（横向是沿礁位置，纵向是深度）；客人跟在后面（有延迟，你走快他就落下，离开一臂他会慌）。
 *   手势是按钮；「挡在中间」在客人靠近珊瑚时把自己拖到他和礁之间再按；回转后慢慢往上拖，5 m 处停住。
 *   底图：有 scene.image（Veo 生成的珊瑚礁）就铺底，没有就画一片礁。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { DIVE_EVENTS, SIGNALS } from '@/lib/lab-dive-spec';

type Pt = { x: number; y: number };
const SURF = 140, FLOOR = 820;            // 水面 / 最深处的 y
const M = (FLOOR - SURF) / 18;            // 每米多少像素（18 m 满深）
const X0 = 160, X1 = 1440;                // 沿礁位置 0–100 对应的 x
const toY = (d: number) => SURF + d * M, toX = (x: number) => X0 + (X1 - X0) * x / 100;
const reefTop = (x: number) => 700 + Math.sin(x / 90) * 40 + Math.sin(x / 37) * 18;   // 礁面起伏

export function DiveStage({ st, running, auto, act, setHidden, toScene, image }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => Pt | null; image?: string;
}) {
  const canAct = running && !auto;
  const t = st.t, v = st.vars;
  const depth = st.controls.depth || 0, xr = st.controls.x || 0, gap = st.controls.gap ?? 1, surfaced = st.controls.surface === 1, blocking = st.controls.block === 1;
  const air = v.air_g ?? 200, stress = v.stress ?? 10, rate = v.rate || 0, stopS = v.stop_s || 0, turned = (v.turned || 0) >= 1;
  const maskOpen = (v.mask_open || 0) >= 1, coralOpen = (v.coral_open || 0) >= 1;
  const me = { x: toX(xr), y: toY(depth) };
  // 客人：追着你，有延迟；慌了会飘
  const guest = useRef<Pt>({ x: toX(0) - 50, y: toY(0) });
  const [, tick] = useState(0);
  const drag = useRef(false);
  const lastSig = useRef(0);
  // 跟随用一个固定的定时器，读最新状态走 ref（依赖里放 me 会让定时器每拍重建、永远跑不到）
  const live = useRef({ me, canAct, coralOpen, stress }); live.current = { me, canAct, coralOpen, stress };
  useEffect(() => {
    const iv = setInterval(() => {
      const { me, canAct, coralOpen, stress } = live.current;
      const g = guest.current; const target = { x: me.x - 60, y: coralOpen ? reefTop(me.x - 60) - 30 : me.y + 10 };
      g.x += (target.x - g.x) * (stress > 60 ? 0.04 : 0.12); g.y += (target.y - g.y) * (coralOpen ? 0.2 : 0.1);
      if (canAct) setHidden('gap', Math.round(Math.hypot(me.x - g.x, me.y - g.y) / M * 10) / 10);
      tick(k => k + 1);
    }, 250);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (e: React.PointerEvent) => { if (!canAct || surfaced) return; const p = toScene(e.clientX, e.clientY); if (!p) return; if (Math.hypot(p.x - me.x, p.y - me.y) < 90) { drag.current = true; try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* */ } } };
  const move = (e: React.PointerEvent) => { if (!drag.current) return; const p = toScene(e.clientX, e.clientY); if (!p) return; const d = Math.max(0, Math.min(18, (p.y - SURF) / M)); const floor = (reefTop(p.x) - 40 - SURF) / M; setHidden('depth', Math.round(Math.min(d, floor) * 10) / 10); setHidden('x', Math.round(Math.max(0, Math.min(100, (p.x - X0) / (X1 - X0) * 100)) * 10) / 10); };
  const up = () => { drag.current = false; };
  const signal = (n: number) => { if (!canAct) return; const now = performance.now(); if (now - lastSig.current < 600) return; lastSig.current = now; act('signal', n); if (n === 2 && air <= 70) act('turn', 1); setTimeout(() => act('signal', 0), 600); };
  const g = guest.current;
  const nearCoral = coralOpen && Math.abs(g.y - (reefTop(g.x) - 30)) < 40;
  const between = me.x > g.x - 30 && me.x < g.x + 90 && me.y > g.y + 10 && me.y < reefTop(me.x);
  const ev = DIVE_EVENTS.filter(e => e.t <= t && ((e.kind === 'mask' && maskOpen) || (e.kind === 'coral' && coralOpen) || (e.kind === 'air' && !turned)));
  const steps: [string, boolean][] = [['下到 8–12 m，客人在一臂内', (st.goalDone.down ?? null) !== null], ['面镜进水：手势 + 停住', (v.mask_done || 0) >= 1], ['要碰珊瑚：手势「别碰」+ 挡中间', (v.coral_done || 0) >= 1], ['70 bar：回转上升', turned], ['≤ 9 m/分，5 m 停 3 分钟', stopS >= 170], ['出水', surfaced]];
  const cur = steps.findIndex(x => !x[1]);

  return (
    <g>
      <defs>
        <linearGradient id="dive-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5fc8ff" /><stop offset="45%" stopColor="#1e7fc4" /><stop offset="100%" stopColor="#0b3a66" /></linearGradient>
        <clipPath id="dive-clip"><rect x={0} y={SURF} width={1600} height={900 - SURF} /></clipPath>
      </defs>
      <rect x={0} y={0} width={1600} height={SURF} fill="#dff3ff" />
      {image ? <image href={image} x={0} y={0} width={1600} height={900} preserveAspectRatio="xMidYMid slice" opacity={0.95} /> : <rect x={0} y={SURF} width={1600} height={900 - SURF} fill="url(#dive-water)" />}
      <rect x={0} y={SURF} width={1600} height={900 - SURF} fill="url(#dive-water)" opacity={image ? 0.35 : 0} />
      {/* 光线 */}
      {[0, 1, 2, 3].map(i => <polygon key={i} points={`${300 + i * 340},${SURF} ${340 + i * 340},${SURF} ${520 + i * 340},${FLOOR} ${380 + i * 340},${FLOOR}`} fill="#fff" opacity={0.08}><animate attributeName="opacity" values="0.05;0.12;0.05" dur={`${3 + i}s`} repeatCount="indefinite" /></polygon>)}
      {/* 水面 */}
      <path d={`M 0 ${SURF} ${Array.from({ length: 17 }, (_, i) => `Q ${i * 100 + 50} ${SURF - 10} ${i * 100 + 100} ${SURF}`).join(' ')}`} fill="none" stroke="#fff" strokeWidth={4} opacity={0.8} />
      {/* 礁 */}
      {!image && <path d={`M 0 900 L 0 ${reefTop(0)} ${Array.from({ length: 33 }, (_, i) => `L ${i * 50} ${reefTop(i * 50)}`).join(' ')} L 1600 900 Z`} fill="#8a4a6a" />}
      {!image && [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const x = 120 + i * 190; return <g key={i}><ellipse cx={x} cy={reefTop(x) + 10} rx={70} ry={34} fill={['#ff8a5f', '#ffd166', '#ff5fa2', '#3ddc97'][i % 4]} opacity={0.85} /><path d={`M ${x - 30} ${reefTop(x)} q 10 -60 30 -70 q 10 50 30 70`} fill="#ffb3c6" /></g>; })}
      {/* 深度尺 */}
      {[0, 5, 10, 12, 15].map(d => <g key={d}><line x1={60} y1={toY(d)} x2={100} y2={toY(d)} stroke={d === 12 ? '#ff5fa2' : '#fff'} strokeWidth={d === 12 ? 3 : 2} /><text x={52} y={toY(d) + 5} textAnchor="end" fill={d === 12 ? '#ff5fa2' : '#fff'} fontSize={14} fontWeight={700}>{d} m</text></g>)}
      <line x1={100} y1={toY(12)} x2={1540} y2={toY(12)} stroke="#ff5fa2" strokeWidth={2} strokeDasharray="10 10" opacity={0.6} />
      {/* 客人 */}
      <g transform={`translate(${g.x} ${g.y})`}>
        <ellipse cx={0} cy={0} rx={38} ry={16} fill="#ffd166" stroke="#8a6a24" strokeWidth={2} />
        <circle cx={34} cy={-6} r={12} fill="#f7d7c0" stroke="#8a6a24" strokeWidth={2} />
        <rect x={28} y={-14} width={16} height={10} rx={3} fill="#5fc8ff" stroke="#333" strokeWidth={1.5} />
        {maskOpen && <text x={0} y={-30} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={800} style={{ textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>面镜进水！</text>}
        {nearCoral && <text x={0} y={-30} textAnchor="middle" fill="#ff5fa2" fontSize={16} fontWeight={800} style={{ textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>快碰到珊瑚了</text>}
        <text x={0} y={34} textAnchor="middle" fill="#fff" fontSize={12}>客人 · {air.toFixed(0)} bar · {stress > 60 ? '慌了' : stress > 30 ? '有点紧张' : '放松'}</text>
        {[0, 1, 2].map(i => <circle key={i} cx={30} cy={-20 - i * 14} r={3 + i} fill="#fff" opacity={0.5}><animate attributeName="cy" values={`${-20 - i * 14};${-90 - i * 14}`} dur="2s" repeatCount="indefinite" /></circle>)}
      </g>
      {/* 你 */}
      <g transform={`translate(${me.x} ${me.y})`} style={{ cursor: canAct && !surfaced ? 'grab' : 'default' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <circle r={70} fill="transparent" />
        <ellipse cx={0} cy={0} rx={42} ry={17} fill="#6a5cff" stroke="#fff" strokeWidth={2.5} />
        <circle cx={38} cy={-6} r={13} fill="#f7d7c0" stroke="#fff" strokeWidth={2} />
        <rect x={32} y={-14} width={16} height={10} rx={3} fill="#5fc8ff" stroke="#333" strokeWidth={1.5} />
        <circle r={gap > 2 ? 2 * M : 0} fill="none" stroke="#ff5fa2" strokeWidth={2} strokeDasharray="6 6" opacity={0.7} />
        <text x={0} y={36} textAnchor="middle" fill="#fff" fontSize={12}>你 · {depth.toFixed(1)} m{gap > 2 ? ` · 离他 ${gap.toFixed(1)} m` : ''}</text>
      </g>
      {/* 拖动用的大热区（拖出去也跟着） */}
      <rect x={0} y={0} width={1600} height={900} fill="transparent" style={{ pointerEvents: drag.current ? 'auto' : 'none' }} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      {/* 手势 + 动作 */}
      <g>
        <rect x={1080} y={30} width={480} height={190} rx={16} fill="rgba(12,16,32,.66)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={1100} y={58} fill="#9aa0b8" fontSize={12} letterSpacing={2}>手势 · 给客人看</text>
        {SIGNALS.map((s, i) => <g key={s.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); signal(s.v); }}>
          <rect x={1100 + i * 90} y={68} width={82} height={60} rx={10} fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.3)" strokeWidth={1.5} />
          <text x={1141 + i * 90} y={100} textAnchor="middle" fontSize={24} pointerEvents="none">{s.icon}</text>
          <text x={1141 + i * 90} y={121} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700} pointerEvents="none">{s.label}</text>
        </g>)}
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('block', blocking ? 0 : 1); }}>
          <rect x={1100} y={142} width={210} height={56} rx={10} fill={blocking ? '#ffd166' : between ? 'rgba(61,220,151,.3)' : 'rgba(255,255,255,.14)'} stroke="rgba(255,255,255,.3)" strokeWidth={1.5} />
          <text x={1205} y={176} textAnchor="middle" fill={blocking ? '#171a2e' : '#fff'} fontSize={14} fontWeight={800} pointerEvents="none">{blocking ? '✋ 正挡在中间' : between ? '挡在中间（现在位置对）' : '挡在中间（先游到他和礁之间）'}</text>
        </g>
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct && depth < 1 && turned) act('surface', 1); }}>
          <rect x={1330} y={142} width={210} height={56} rx={10} fill={depth < 1 && turned ? '#3ddc97' : 'rgba(255,255,255,.1)'} stroke="rgba(255,255,255,.3)" strokeWidth={1.5} />
          <text x={1435} y={176} textAnchor="middle" fill={depth < 1 && turned ? '#171a2e' : '#9aa0b8'} fontSize={14} fontWeight={800} pointerEvents="none">{surfaced ? '已出水' : '出水（到 0 m 再点）'}</text>
        </g>
      </g>
      {/* 读数 */}
      <g pointerEvents="none">
        <rect x={120} y={30} width={520} height={90} rx={16} fill="rgba(12,16,32,.66)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={140} y={58} fill="#9aa0b8" fontSize={12} letterSpacing={2}>潜水 {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')} · 1 秒 = 8 秒</text>
        <text x={140} y={96} fill={rate > 9 ? '#ff5fa2' : '#fff'} fontSize={20} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">↑ {rate.toFixed(1)} m/分{turned ? `  · 5 m 停 ${Math.min(180, stopS).toFixed(0)} / 180 s` : ''}</text>
        {ev.length > 0 && <text x={660} y={70} fill="#ffd166" fontSize={18} fontWeight={800} style={{ textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{ev[ev.length - 1].text}</text>}
      </g>
      {/* 清单 */}
      <g pointerEvents="none">
        <rect x={120} y={840} width={1440} height={52} rx={12} fill="rgba(12,16,32,.72)" />
        {steps.map(([label, done], i) => { const x = 140 + i * 240, on = i === cur; return (<g key={label}><circle cx={x + 6} cy={866} r={7} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} /><text x={x + 20} y={871} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={12.5} fontWeight={on ? 800 : 500}>{label}</text></g>); })}
      </g>
    </g>
  );
}
