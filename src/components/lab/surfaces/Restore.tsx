'use client';

/**
 * 修复台（古籍修复的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   中央一叶竹纸刻本，右下一个虫洞；上面一排工具（喷壶 / 毛刷 / 镊子 / 手），左边材料（浆糊碗、补纸、吸水纸）。
 *   喷壶：点破口附近，一下一下喷（湿度涨，喷多了洇墨）。毛刷：点浆糊碗蘸，沿破口边缘拖着刷（覆盖率涨、刷子上的浆减少；刷远了算出界）。
 *   镊子：把补纸拖到破口上松手（偏多少看得见）；贴好压实后再用镊子慢慢把吸水纸拖开（拖快了撕坏）。手：按住补纸不放 = 隔吸水纸压实。
 *   纸面：湿了泛蓝光、洇墨是黑团、浆糊是淡黄、压着时有吸水纸、半干前有水光。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { RESTORE_TOOLS } from '@/lib/lab-restore-spec';

type Pt = { x: number; y: number };
const LEAF = { x: 430, y: 120, w: 760, h: 700 };
const HOLE_C = { x: 905, y: 560 };
// 虫洞轮廓（不规则）
// 轮廓：低频起伏，像被虫啃出来的圆洞，不要尖角
const holeR = (a: number) => 64 + 12 * Math.sin(a * 2 + 0.6) + 7 * Math.cos(a * 3 + 1.1);
const HOLE: Pt[] = Array.from({ length: 36 }, (_, i) => { const a = i / 36 * Math.PI * 2; const r = holeR(a); return { x: HOLE_C.x + Math.cos(a) * r * 1.15, y: HOLE_C.y + Math.sin(a) * r }; });
const RIM: Pt[] = Array.from({ length: 28 }, (_, i) => { const a = i / 28 * Math.PI * 2; const r = holeR(a) + 24; return { x: HOLE_C.x + Math.cos(a) * r * 1.15, y: HOLE_C.y + Math.sin(a) * r }; });
const poly = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
const BOWL = { x: 200, y: 400 }, PATCH0 = { x: 200, y: 590 }, BLOT0 = { x: 200, y: 760 };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function RestoreStage({ st, running, auto, act, setHidden, toScene }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => Pt | null;
}) {
  const tool = Math.round(st.controls.tool || 0);
  const wet = st.controls.wet || 0, load = st.controls.load || 0, cover = st.controls.cover || 0, spill = st.controls.spill || 0;
  const placed = st.controls.place === 1, press = st.controls.press === 1, peel = st.controls.peel === 1, align = st.controls.align || 0;
  const dry = st.vars.dry || 0, bleed = st.vars.bleed || 0, torn = (st.vars.torn || 0) >= 1;
  const canAct = running && !auto;

  const [hand, setHand] = useState<Pt | null>(null);
  const [patchPos, setPatchPos] = useState<Pt>(PATCH0);
  const [blotPos, setBlotPos] = useState<Pt | null>(null);
  const [drops, setDrops] = useState<{ x: number; y: number; k: number }[]>([]);
  const painted = useRef<boolean[]>(RIM.map(() => false));
  const drag = useRef<'patch' | 'blot' | 'brush' | null>(null);
  const pressing = useRef(false);
  const peelTrack = useRef<{ t: number; p: Pt }[]>([]);

  // 演示：补纸 / 吸水纸位置跟着状态走
  useEffect(() => { if (auto) { if (placed) setPatchPos({ x: HOLE_C.x + align * 10, y: HOLE_C.y }); if (press && !peel) setBlotPos({ x: HOLE_C.x, y: HOLE_C.y }); if (peel) setBlotPos(null); } }, [auto, placed, press, peel, align]);
  // 压实计时
  useEffect(() => {
    if (!canAct || !press) return;
    const iv = setInterval(() => { if (pressing.current) setHidden('press_s', (st.controls.press_s || 0) + 0.25); }, 250);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAct, press]);

  const nearHole = (p: Pt) => dist(p, HOLE_C) < 170;
  const inLeaf = (p: Pt) => p.x > LEAF.x && p.x < LEAF.x + LEAF.w && p.y > LEAF.y && p.y < LEAF.y + LEAF.h;

  const down = (e: React.PointerEvent) => {
    if (!canAct) return;
    const p = toScene(e.clientX, e.clientY); if (!p) return;
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* 合成事件 */ }
    setHand(p);
    if (tool === 0 && nearHole(p)) {   // 喷壶：一下一下喷
      setHidden('wet', Math.min(100, wet + 12));
      setDrops(d => [...d.slice(-12), ...Array.from({ length: 6 }, (_, i) => ({ x: p.x + (Math.random() - 0.5) * 120, y: p.y + (Math.random() - 0.5) * 80, k: performance.now() + i }))]);
      return;
    }
    if (tool === 1) {
      if (dist(p, BOWL) < 90) { act('dip', 1); setHidden('load', 100); return; }
      drag.current = 'brush'; paint(p); return;
    }
    if (tool === 2) {
      if (!placed && dist(p, patchPos) < 90) { drag.current = 'patch'; return; }
      if (placed && press && !peel && blotPos && dist(p, blotPos) < 110) { drag.current = 'blot'; peelTrack.current = [{ t: performance.now(), p }]; return; }
      return;
    }
    if (tool === 3 && placed && !peel && dist(p, patchPos) < 110) {
      if (!press) { act('press', 1); setBlotPos({ x: patchPos.x, y: patchPos.y }); }
      pressing.current = true;
    }
  };
  const paint = (p: Pt) => {
    if (load < 12) return;   // 刷子干了，得再蘸
    let hit = 0;
    RIM.forEach((r, i) => { if (dist(p, r) < 34 && !painted.current[i]) { painted.current[i] = true; hit++; } });
    const c = painted.current.filter(Boolean).length / RIM.length * 100;
    if (hit) setHidden('cover', Math.round(c));
    // 离破口远（出了边缘带）还在刷：出界
    const minRim = Math.min(...RIM.map(r => dist(p, r)));
    if (minRim > 40 && inLeaf(p) && dist(p, HOLE_C) > 60) setHidden('spill', Math.min(100, spill + 1.2));
    setHidden('load', Math.max(0, load - 1.4));
  };
  const move = (e: React.PointerEvent) => {
    const p = toScene(e.clientX, e.clientY); if (!p) return;
    setHand(p);
    if (!canAct) return;
    if (drag.current === 'brush') paint(p);
    else if (drag.current === 'patch') setPatchPos(p);
    else if (drag.current === 'blot') {
      setBlotPos(p);
      const tr = peelTrack.current; tr.push({ t: performance.now(), p });
      while (tr.length > 2 && performance.now() - tr[0].t > 300) tr.shift();
      const dt = tr[tr.length - 1].t - tr[0].t;
      if (dt < 80) return;   // 窗口太短算不准（按下去那一瞬的两次事件几乎同时）
      const sp = dist(tr[tr.length - 1].p, tr[0].p) / dt * 100;   // 像素 / 100ms
      setHidden('peel_speed', Math.max(st.controls.peel_speed || 0, Math.round(sp)));
    }
  };
  const up = () => {
    pressing.current = false;
    if (!canAct) { drag.current = null; return; }
    if (drag.current === 'patch') {
      const d = dist(patchPos, HOLE_C);
      if (d < 150) { setHidden('align', Math.round(d / 10 * 10) / 10); act('place', 1); }
      else setPatchPos(PATCH0);
    }
    if (drag.current === 'blot' && blotPos && dist(blotPos, patchPos) > 170) { act('peel', 1); setBlotPos(null); }
    drag.current = null;
  };

  // ── 画面 ──
  const needTool = !(wet >= 30) ? 0 : load <= 0 && cover < 80 ? 1 : cover < 80 ? 1 : !placed ? 2 : !press ? 3 : !peel && dry >= 70 ? 2 : -1;
  const steps: [string, boolean][] = [
    ['喷壶：点破口附近喷潮（30–60）', wet >= 30], ['毛刷：点浆糊碗蘸浆', load > 0 || cover > 0], ['沿破口边缘刷一圈（≥ 80%）', cover >= 80],
    ['镊子：把补纸拖到破口上', placed], ['手：按住补纸压实 2 秒', (st.controls.press_s || 0) >= 2], ['等半干（≥ 70%）', dry >= 70], ['镊子：慢慢揭开吸水纸', peel],
  ];
  const cur = steps.findIndex(x => !x[1]);
  const wetHalo = Math.min(1, wet / 100);

  return (
    <g>
      {/* 工作台面 + 书叶 */}
      <rect x={0} y={0} width={1600} height={900} fill="#3b2f26" />
      <rect x={LEAF.x + 10} y={LEAF.y + 12} width={LEAF.w} height={LEAF.h} fill="rgba(0,0,0,.35)" />
      <rect x={LEAF.x} y={LEAF.y} width={LEAF.w} height={LEAF.h} fill="#e8d9b5" stroke="#c9b58a" strokeWidth={2} />
      {/* 栏线 + 字 */}
      {Array.from({ length: 9 }, (_, i) => <line key={i} x1={LEAF.x + 60 + i * 80} y1={LEAF.y + 40} x2={LEAF.x + 60 + i * 80} y2={LEAF.y + LEAF.h - 40} stroke="#b89a66" strokeWidth={1.5} />)}
      {Array.from({ length: 8 }, (_, c) => Array.from({ length: 16 }, (_, r) => { const x = LEAF.x + 70 + c * 80, y = LEAF.y + 60 + r * 40; if (dist({ x: x + 20, y: y + 16 }, HOLE_C) < 85) return null; return <rect key={`${c}-${r}`} x={x + 8} y={y} width={26} height={30} rx={3} fill="#2b2420" opacity={0.75 + ((c * 7 + r * 3) % 5) * 0.04} />; }))}
      {/* 洇墨 */}
      {bleed > 0 && [0, 1, 2, 3].map(i => <circle key={i} cx={HOLE_C.x + Math.cos(i * 1.7) * 110} cy={HOLE_C.y + Math.sin(i * 1.7) * 90} r={8 + bleed * 2} fill="#1b1512" opacity={Math.min(0.6, bleed / 20)} filter="url(#bench-blur-sm)" />)}
      {/* 喷潮：水光 */}
      <defs><radialGradient id="rs-wet" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#7fb6ff" stopOpacity={0.45} /><stop offset="100%" stopColor="#7fb6ff" stopOpacity={0} /></radialGradient></defs>
      <circle cx={HOLE_C.x} cy={HOLE_C.y} r={120 + wet * 0.9} fill="url(#rs-wet)" opacity={wetHalo} />
      {/* 浆糊：出界的晕 + 边缘带上刷到的段 */}
      {spill > 0 && <circle cx={HOLE_C.x} cy={HOLE_C.y} r={120 + spill * 1.5} fill="#e6c46a" opacity={Math.min(0.35, spill / 100)} filter="url(#bench-blur-sm)" />}
      {RIM.map((r, i) => painted.current[i] || (auto && cover > i / RIM.length * 100) ? <circle key={i} cx={r.x} cy={r.y} r={18} fill="#efd27a" opacity={0.85} /> : null)}
      {/* 虫洞 */}
      <path d={poly(HOLE)} fill="#2a1f17" />
      <path d={poly(HOLE)} fill="none" stroke="#8c7046" strokeWidth={2} strokeDasharray="4 3" />
      {/* 补纸 */}
      <g transform={`translate(${patchPos.x - HOLE_C.x} ${patchPos.y - HOLE_C.y})`} style={{ cursor: canAct && tool === 2 && !placed ? 'grab' : 'default' }}>
        <path d={poly(HOLE.map(p => ({ x: HOLE_C.x + (p.x - HOLE_C.x) * 1.22, y: HOLE_C.y + (p.y - HOLE_C.y) * 1.22 })))} fill="#e2cfa4" stroke="#b89a66" strokeWidth={1.5} opacity={placed ? 0.98 : 0.95} />
        {torn && <path d={`M ${HOLE_C.x - 40} ${HOLE_C.y - 30} L ${HOLE_C.x + 10} ${HOLE_C.y + 5} L ${HOLE_C.x - 20} ${HOLE_C.y + 40}`} fill="none" stroke="#2a1f17" strokeWidth={3} />}
        {placed && !peel && <path d={poly(HOLE.map(p => ({ x: HOLE_C.x + (p.x - HOLE_C.x) * 1.22, y: HOLE_C.y + (p.y - HOLE_C.y) * 1.22 })))} fill="#fff" opacity={0.35 * (1 - dry / 100)} />}
      </g>
      {!placed && <text x={PATCH0.x} y={PATCH0.y + 110} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={700}>染色补纸（镊子拖）</text>}
      {/* 吸水纸 */}
      {blotPos && !peel && <g transform={`translate(${blotPos.x} ${blotPos.y})`} style={{ cursor: canAct && tool === 2 && dry >= 70 ? 'grab' : 'default' }}>
        <rect x={-120} y={-95} width={240} height={190} rx={8} fill="#fbf8f0" stroke="#d8d0bd" strokeWidth={2} opacity={0.96} />
        <text x={0} y={6} textAnchor="middle" fill="#9a8a6a" fontSize={14}>吸水纸</text>
      </g>}
      {/* 材料 */}
      <g>
        <ellipse cx={BOWL.x} cy={BOWL.y} rx={88} ry={48} fill="#d9d2c4" stroke="#9a8a6a" strokeWidth={3} style={{ cursor: canAct && tool === 1 ? 'pointer' : 'default' }} />
        <ellipse cx={BOWL.x} cy={BOWL.y - 6} rx={70} ry={34} fill="#f1e3b8" />
        <text x={BOWL.x} y={BOWL.y + 76} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={700}>低浓度浆糊 · 毛刷点这里蘸</text>
        <rect x={BLOT0.x - 70} y={BLOT0.y - 40} width={140} height={80} rx={6} fill="#fbf8f0" stroke="#d8d0bd" strokeWidth={2} />
        <text x={BLOT0.x} y={BLOT0.y + 66} textAnchor="middle" fill="#fff" fontSize={14}>吸水纸（压实时自动垫上）</text>
      </g>
      {/* 喷雾 */}
      {drops.map(d => <circle key={d.k} cx={d.x} cy={d.y} r={3} fill="#bfe0ff" opacity={0.9}><animate attributeName="opacity" from="0.9" to="0" dur="0.8s" fill="freeze" /><animate attributeName="r" from="2" to="7" dur="0.8s" fill="freeze" /></circle>)}

      {/* 工具盘 */}
      <g>
        <rect x={40} y={60} width={340} height={118} rx={18} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={56} y={52} fill="#fff" fontSize={17} fontWeight={700} style={{ textShadow: '0 1px 5px rgba(0,0,0,.8)' }}>工具 · 点一下换手里的</text>
        {RESTORE_TOOLS.map((t, i) => { const x = 56 + i * 80, sel = tool === t.v, glow = needTool === t.v && !sel; return (
          <g key={t.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('tool', t.v); }}>
            {glow && <rect x={x - 4} y={68} width={76} height={100} rx={14} fill="none" stroke="#ffd166" strokeWidth={3}><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite" /></rect>}
            <rect x={x} y={72} width={68} height={92} rx={12} fill={sel ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.14)'} stroke={sel ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={sel ? 3 : 1.5} />
            <text x={x + 34} y={118} textAnchor="middle" fontSize={30} pointerEvents="none">{t.icon}</text>
            <text x={x + 34} y={152} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700} pointerEvents="none">{t.label.replace(/（.*）/, '')}</text>
          </g>); })}
      </g>
      {/* 读数 */}
      <g pointerEvents="none">
        <rect x={40} y={196} width={340} height={150} rx={16} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        {[['湿度', `${wet.toFixed(0)}%`, wet > 65 ? '#ff5fa2' : wet >= 30 ? '#3ddc97' : '#ffd166'], ['刷子上的浆', `${load.toFixed(0)}%`, load < 12 ? '#ffd166' : '#e6e8f5'], ['边缘覆盖', `${cover.toFixed(0)}%`, cover >= 85 ? '#3ddc97' : '#e6e8f5'], ['干燥', `${dry.toFixed(0)}%`, dry >= 70 ? '#3ddc97' : '#e6e8f5']].map(([k, v, c], i) => (
          <g key={k}><text x={60 + (i % 2) * 165} y={228 + Math.floor(i / 2) * 60} fill="#9aa0b8" fontSize={13}>{k}</text><text x={60 + (i % 2) * 165} y={256 + Math.floor(i / 2) * 60} fill={c} fontSize={24} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{v}</text></g>))}
      </g>
      {/* 分步清单 */}
      <g pointerEvents="none">
        <rect x={300} y={744} width={1000} height={118} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={326} y={782} fill="#ffd166" fontSize={22} fontWeight={800}>补虫洞：喷潮 → 蘸浆 → 刷边 → 对位 → 压实 → 等 → 揭</text>
        {steps.map(([label, done], i) => { const x = 326 + (i % 4) * 240, y2 = i < 4 ? 816 : 846, on = i === cur; return (
          <g key={label}>
            <circle cx={x + 8} cy={y2 - 5} r={8} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
            <text x={x + 24} y={y2} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={14} fontWeight={on ? 800 : 500}>{i + 1}. {label}</text>
          </g>); })}
      </g>
      {/* 手 / 工具光标 */}
      {hand && canAct && <text x={hand.x} y={hand.y + 12} textAnchor="middle" fontSize={34} pointerEvents="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.5))' }}>{RESTORE_TOOLS[tool].icon}</text>}
      {/* 手势面 */}
      <rect x={0} y={0} width={1600} height={900} fill="transparent" style={{ cursor: canAct ? 'none' : 'default', touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
      {RESTORE_TOOLS.map((t, i) => <rect key={t.v} x={56 + i * 80} y={72} width={68} height={92} fill="transparent" style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('tool', t.v); }} />)}
    </g>
  );
}
