'use client';

/**
 * 3 号温室（午间环控接管的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   底图是连栋玻璃温室内部（3D 场景抽的一帧）；叠上：顶窗开度（屋脊一排窗扇转角）、内遮阳幕（半透明白幕从上拉下）、
 *   微雾（喷嘴雾粒）、循环风机（转）、传感器点位标牌（温湿光 CO₂）、雨（屋顶雨丝）。
 *   右边是环控柜：自动 / 手动、顶窗、遮阳两个拉杆，风机 / 微雾 / 补水三个开关，水箱液位，异常事件记录；网关异常时自动模式灰掉。
 */
import React, { useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { FAULT_T, RH_OK, T_OK } from '@/lib/lab-greenhouse-spec';

export function GreenhouseStage({ st, running: live, auto, act }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => { x: number; y: number } | null;
}) {
  const t = st.t, c = st.controls, v = st.vars;
  const manual = c.manual === 1, fan = c.fan === 1, mist = c.mist === 1, refill = c.refill === 1;
  const vent = v.vent_eff ?? 30, shade = v.shade_eff ?? 0, mistOn = (v.mist_on || 0) >= 1, tank = v.tank ?? 0;
  const temp = v.temp ?? 29, rh = v.rh ?? 62, co2 = v.co2 ?? 620, sun = v.sun ?? 70, rain = (v.rain || 0) >= 1, fault = (v.fault || 0) >= 1;
  const drop = (v.drop || 0) >= 1, burn = (v.pump_burn || 0) >= 1, logged = (v.logged || 0) >= 1, hotS = v.hot_s || 0;
  const canAct = live && !auto;
  const [msg, setMsg] = useState('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2800); };
  const knob = (id: string, cur: number, d: number) => { if (!canAct) return; if (!manual) { say('还在自动模式，先切手动接管'); return; } act(id, Math.max(0, Math.min(100, cur + d))); };
  const sw = (id: string, on: boolean) => { if (!canAct) return; if (id !== 'manual' && !manual) { say('还在自动模式，先切手动接管'); return; } if (id === 'mist' && !on && tank <= 0) say('水箱是空的，开了就是干抽'); act(id, on ? 0 : 1); };
  const phase = !fault ? '自动模式在跑：看着就行，留意网关状态' : !manual ? '⚠ 网关响应异常，自动模式不再执行——切手动接管' : temp > 30 ? '降温：顶窗开大、遮阳拉到七成、微雾（先看水箱）' : rain ? '下雨：顶窗收到 30% 以下' : rh < RH_OK[0] ? '湿度偏低：开微雾' : rh > RH_OK[1] ? '湿度偏高：停雾、开风机' : co2 < 450 ? 'CO₂ 偏低：窗收一半' : !logged ? '环境稳了：把这次异常记进平台' : '稳住，盯着';
  const lever = (id: string, label: string, val: number, x: number, y: number, color: string, band?: [number, number]) => (
    <g>
      <text x={x} y={y - 10} fill="#c7cbe6" fontSize={13} fontWeight={800}>{label} · {val.toFixed(0)}%</text>
      <rect x={x} y={y} width={300} height={30} rx={8} fill="#1b1f2a" stroke="rgba(255,255,255,.25)" strokeWidth={2} />
      {band && <rect x={x + band[0] * 3} y={y + 3} width={(band[1] - band[0]) * 3} height={24} rx={5} fill="rgba(61,220,151,.28)" />}
      <rect x={x + 2} y={y + 3} width={val * 2.96} height={24} rx={6} fill={color} opacity={.8} />
      <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); knob(id, val, -10); }}><rect x={x + 316} y={y - 4} width={38} height={38} rx={8} fill="rgba(255,255,255,.14)" stroke="#fff" strokeWidth={1.5} /><text x={x + 335} y={y + 23} textAnchor="middle" fill="#fff" fontSize={20} fontWeight={800} pointerEvents="none">−</text></g>
      <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); knob(id, val, 10); }}><rect x={x + 362} y={y - 4} width={38} height={38} rx={8} fill="rgba(255,255,255,.14)" stroke="#fff" strokeWidth={1.5} /><text x={x + 381} y={y + 23} textAnchor="middle" fill="#fff" fontSize={20} fontWeight={800} pointerEvents="none">+</text></g>
    </g>
  );
  const toggle = (id: string, label: string, on: boolean, x: number, y: number, color: string, sub?: string) => (
    <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); sw(id, on); }}>
      <rect x={x} y={y} width={190} height={56} rx={12} fill={on ? color : 'rgba(255,255,255,.1)'} stroke={on ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={on ? 2.5 : 1.5} />
      <text x={x + 14} y={y + 24} fill="#fff" fontSize={13.5} fontWeight={800} pointerEvents="none">{on ? '✓ ' : '○ '}{label}</text>
      {sub && <text x={x + 14} y={y + 44} fill="rgba(255,255,255,.75)" fontSize={11.5} pointerEvents="none">{sub}</text>}
    </g>
  );
  const tag = (x: number, y: number, label: string, val: string, warn: boolean) => (
    <g pointerEvents="none">
      <rect x={x} y={y} width={150} height={44} rx={8} fill={warn ? 'rgba(214,51,108,.85)' : 'rgba(12,16,32,.72)'} stroke="rgba(255,255,255,.3)" />
      <text x={x + 10} y={y + 17} fill="#c7cbe6" fontSize={11}>{label}</text>
      <text x={x + 10} y={y + 36} fill="#fff" fontSize={15} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{val}</text>
    </g>
  );

  return (
    <g>
      {/* 温室里的叠层 */}
      <g>
        {/* 顶窗：屋脊一排窗扇 */}
        {Array.from({ length: 8 }, (_, i) => { const x = 120 + i * 130, ang = -vent * 0.5; return <g key={i} transform={`translate(${x} 70)`}><line x1={0} y1={0} x2={60} y2={0} stroke="rgba(255,255,255,.35)" strokeWidth={3} /><line x1={0} y1={0} x2={60 * Math.cos(ang * Math.PI / 180)} y2={60 * Math.sin(ang * Math.PI / 180)} stroke="#e9f4ff" strokeWidth={5} strokeLinecap="round" /></g>; })}
        <text x={120} y={52} fill="#e9f4ff" fontSize={12.5} fontWeight={800} style={{ textShadow: '0 1px 4px #000' }}>顶通风窗 {vent.toFixed(0)}%{rain ? ' · 下雨' : ''}</text>
        {/* 内遮阳幕 */}
        <rect x={0} y={90} width={1600} height={shade * 3.2} fill="#f4f4f0" opacity={.5} />
        {shade > 0 && <text x={800} y={100 + shade * 3.2 + 16} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={800} style={{ textShadow: '0 1px 4px #000' }}>内遮阳 {shade.toFixed(0)}%</text>}
        {/* 雨 */}
        {rain && Array.from({ length: 40 }, (_, i) => <line key={i} x1={(i * 41) % 1600} y1={((t * 300 + i * 23) % 420)} x2={(i * 41) % 1600 - 4} y2={((t * 300 + i * 23) % 420) + 18} stroke="#bfe8ff" strokeWidth={1.5} opacity={.6} />)}
        {/* 微雾 */}
        {mistOn && Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 53) % 1600} cy={120 + ((t * 40 + i * 17) % 260)} r={2 + (i % 3)} fill="#fff" opacity={.5}><animate attributeName="opacity" values=".6;.1" dur="1.2s" repeatCount="indefinite" /></circle>)}
        {/* 风机 */}
        <g transform="translate(1440 150)"><circle r={26} fill="rgba(12,16,32,.6)" stroke="#c7cbe6" strokeWidth={2} />{[0, 1, 2].map(i => <path key={i} d="M 0 0 L 8 -22 Q 0 -26 -8 -22 Z" fill="#c7cbe6" transform={`rotate(${i * 120})`}>{fan && <animateTransform attributeName="transform" type="rotate" from={`${i * 120}`} to={`${i * 120 + 360}`} dur="0.6s" repeatCount="indefinite" />}</path>)}<text y={48} textAnchor="middle" fill="#fff" fontSize={11.5} fontWeight={700} style={{ textShadow: '0 1px 4px #000' }}>循环风机 {fan ? '开' : '关'}</text></g>
        {/* 传感器点位 */}
        {tag(360, 500, '温度 T1 · 坐果区', `${temp.toFixed(1)} ℃${hotS > 0 ? ` · 超33 ${hotS.toFixed(0)}s` : ''}`, temp > 33)}
        {tag(560, 560, '湿度 RH1', `${rh.toFixed(0)} %`, rh > 90 || rh < 50)}
        {tag(760, 500, 'CO₂ C1', `${co2.toFixed(0)} ppm`, co2 < 400)}
        {tag(960, 560, '光照 L1', `${sun.toFixed(0)}${rain ? ' · 阴雨' : ' · 正午'}`, false)}
        {drop && <text x={640} y={660} textAnchor="middle" fill="#ff5fa2" fontSize={20} fontWeight={800} style={{ textShadow: '0 1px 4px #000' }}>落花落果了：高温持续超过一分钟</text>}
        {/* 网关 */}
        <g pointerEvents="none"><rect x={40} y={800} width={360} height={60} rx={12} fill={fault ? 'rgba(214,51,108,.9)' : 'rgba(12,16,32,.72)'} stroke="rgba(255,255,255,.3)" />{fault && <animate attributeName="opacity" values="1;.7;1" dur=".8s" repeatCount="indefinite" />}
          <text x={60} y={826} fill="#fff" fontSize={14} fontWeight={800}>{fault ? '⚠ 环控网关：响应超时 · 自动策略未执行' : '环控网关：正常 · 自动策略运行中'}</text>
          <text x={60} y={848} fill="rgba(255,255,255,.85)" fontSize={12}>{fault ? (manual ? '已手动接管' : `异常 ${Math.floor(t - FAULT_T)} 分钟 · 请手动接管`) : `12:${String(Math.floor(t / 2)).padStart(2, '0')} · 自动`}</text>
        </g>
      </g>
      {/* 环控柜 */}
      <g>
        <rect x={1120} y={230} width={450} height={640} rx={20} fill="rgba(12,16,32,.86)" stroke="rgba(255,255,255,.2)" strokeWidth={2} />
        <text x={1146} y={264} fill="#ffd166" fontSize={16} fontWeight={800}>3 号温室 · 环控柜</text>
        <foreignObject x={1140} y={276} width={410} height={46}><div style={{ color: '#c7cbe6', fontSize: 12.5, lineHeight: 1.45, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif' }}>{phase}</div></foreignObject>
        {toggle('manual', manual ? '手动接管中' : '自动模式', manual, 1146, 330, '#ff8a5f', manual ? '顶窗 / 遮阳 / 风机 / 微雾由你控' : fault ? '网关异常：自动策略已停' : '按温度自动调窗')}
        {lever('vent', '顶通风窗', vent, 1146, 420, '#7cc8ff', rain ? [0, 30] : undefined)}
        {lever('shade', '内遮阳幕', shade, 1146, 490, '#f4f4f0')}
        {toggle('fan', '循环风机', fan, 1146, 548, '#12b5cb')}
        {toggle('mist', '高压微雾泵', mist, 1356, 548, burn ? '#8a2d3b' : '#3ddc97', burn ? '泵烧了' : tank <= 0 ? '水箱空' : undefined)}
        {toggle('refill', '水箱补水阀', refill, 1146, 616, '#6a5cff', `液位 ${tank.toFixed(0)}%`)}
        <rect x={1356} y={616} width={190} height={56} rx={12} fill="rgba(0,0,0,.4)" stroke="rgba(255,255,255,.2)" /><rect x={1360} y={620} width={182 * tank / 100} height={48} rx={9} fill={tank < 15 ? '#ff5fa2' : '#7cc8ff'} opacity={.7} /><text x={1451} y={650} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800}>微雾水箱 {tank.toFixed(0)}%</text>
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) act('log', 1); }}>
          <rect x={1146} y={690} width={400} height={48} rx={12} fill={logged ? '#12a150' : 'rgba(255,255,255,.12)'} stroke="#fff" strokeWidth={2} />
          <text x={1346} y={720} textAnchor="middle" fill="#fff" fontSize={13.5} fontWeight={800} pointerEvents="none">{logged ? '✓ 异常已记入平台' : '📝 记录异常事件（网关超时 · 手动接管 · 处置）'}</text>
        </g>
        <text x={1146} y={766} fill="#9aa0b8" fontSize={11.5}>坐果期目标：{T_OK[0]}–{T_OK[1]} ℃ · 湿度 {RH_OK[0]}–{RH_OK[1]}% · CO₂ ≥ 400 ppm</text>
        {[['接管', (v.took || 0) >= 1], ['降到 30 以下', (v.cooled || 0) >= 1], ['先补水', (v.tank_ok || 0) >= 1], ['湿度稳', (v.rh_ok_s || 0) >= 40], ['雨天收窗', (v.rain_ok || 0) >= 1], ['记录', logged]].map(([l, ok], i) => (
          <g key={String(l)}><circle cx={1160 + (i % 3) * 135} cy={i < 3 ? 800 : 836} r={7} fill={ok ? '#3ddc97' : 'transparent'} stroke={ok ? '#3ddc97' : 'rgba(255,255,255,.4)'} strokeWidth={2} /><text x={1174 + (i % 3) * 135} y={i < 3 ? 805 : 841} fill={ok ? '#3ddc97' : 'rgba(255,255,255,.65)'} fontSize={12.5} fontWeight={ok ? 800 : 500}>{String(l)}</text></g>
        ))}
      </g>
      {msg && <g pointerEvents="none"><rect x={420} y={840} width={660} height={40} rx={10} fill="rgba(255,95,162,.9)" /><text x={750} y={866} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{msg}</text></g>}
    </g>
  );
}
