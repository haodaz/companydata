'use client';

/**
 * 炒锅台（中餐厨师的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   中央一口锅，底下火焰（火力旋钮在右下），左边一排料碗（点一下 = 下锅），锅上「翻炒」靠在锅里来回拖（或点翻炒键）。
 *   锅里的东西随状态变：空锅 → 油光 → 爆香的红椒 → 鸡丁从粉到金黄到焦黑 → 花生葱 → 汁从稀到挂住。上方一条时间轴：腌 → 热锅 → 下料 → 翻炒 → 收汁 → 出锅。
 */
import React, { useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { INGREDIENTS } from '@/lib/lab-chef-spec';

type Pt = { x: number; y: number };
const WOK = { x: 820, y: 520, rx: 260, ry: 150 };

export function ChefStage({ st, running, auto, act, toScene }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => Pt | null;
}) {
  const canAct = running && !auto;
  const fire = Math.round(st.controls.fire || 0);
  const v = st.vars; const inN = (n: number) => (v[`in${n}`] || 0) >= 1;
  const oil = v.oil_t || 25, cook = v.cook || 0, burn = v.burn || 0, sauce = v.sauce || 0, marinate = v.marinate || 0, since = v.since_toss || 0, plated = (v.plated || 0) >= 1;
  const [hand, setHand] = useState<Pt | null>(null);
  const [tossK, setTossK] = useState(0);
  const dragLast = useRef<Pt | null>(null); const dragAcc = useRef(0);
  // 下料一样一样来：两次点击间隔 < 0.4 秒的第二下不算（模拟器 0.25 秒一拍，连点会漏记一样）
  const lastAdd = useRef(0);
  const addIng = (v: number) => { const now = performance.now(); if (now - lastAdd.current < 400) return; lastAdd.current = now; act('add', v); };

  const inWok = (p: Pt) => ((p.x - WOK.x) / WOK.rx) ** 2 + ((p.y - WOK.y) / WOK.ry) ** 2 < 1;
  const toss = () => { if (!canAct || plated) return; act('toss', 1); setTossK(k => k + 1); };
  const down = (e: React.PointerEvent) => { if (!canAct) return; const p = toScene(e.clientX, e.clientY); if (!p) return; try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* */ } if (inWok(p)) { dragLast.current = p; dragAcc.current = 0; } };
  const move = (e: React.PointerEvent) => { const p = toScene(e.clientX, e.clientY); if (!p) return; setHand(p); const l = dragLast.current; if (!l || !canAct) return; dragAcc.current += Math.hypot(p.x - l.x, p.y - l.y); dragLast.current = p; if (dragAcc.current > 160) { dragAcc.current = 0; toss(); } };
  const up = () => { dragLast.current = null; };

  const heat = Math.min(1, Math.max(0, (oil - 25) / 300));
  const chickenColor = burn > 40 ? '#2b1a12' : cook >= 100 ? '#a65a1f' : cook > 60 ? '#d9933f' : cook > 25 ? '#e9b86d' : '#f3d9c0';
  const stage = !inN(1) ? '① 先腌：把腌料倒进鸡丁' : marinate < 60 && !inN(3) ? `① 腌着（${marinate.toFixed(0)} / 60 秒）· 这会儿可以开火热锅` : !inN(2) ? (oil < 150 ? `② 热锅：油温 ${oil.toFixed(0)}℃，到 150–220℃ 下花椒辣椒` : oil > 220 ? '② 油温高了，降火再下料' : '② 油温到了：下花椒辣椒') : !inN(3) ? '③ 爆香了：下鸡丁' : !inN(4) ? '④ 一直翻：鸡丁变色（熟度 60%+）再下花生葱' : !inN(5) ? '⑤ 下调味汁' : !plated ? `⑥ 收汁 ${sauce.toFixed(0)}%：到 55–90% 出锅` : '✓ 出锅了';
  const steps: [string, boolean][] = [['腌 1 分钟', marinate >= 60], ['热锅 150–220℃', inN(2)], ['花椒辣椒 → 鸡丁', inN(3)], ['一直翻（≥ 60% 熟）', cook >= 60], ['花生葱 → 调味汁', inN(5)], ['收汁 55–90% 出锅', plated]];
  const cur = steps.findIndex(x => !x[1]);

  return (
    <g onPointerMove={move}>
      <rect x={0} y={0} width={1600} height={900} fill="#1c1a1a" />
      <rect x={0} y={640} width={1600} height={260} fill="#2a2522" />
      {/* 灶：火焰 */}
      <ellipse cx={WOK.x} cy={WOK.y + 150} rx={200} ry={40} fill="#3a3330" />
      {fire > 0 && [0, 1, 2, 3, 4, 5, 6].map(i => <path key={i} d={`M ${WOK.x - 120 + i * 40} ${WOK.y + 150} q 8 ${-30 - fire * 18} 20 ${-50 - fire * 26} q 12 ${20 + fire * 8} 20 ${50 + fire * 26} z`} fill={fire === 3 ? '#ffb347' : '#4ea3ff'} opacity={0.85}><animate attributeName="opacity" values="0.85;0.45;0.85" dur={`${0.3 + i * 0.05}s`} repeatCount="indefinite" /></path>)}
      {/* 锅 */}
      <ellipse cx={WOK.x} cy={WOK.y + 24} rx={WOK.rx + 20} ry={WOK.ry + 12} fill="#141212" />
      <ellipse cx={WOK.x} cy={WOK.y} rx={WOK.rx} ry={WOK.ry} fill="#2b2b2b" stroke="#5a5a5a" strokeWidth={8} />
      <ellipse cx={WOK.x} cy={WOK.y + 18} rx={WOK.rx - 50} ry={WOK.ry - 40} fill={`rgba(90,60,30,${0.25 + heat * 0.35})`} />
      {/* 油光 */}
      <ellipse cx={WOK.x - 40} cy={WOK.y - 10} rx={120} ry={40} fill="#fff" opacity={0.08 + heat * 0.18} />
      {/* 锅里的料（翻炒时抖一下） */}
      <g transform={`translate(${(tossK % 2 ? 1 : -1) * 6} ${tossK % 3 ? -4 : 0})`}>
        {inN(2) && [0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={WOK.x - 120 + i * 42} y={WOK.y - 10 + (i % 2) * 24} width={26} height={9} rx={4} fill="#b3121e" transform={`rotate(${i * 37} ${WOK.x - 107 + i * 42} ${WOK.y - 5})`} />)}
        {inN(3) && Array.from({ length: 14 }, (_, i) => <rect key={i} x={WOK.x - 150 + (i % 7) * 44} y={WOK.y - 30 + Math.floor(i / 7) * 46 + (i % 3) * 6} width={30} height={26} rx={7} fill={chickenColor} stroke="rgba(0,0,0,.25)" strokeWidth={1.5} />)}
        {inN(4) && Array.from({ length: 10 }, (_, i) => <circle key={i} cx={WOK.x - 120 + i * 27} cy={WOK.y + 40 + (i % 2) * 14} r={7} fill={i % 3 === 2 ? '#3f9b3f' : '#c98a4b'} />)}
        {inN(5) && <ellipse cx={WOK.x} cy={WOK.y + 20} rx={200 - sauce * 0.8} ry={70 - sauce * 0.3} fill="#7a3a16" opacity={0.35 + sauce / 200} />}
      </g>
      {/* 烟 */}
      {oil > 240 && [0, 1, 2].map(i => <ellipse key={i} cx={WOK.x - 80 + i * 80} cy={WOK.y - 140} rx={40} ry={18} fill="#aaa" opacity={0.35}><animate attributeName="cy" values={`${WOK.y - 120};${WOK.y - 260}`} dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" /><animate attributeName="opacity" values="0.4;0" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" /></ellipse>)}
      {burn > 15 && <text x={WOK.x} y={WOK.y - 170} textAnchor="middle" fill="#ff5fa2" fontSize={22} fontWeight={800}>糊味！</text>}
      {/* 翻炒热区：在锅里来回拖 */}
      <ellipse cx={WOK.x} cy={WOK.y} rx={WOK.rx} ry={WOK.ry} fill="transparent" style={{ cursor: canAct ? 'grab' : 'default', touchAction: 'none' }} onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
      <text x={WOK.x} y={WOK.y + 200} textAnchor="middle" fill="#c7cbe6" fontSize={15}>在锅里来回拖 = 翻炒{inN(3) && !plated ? ` · 离上次 ${since.toFixed(0)} 秒` : ''}</text>
      {/* 料碗 */}
      <g>
        <text x={80} y={150} fill="#fff" fontSize={17} fontWeight={700}>料台 · 点一下下锅</text>
        {INGREDIENTS.map((it, i) => { const y = 180 + i * 96, used = inN(it.v), next = cur >= 0 && ((it.v === 1 && !inN(1)) || (it.v === 2 && marinate >= 60 && !inN(2) && oil >= 150 && oil <= 220) || (it.v === 3 && inN(2) && !inN(3)) || (it.v === 4 && inN(3) && cook >= 60 && !inN(4)) || (it.v === 5 && inN(4) && !inN(5))); return (
          <g key={it.v} style={{ cursor: canAct && !used ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct && !used) addIng(it.v); }}>
            {next && <rect x={70} y={y - 6} width={380} height={84} rx={16} fill="none" stroke="#ffd166" strokeWidth={3}><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite" /></rect>}
            <rect x={76} y={y} width={368} height={72} rx={14} fill={used ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.14)'} stroke="rgba(255,255,255,.3)" strokeWidth={1.5} />
            <text x={100} y={y + 46} fontSize={30} opacity={used ? 0.35 : 1}>{it.icon}</text>
            <text x={150} y={y + 44} fill={used ? '#6b7089' : '#fff'} fontSize={17} fontWeight={700}>{it.label}{used ? ' · 已下' : ''}</text>
          </g>); })}
      </g>
      {/* 火力旋钮 */}
      <g>
        <rect x={1180} y={560} width={340} height={120} rx={16} fill="rgba(12,16,32,.7)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        <text x={1200} y={590} fill="#9aa0b8" fontSize={13} letterSpacing={2}>火力 · FIRE</text>
        {['关', '小', '中', '大'].map((l, i) => <g key={l} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('fire', i); }}>
          <rect x={1200 + i * 78} y={606} width={68} height={54} rx={10} fill={fire === i ? (i === 3 ? '#ff8a5f' : i ? '#6a5cff' : '#3b4254') : 'rgba(255,255,255,.12)'} stroke={fire === i ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={fire === i ? 3 : 1.5} />
          <text x={1234 + i * 78} y={641} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={800} pointerEvents="none">{l}</text>
        </g>)}
        <text x={1200} y={700} fill={oil > 240 ? '#ff5fa2' : oil >= 150 ? '#3ddc97' : '#ffd166'} fontSize={26} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">油温 {oil.toFixed(0)}℃</text>
        <text x={1200} y={726} fill="#9aa0b8" fontSize={13}>熟度 {cook.toFixed(0)}% · 收汁 {sauce.toFixed(0)}%{burn > 0 ? ` · 糊 ${burn.toFixed(0)}` : ''}</text>
      </g>
      {/* 出锅 */}
      <g style={{ cursor: canAct && inN(5) && !plated ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct && inN(5) && !plated) act('plate', 1); }}>
        <rect x={1180} y={440} width={340} height={90} rx={16} fill={inN(5) && !plated ? (sauce >= 55 && sauce <= 90 ? '#3ddc97' : '#ffd166') : plated ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.12)'} stroke="rgba(255,255,255,.3)" strokeWidth={2} />
        <text x={1350} y={478} textAnchor="middle" fill={inN(5) && !plated ? '#0f1224' : '#fff'} fontSize={22} fontWeight={800} pointerEvents="none">{plated ? '已出锅' : '出锅装盘'}</text>
        <text x={1350} y={508} textAnchor="middle" fill={inN(5) && !plated ? '#0f1224' : '#9aa0b8'} fontSize={13} pointerEvents="none">{inN(5) && !plated ? (sauce < 55 ? '汁还稀，再收一会儿' : sauce > 90 ? '收过头了，快出' : '现在正好') : '调味汁下了、收到位再点'}</text>
      </g>
      {/* 时间轴 / 提示 */}
      <g pointerEvents="none">
        <rect x={80} y={40} width={1440} height={80} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={104} y={90} fill="#ffd166" fontSize={24} fontWeight={800}>{stage}</text>
        <rect x={80} y={760} width={1440} height={110} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        {steps.map(([label, done], i) => { const x = 104 + i * 236, on = i === cur; return (
          <g key={label}>
            <circle cx={x + 8} cy={808} r={9} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
            <text x={x + 26} y={814} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={15} fontWeight={on ? 800 : 500}>{i + 1}. {label}</text>
            {i < steps.length - 1 && <line x1={x + 200} y1={808} x2={x + 226} y2={808} stroke="rgba(255,255,255,.25)" strokeWidth={2} />}
          </g>); })}
        <text x={104} y={852} fill="#9aa0b8" fontSize={13}>1 秒真实 = 4 秒模拟 · 腌的时候可以先开火热锅，但别空烧到冒烟</text>
      </g>
      {hand && canAct && dragLast.current && <text x={hand.x} y={hand.y + 10} textAnchor="middle" fontSize={34} pointerEvents="none">🥄</text>}
    </g>
  );
}
