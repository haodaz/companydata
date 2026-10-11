'use client';

/**
 * 中班教室（幼儿园老师的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   俯视教室：八个孩子围成半圈，每人头上一条注意力；出状况的孩子会显出来（哭 / 抢 / 跑到窗边）。
 *   点一个孩子 = 走到他身边，再选「安抚 / 分开 / 表扬 / 请回座位」；右上角「全班」：拍手儿歌 / 换环节 / 吼（红线）。
 *   环节进度条在顶上，拖太长会变红。1 秒真实 = 6 秒模拟。
 */
import React, { useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { INCIDENTS, KIDS, SEGMENTS } from '@/lib/lab-kinder-spec';

const SEG_LEN = [0, 240, 420, 480, 180];
const POS = KIDS.map((_, i) => { const a = Math.PI * (0.15 + 0.7 * i / 7); return { x: 800 + Math.cos(a) * 420, y: 560 - Math.sin(a) * 260 }; });

export function KinderStage({ st, running, auto, act }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const t = st.t, v = st.vars;
  const seg = Math.round(st.controls.seg || 0), kid = Math.round(st.controls.kid || 0);
  const attn = v.attn ?? 70, segT = v.seg_t || 0, long = (v.seg_long || 0) >= 1;
  const cry = (v.cry_open || 0) >= 1, fight = (v.fight_open || 0) >= 1, wander = (v.wander_open || 0) >= 1;
  const [bubble, setBubble] = useState<string>('');
  const lastAct = useRef(0);
  const once = (c: string, val: number) => { if (!canAct) return; const now = performance.now(); if (now - lastAct.current < 400) return; lastAct.current = now; act(c, val); setTimeout(() => act(c, 0), 600); };
  const care = (n: number) => { if (!kid) { setBubble('先点一个孩子，走到他身边'); setTimeout(() => setBubble(''), 2000); return; } once('care', n); };
  const kidState = (i: number) => (i === 3 && cry ? 'cry' : (i === 4 || i === 5) && fight ? 'fight' : i === 7 && wander ? 'wander' : 'ok');
  const kidPos = (i: number) => i === 7 && wander ? { x: 1380, y: 250 } : POS[i];
  const kidAttn = (i: number) => Math.max(0, Math.min(100, attn + ((i * 7) % 5 - 2) * 8 - (kidState(i) !== 'ok' ? 40 : 0)));
  const steps: [string, boolean][] = SEGMENTS.map((s, i) => [s, seg > i + 1 || (seg === 4 && i === 3)]);
  const incidentsNow = INCIDENTS.filter(x => x.t <= t && ((x.kind === 'cry' && cry) || (x.kind === 'fight' && fight) || (x.kind === 'wander' && wander)));

  return (
    <g>
      <rect x={0} y={0} width={1600} height={900} fill="#f7efe0" />
      <rect x={0} y={0} width={1600} height={120} fill="#e9dcc3" />
      {/* 窗 */}
      <rect x={1300} y={140} width={240} height={200} rx={10} fill="#bfe3ff" stroke="#8aa8c8" strokeWidth={5} />
      <text x={1420} y={360} textAnchor="middle" fill="#6b7089" fontSize={13}>窗边 · 洒水车</text>
      {/* 地毯 */}
      <ellipse cx={800} cy={520} rx={520} ry={320} fill="#f5c7a6" opacity={0.6} />
      <ellipse cx={800} cy={520} rx={420} ry={250} fill="#f9d9bf" opacity={0.8} />
      {/* 老师（你）：在被点的孩子旁边 */}
      {(() => { const p = kid ? kidPos(kid - 1) : { x: 800, y: 760 }; return <g transform={`translate(${p.x + (kid ? 46 : 0)} ${p.y + (kid ? 10 : 0)})`}><circle r={30} fill="#6a5cff" stroke="#fff" strokeWidth={4} /><text y={7} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={800}>你</text></g>; })()}
      {/* 孩子们 */}
      {KIDS.map((name, i) => { const p = kidPos(i), s = kidState(i), sel = kid === i + 1, a = kidAttn(i); return (
        <g key={name} transform={`translate(${p.x} ${p.y})`} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('kid', sel ? 0 : i + 1); }}>
          {sel && <circle r={54} fill="none" stroke="#6a5cff" strokeWidth={4} strokeDasharray="8 6" />}
          <circle r={36} fill={s === 'cry' ? '#ffd1dc' : s === 'fight' ? '#ffe0b3' : s === 'wander' ? '#d6ecff' : '#fff'} stroke="#c9b58a" strokeWidth={3} />
          <text y={10} textAnchor="middle" fontSize={30}>{s === 'cry' ? '😭' : s === 'fight' ? '😤' : s === 'wander' ? '🏃' : a > 60 ? '🙂' : a > 35 ? '😐' : '🥱'}</text>
          <text y={60} textAnchor="middle" fill="#171a2e" fontSize={14} fontWeight={700}>{name}</text>
          <rect x={-30} y={66} width={60} height={6} rx={3} fill="rgba(0,0,0,.12)" /><rect x={-30} y={66} width={60 * a / 100} height={6} rx={3} fill={a > 60 ? '#12a150' : a > 35 ? '#e0a800' : '#d6336c'} />
          {s !== 'ok' && <text y={-46} textAnchor="middle" fill="#d6336c" fontSize={13} fontWeight={800}>{s === 'cry' ? '想妈妈了' : s === 'fight' ? '抢蜡笔' : '跑去窗边'}</text>}
        </g>); })}
      {/* 顶部：环节进度 */}
      <g pointerEvents="none">
        <text x={60} y={44} fill="#171a2e" fontSize={20} fontWeight={800}>{seg ? `${seg}/4 ${SEGMENTS[seg - 1]}` : '还没开始 · 先拍手儿歌集合'}</text>
        {seg > 0 && seg <= 4 && <g>
          <rect x={60} y={60} width={700} height={14} rx={7} fill="rgba(0,0,0,.1)" />
          <rect x={60} y={60} width={700 * Math.min(1, segT / SEG_LEN[seg])} height={14} rx={7} fill={long ? '#d6336c' : '#6a5cff'} />
          <text x={770} y={72} fill={long ? '#d6336c' : '#6b7089'} fontSize={13} fontWeight={long ? 800 : 500}>{Math.floor(segT / 60)}:{String(Math.floor(segT % 60)).padStart(2, '0')} / {SEG_LEN[seg] / 60} 分{long ? ' · 拖太长了' : ''}</text>
        </g>}
        <text x={60} y={104} fill="#6b7089" fontSize={13}>课堂时间 {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')} · 全班注意力 {attn.toFixed(0)}{incidentsNow.length ? ` · ${incidentsNow.map(x => x.text).join('；')}` : ''}</text>
      </g>
      {/* 右侧：全班 / 个别 */}
      <g>
        <rect x={1180} y={400} width={360} height={320} rx={16} fill="rgba(23,26,46,.9)" />
        <text x={1200} y={430} fill="#9aa0b8" fontSize={12} letterSpacing={2}>对全班</text>
        {[['👏 拍手儿歌', () => once('all', 1), '#6a5cff'], ['⏭ 下一环节', () => canAct && seg < 4 && act('seg', seg + 1), '#12b5cb'], ['📢 大声吼', () => once('all', 2), '#6b2d3b']].map(([l, fn, c], i) => (
          <g key={l as string} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); (fn as () => void)(); }}>
            <rect x={1200 + i * 108} y={442} width={100} height={48} rx={10} fill={c as string} />
            <text x={1250 + i * 108} y={472} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800} pointerEvents="none">{l as string}</text>
          </g>))}
        <text x={1200} y={530} fill="#9aa0b8" fontSize={12} letterSpacing={2}>对这个孩子{kid ? `（${KIDS[kid - 1]}）` : '（先点一个）'}</text>
        {['🤗 安抚', '✋ 分开', '⭐ 表扬', '🪑 请回座位'].map((l, i) => (
          <g key={l} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); care(i + 1); }}>
            <rect x={1200 + (i % 2) * 164} y={544 + Math.floor(i / 2) * 60} width={156} height={50} rx={10} fill={kid ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)'} stroke="rgba(255,255,255,.3)" strokeWidth={1.5} />
            <text x={1278 + (i % 2) * 164} y={575 + Math.floor(i / 2) * 60} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={700} pointerEvents="none">{l}</text>
          </g>))}
        <text x={1200} y={690} fill="#9aa0b8" fontSize={11.5}>哭 → 安抚 · 抢 → 分开 · 跑 → 请回座位 · 拍手别超过四次</text>
        {bubble && <text x={1360} y={714} textAnchor="middle" fill="#ffd166" fontSize={13} fontWeight={700}>{bubble}</text>}
      </g>
      {/* 清单 */}
      <g pointerEvents="none">
        <rect x={60} y={790} width={1480} height={80} rx={16} fill="rgba(23,26,46,.85)" />
        {steps.map(([label, done], i) => { const x = 90 + i * 360, on = seg === i + 1; return (
          <g key={label}>
            <circle cx={x + 8} cy={830} r={9} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
            <text x={x + 26} y={836} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={16} fontWeight={on ? 800 : 500}>{i + 1}. {label} · {SEG_LEN[i + 1] / 60} 分钟</text>
          </g>); })}
      </g>
    </g>
  );
}
