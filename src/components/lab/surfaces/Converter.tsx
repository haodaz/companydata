'use client';

/**
 * 302 炉（转炉炼钢 · 吹炼终点控制的交互故事）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   底图是炉前平台正对炉口的照片（BenchRunner 铺在 svg 后面）；这里叠：氧枪（随枪位上下）、炉口火焰（随供氧变大变亮）、
 *   渣位 / 喷溅、冷却水报警灯；右边是主控屏：枪位和供氧两个大旋钮（拖动 / 点加减）、下料按钮、副枪、挡渣、底吹氩、出钢，
 *   以及碳-温两条曲线和终点窗口（绿框）。所有数值都是真炉子上会采的点。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { C_BAND, T_BAND } from '@/lib/lab-converter-spec';

export function ConverterStage({ st, running: live, auto, act }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => { x: number; y: number } | null;
}) {
  const c = st.controls, v = st.vars;
  const lance = c.lance ?? 3, o2 = c.o2 || 0, argon = c.argon === 1;
  const carbon = v.carbon ?? 4, temp = v.temp ?? 1360, slag = v.slag || 0, water = v.water ?? 100, tip = v.tip_heat || 0;
  const blowing = (v.blowing || 0) >= 1, inBand = (v.in_band || 0) >= 1, measured = (v.measured || 0) >= 1, measOk = (v.meas_ok || 0) >= 1, tapped = (v.tapped || 0) >= 1, slagHeld = (v.slag_held || 0) >= 1;
  const spit = (v.spit || 0) >= 1, burn = (v.tip_burn || 0) >= 1;
  const canAct = live && !auto;
  const [msg, setMsg] = useState('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };
  // 曲线
  const hist = useRef<{ c: number; t: number }[]>([]);
  const lastT = useRef(-1);
  if (st.t !== lastT.current) { lastT.current = st.t; hist.current.push({ c: carbon, t: temp }); if (hist.current.length > 240) hist.current.shift(); }
  useEffect(() => () => { hist.current = []; }, []);
  // 副枪测过的读数：按下那一刻的值
  const [reading, setReading] = useState<{ c: number; t: number } | null>(null);
  useEffect(() => { if (measured && !reading) setReading({ c: carbon, t: temp }); }, [measured]);   // eslint-disable-line react-hooks/exhaustive-deps

  const knob = (id: string, cur: number, delta: number, min: number, max: number) => { if (!canAct) return; act(id, Math.round(Math.max(min, Math.min(max, cur + delta)) * 10) / 10); };
  const press = (id: string) => {
    if (!canAct) return;
    if (id === 'tap') { if (!measured) say('还没副枪测温定碳'); else if (!inBand) say('碳 / 温不在窗口，这炉钢出了也得回炉'); else if (o2 > 5) say('先停吹提枪'); }
    if (id === 'sublance' && lance < 2.6) say('副枪下去测了——氧枪还在炉里，注意别碰枪');
    act(id, 1);
  };
  const flame = blowing ? Math.min(1, 0.25 + o2 / 100 * 0.75) : 0;
  const lanceY = 120 + (3.0 - lance) * 150;                     // 枪位 3.0 → 120（炉口上方），1.0 → 420（深入）
  const phase = tapped ? '已出钢 · 去溅渣护炉' : burn ? '枪头烧穿——停炉' : water < 80 ? (lance >= 2.2 && o2 <= 30 ? '冷却水掉了：已提枪降氧，等流量恢复' : '⚠ 氧枪冷却水流量掉了：立刻提枪、降氧！') : measOk ? '测温定碳在窗口：停吹提枪 → 挡渣 → 底吹氩 → 出钢' : inBand ? '碳温都进窗口了：副枪测温定碳' : carbon > 1.0 ? (slag < 45 ? '前期：高枪小氧化渣，石灰造渣' : '降枪大氧脱碳，看温度冲高就加矿') : carbon > 0.3 ? '主脱碳期：盯住碳和温度，临近终点准备收氧' : '碳低于 0.3，脱碳变慢：收氧、提枪，别过烧';

  const Knob = ({ id, label, val, unit, min, max, step, x, y, color }: { id: string; label: string; val: number; unit: string; min: number; max: number; step: number; x: number; y: number; color: string }) => {
    const f = (val - min) / (max - min), ang = -135 + f * 270;
    return (
      <g>
        <text x={x} y={y - 64} textAnchor="middle" fill="#c7cbe6" fontSize={13} fontWeight={800}>{label}</text>
        <circle cx={x} cy={y} r={50} fill="#1b1f2a" stroke="rgba(255,255,255,.25)" strokeWidth={3} />
        <path d={`M ${x + 50 * Math.cos((-135 - 90) * Math.PI / 180)} ${y + 50 * Math.sin((-135 - 90) * Math.PI / 180)} A 50 50 0 ${f > 0.5 ? 1 : 0} 1 ${x + 50 * Math.cos((ang - 90) * Math.PI / 180)} ${y + 50 * Math.sin((ang - 90) * Math.PI / 180)}`} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
        <line x1={x} y1={y} x2={x + 38 * Math.cos((ang - 90) * Math.PI / 180)} y2={y + 38 * Math.sin((ang - 90) * Math.PI / 180)} stroke="#fff" strokeWidth={4} strokeLinecap="round" />
        <text x={x} y={y + 76} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={800}>{id === 'lance' ? val.toFixed(1) : val.toFixed(0)} {unit}</text>
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); knob(id, val, -step, min, max); }}><circle cx={x - 70} cy={y + 70} r={16} fill="rgba(255,255,255,.14)" stroke="#fff" strokeWidth={1.5} /><text x={x - 70} y={y + 76} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={800} pointerEvents="none">−</text></g>
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); knob(id, val, step, min, max); }}><circle cx={x + 70} cy={y + 70} r={16} fill="rgba(255,255,255,.14)" stroke="#fff" strokeWidth={1.5} /><text x={x + 70} y={y + 76} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={800} pointerEvents="none">+</text></g>
      </g>
    );
  };
  const btn = (id: string, label: string, x: number, y: number, w: number, color: string, on?: boolean) => (
    <g key={id} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (id === 'argon') { if (canAct) act('argon', argon ? 0 : 1); } else press(id); }}>
      <rect x={x} y={y} width={w} height={52} rx={12} fill={on === undefined ? color : on ? color : 'rgba(255,255,255,.1)'} stroke="#fff" strokeWidth={2} />
      <text x={x + w / 2} y={y + 33} textAnchor="middle" fill="#fff" fontSize={13.5} fontWeight={800} pointerEvents="none">{label}</text>
    </g>
  );
  // 碳-温曲线（横轴时间，纵轴各自归一）
  const curve = (x: number, y: number, w: number, h: number) => {
    const pts = hist.current, n = pts.length;
    const cy = (val: number) => y + h - (Math.min(4.5, val) / 4.5) * h, ty = (val: number) => y + h - ((Math.max(1200, Math.min(1800, val)) - 1200) / 600) * h;
    const dc = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x + (i / 239) * w} ${cy(p.c)}`).join(' '), dt = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x + (i / 239) * w} ${ty(p.t)}`).join(' ');
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={8} fill="rgba(0,0,0,.5)" stroke="rgba(255,255,255,.15)" />
        <rect x={x} y={cy(C_BAND[1])} width={w} height={cy(C_BAND[0]) - cy(C_BAND[1]) + 2} fill="rgba(255,209,102,.25)" />
        <rect x={x} y={ty(T_BAND[1])} width={w} height={ty(T_BAND[0]) - ty(T_BAND[1])} fill="rgba(61,220,151,.22)" />
        {n > 1 && <path d={dc} fill="none" stroke="#ffd166" strokeWidth={2.5} />}
        {n > 1 && <path d={dt} fill="none" stroke="#3ddc97" strokeWidth={2.5} />}
        <text x={x + 8} y={y + 16} fill="#ffd166" fontSize={11}>碳 %（黄框 = 终点窗口）</text>
        <text x={x + w - 8} y={y + 16} textAnchor="end" fill="#3ddc97" fontSize={11}>温度 ℃（绿框 = 终点窗口）</text>
      </g>
    );
  };

  return (
    <g>
      <rect x={0} y={0} width={1600} height={900} fill="rgba(10,12,30,.25)" />
      {/* 炉口 + 氧枪（叠在底图上） */}
      <g>
        {/* 枪身 */}
        <rect x={1238} y={0} width={24} height={lanceY} fill="#3b4254" stroke="#8a93a6" strokeWidth={2} />
        <rect x={1230} y={lanceY - 10} width={40} height={18} rx={4} fill={tip > 40 ? '#ff2f4f' : '#6b7089'} stroke="#c7cbe6" strokeWidth={2}>{tip > 40 && <animate attributeName="opacity" values="1;.4;1" dur=".5s" repeatCount="indefinite" />}</rect>
        <text x={1290} y={lanceY + 4} fill="#c7cbe6" fontSize={12.5} fontWeight={700}>氧枪 {lance.toFixed(1)} m{lance >= 2.6 ? '（提出）' : lance >= 1.9 ? '（高枪）' : lance <= 1.5 ? '（低枪）' : ''}</text>
        {/* 氧流 */}
        {blowing && <path d={`M 1250 ${lanceY + 8} L ${1250 - 10 - o2 * .3} ${lanceY + 60 + o2 * .4} L ${1250 + 10 + o2 * .3} ${lanceY + 60 + o2 * .4} Z`} fill="#bfe8ff" opacity={.35 + o2 / 300} />}
        {/* 炉口火焰 */}
        {flame > 0 && <g opacity={flame}>
          <ellipse cx={1250} cy={470} rx={120 + flame * 120} ry={60 + flame * 70} fill="#ff6a2f" opacity={.45} filter="url(#bench-blur)" />
          <ellipse cx={1250} cy={440} rx={70 + flame * 80} ry={40 + flame * 60} fill="#ffb86b" opacity={.75} filter="url(#bench-blur-sm)"><animate attributeName="ry" values={`${40 + flame * 60};${52 + flame * 70};${40 + flame * 60}`} dur=".35s" repeatCount="indefinite" /></ellipse>
          <ellipse cx={1250} cy={430} rx={30 + flame * 40} ry={18 + flame * 30} fill="#fff6d6" opacity={.9} />
          {Array.from({ length: Math.round(6 + flame * 10) }, (_, i) => <circle key={i} cx={1250 + Math.sin(st.t * 7 + i * 1.7) * (60 + flame * 120)} cy={400 - ((st.t * 90 + i * 37) % 160)} r={2 + (i % 3)} fill="#ffd166" opacity={.8} />)}
        </g>}
        {spit && <text x={1250} y={560} textAnchor="middle" fill="#ff5fa2" fontSize={18} fontWeight={800}>喷溢！渣从炉口涌出来</text>}
        {burn && <text x={1250} y={590} textAnchor="middle" fill="#ff2f4f" fontSize={20} fontWeight={800}>枪头烧穿 · 停炉</text>}
        {/* 渣位 */}
        <rect x={1500} y={330} width={22} height={200} rx={6} fill="rgba(0,0,0,.5)" stroke="rgba(255,255,255,.3)" />
        <rect x={1503} y={333 + (1 - slag / 100) * 194} width={16} height={(slag / 100) * 194} rx={4} fill={slag > 75 ? '#ff5fa2' : slag < 10 ? '#ff8a5f' : '#c9a24a'} />
        <text x={1511} y={320} textAnchor="middle" fill="#c7cbe6" fontSize={11.5}>渣位</text><text x={1511} y={550} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={800}>{slag.toFixed(0)}</text>
        {/* 冷却水灯 */}
        <g>
          <rect x={1180} y={50} width={380} height={74} rx={12} fill={water < 80 ? 'rgba(255,47,79,.85)' : 'rgba(12,16,32,.7)'} stroke="rgba(255,255,255,.3)" strokeWidth={2}>{water < 80 && <animate attributeName="opacity" values="1;.6;1" dur=".6s" repeatCount="indefinite" />}</rect>
          <text x={1200} y={78} fill="#fff" fontSize={13} fontWeight={800}>氧枪冷却水 {water.toFixed(0)}%{water < 80 ? ' · 流量低报警' : ' · 正常'}</text>
          <text x={1200} y={102} fill="#fff" fontSize={12}>枪头过热 {tip.toFixed(0)} / 100{water < 80 ? ' · 提枪 ≥ 2.2 m、供氧 ≤ 30%' : ''}</text>
        </g>
        {/* 读数牌 */}
        <g>
          <rect x={1180} y={600} width={380} height={120} rx={12} fill="rgba(12,16,32,.7)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
          <text x={1200} y={630} fill="#ffd166" fontSize={13} fontWeight={800}>熔池 · 模型估算</text>
          <text x={1200} y={660} fill="#fff" fontSize={22} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">C {carbon.toFixed(carbon < 1 ? 3 : 2)} %</text>
          <text x={1200} y={694} fill="#fff" fontSize={22} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">T {temp.toFixed(0)} ℃</text>
          <text x={1400} y={660} fill={inBand ? '#3ddc97' : '#9aa0b8'} fontSize={12} fontWeight={800}>{inBand ? '碳温在窗口' : '未到窗口'}</text>
          <text x={1400} y={694} fill="#9aa0b8" fontSize={11}>窗口 C {C_BAND[0]}–{C_BAND[1]}</text>
        </g>
        {reading && <g>
          <rect x={1180} y={730} width={380} height={56} rx={12} fill="rgba(61,220,151,.18)" stroke="#3ddc97" strokeWidth={2} />
          <text x={1200} y={752} fill="#3ddc97" fontSize={13} fontWeight={800}>副枪测温定碳 · 实测</text>
          <text x={1200} y={776} fill="#fff" fontSize={14} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">C {reading.c.toFixed(3)} %  T {reading.t.toFixed(0)} ℃  {measOk ? '✓ 在窗口' : '✗ 不在窗口'}</text>
        </g>}
      </g>
      {/* 主控屏 */}
      <g>
        <rect x={40} y={40} width={680} height={820} rx={20} fill="rgba(12,16,32,.82)" stroke="rgba(255,255,255,.2)" strokeWidth={2} />
        <text x={66} y={76} fill="#ffd166" fontSize={17} fontWeight={800}>302 炉 主控 · 吹炼</text>
        <foreignObject x={60} y={88} width={640} height={48}><div style={{ color: '#c7cbe6', fontSize: 12.5, lineHeight: 1.45, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif' }}>{phase}</div></foreignObject>
        <Knob id="lance" label="氧枪枪位" val={lance} unit="m" min={1.0} max={3.0} step={0.1} x={170} y={240} color="#7cc8ff" />
        <Knob id="o2" label="供氧流量" val={o2} unit="%" min={0} max={100} step={5} x={460} y={240} color="#ff8a5f" />
        {btn('lime', '加活性石灰 −60 ℃ · 渣 +', 66, 370, 300, '#6a5cff')}
        {btn('ore', '加冷却矿石 −110 ℃', 386, 370, 300, '#12b5cb')}
        {btn('sublance', measured ? '副枪已测 · 再测' : '副枪测温定碳', 66, 436, 300, inBand && !measured ? '#12a150' : '#3b4254')}
        {btn('slag_stop', slagHeld ? '✓ 已挡渣' : '挡渣', 386, 436, 145, slagHeld ? '#12a150' : '#3b4254')}
        {btn('argon', argon ? '✓ 底吹氩 开' : '底吹氩', 541, 436, 145, '#3ddc97', argon)}
        {btn('tap', tapped ? '已出钢' : '出 钢', 66, 502, 620, measOk && o2 <= 5 && !tapped ? '#ff2f4f' : '#8a2d3b')}
        {curve(66, 580, 620, 200)}
        <text x={66} y={810} fill="#9aa0b8" fontSize={11.5}>数采点：温度 · 碳 · 枪位 · 供氧 · 冷却水 · 渣位（每 0.25 s 一帧，进事件流）</text>
      </g>
      {msg && <g pointerEvents="none"><rect x={40} y={830} width={680} height={40} rx={10} fill="rgba(255,95,162,.9)" /><text x={380} y={856} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{msg}</text></g>}
      {/* 顺序提示 */}
      <g pointerEvents="none">
        <rect x={760} y={800} width={800} height={70} rx={14} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        <text x={780} y={826} fill="#ffd166" fontSize={14} fontWeight={800}>化渣 → 降枪脱碳 → 冷却水报警提枪 → 碳温进窗 → 副枪 → 停吹 → 挡渣 → 底吹氩 → 出钢</text>
        {[['化渣', slag >= 45], ['碳<1%', carbon <= 1], ['水报警处置', (v.water_ok || 0) >= 1], ['进窗口', inBand || measOk], ['副枪确认', measOk], ['出钢', tapped]].map(([l, ok], i) => (
          <g key={String(l)}><circle cx={792 + i * 128} cy={852} r={7} fill={ok ? '#3ddc97' : 'transparent'} stroke={ok ? '#3ddc97' : 'rgba(255,255,255,.4)'} strokeWidth={2} /><text x={806 + i * 128} y={857} fill={ok ? '#3ddc97' : 'rgba(255,255,255,.65)'} fontSize={12.5} fontWeight={ok ? 800 : 500}>{String(l)}</text></g>
        ))}
      </g>
    </g>
  );
}
