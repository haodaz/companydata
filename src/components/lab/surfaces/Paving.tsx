'use client';

/**
 * 摊铺机（沥青摊铺的交互故事）：左右分屏，画在 BenchRunner 的场景 svg 里（1600 × 900）。
 *   右边是驾驶位看出去的真实画面（底图）：叠上刚铺好的路面带、料车靠上来卸料、压路机在后面跟着、热气；
 *   左边是驾驶室操作台：速度手柄（拖 / 点）、松铺厚度、料斗余量、料车到场卡（温度，接收 / 退回）、翼板、压路机间距。
 *   料车按时刻表到场：台面把这一车的温度写进隐藏控件 tt；接收后 10 秒卸料（dock=1），料斗补上来。第 140 分钟便道压车，第 5 车晚到。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { JAM_T, MIN_TEMP, ROLLER_BAND, SPEED_BAND, THICK_BAND, TRUCKS } from '@/lib/lab-paving-spec';

export function PavingStage({ st, running: live, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
  toScene: (clientX: number, clientY: number) => { x: number; y: number } | null;
}) {
  const t = st.t, c = st.controls, v = st.vars;
  const speed = c.speed || 0, thick = c.thick ?? 7, roller = c.roller ?? 14, dock = c.dock === 1, tt = c.tt || 0;
  const hopper = v.hopper || 0, laid = v.laid || 0, matT = v.mat_t || 0, trucksIn = Math.round(v.trucks_in || 0);
  const stopped = (v.stopped || 0) >= 1, starved = (v.starved || 0) >= 1, started = (v.started || 0) >= 1;
  const canAct = live && !auto;
  const [msg, setMsg] = useState('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2800); };
  // 料车队：到场的、还没处理的那一辆在等
  const [handled, setHandled] = useState<number[]>([]);
  const dockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrived = TRUCKS.filter(x => x.arrive <= t && !handled.includes(x.id));
  const waiting = arrived[0] || null;
  const nextTruck = TRUCKS.find(x => x.arrive > t);
  // 到场就把温度写进隐藏控件（真人操作时）；示范由脚本自己写
  useEffect(() => { if (!auto && waiting && Math.round(tt) !== waiting.temp) setHidden('tt', waiting.temp); }, [waiting, auto]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 示范：脚本按下 accept / reject 时把队列里的车标成已处理
  useEffect(() => { if (!auto) return; const n = st.events.filter(e => e.kind === 'control' && (e.control === 'accept' || e.control === 'reject')).length; if (n > handled.length) setHandled(TRUCKS.slice(0, n).map(x => x.id)); }, [auto, st.events.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (dockTimer.current) clearTimeout(dockTimer.current); }, []);

  const accept = () => { if (!canAct || !waiting) return; act('accept', 1); setHandled(h => [...h, waiting.id]); setHidden('dock', 1); if (dockTimer.current) clearTimeout(dockTimer.current); dockTimer.current = setTimeout(() => setHidden('dock', 0), 10000); if (waiting.temp < MIN_TEMP) say(`${waiting.temp} ℃ 的料也收了……这一段压不实`); };
  const reject = () => { if (!canAct || !waiting) return; act('reject', 1); setHandled(h => [...h, waiting.id]); say(waiting.temp < MIN_TEMP ? `退回：${waiting.temp} ℃ 低于 ${MIN_TEMP} ℃` : `${waiting.temp} ℃ 是合格料，退回去就断料了`); };
  const knob = (id: string, cur: number, d: number, min: number, max: number) => { if (!canAct) return; act(id, Math.round(Math.max(min, Math.min(max, cur + d)) * 10) / 10); };
  const fold = () => { if (!canAct) return; if (dock) say('料车还在卸，这时候收翼板料撒一地'); act('fold', 1); };

  const lever = (id: string, label: string, val: number, unit: string, min: number, max: number, step: number, band: [number, number], x: number, y: number, fmt: (n: number) => string) => {
    const f = (val - min) / (max - min);
    return (
      <g>
        <text x={x} y={y - 10} fill="#c7cbe6" fontSize={13} fontWeight={800}>{label}</text>
        <rect x={x} y={y} width={380} height={34} rx={8} fill="#1b1f2a" stroke="rgba(255,255,255,.25)" strokeWidth={2} />
        <rect x={x + ((band[0] - min) / (max - min)) * 380} y={y + 4} width={((band[1] - band[0]) / (max - min)) * 380} height={26} rx={5} fill="rgba(61,220,151,.3)" />
        <rect x={x + f * 380 - 9} y={y - 6} width={18} height={46} rx={6} fill={val >= band[0] && val <= band[1] ? '#3ddc97' : '#ffd166'} stroke="#fff" strokeWidth={2} />
        <text x={x + 400} y={y + 24} fill="#fff" fontSize={16} fontWeight={800}>{fmt(val)} {unit}</text>
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); knob(id, val, -step, min, max); }}><rect x={x + 480} y={y - 2} width={38} height={38} rx={8} fill="rgba(255,255,255,.14)" stroke="#fff" strokeWidth={1.5} /><text x={x + 499} y={y + 25} textAnchor="middle" fill="#fff" fontSize={20} fontWeight={800} pointerEvents="none">−</text></g>
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); knob(id, val, step, min, max); }}><rect x={x + 526} y={y - 2} width={38} height={38} rx={8} fill="rgba(255,255,255,.14)" stroke="#fff" strokeWidth={1.5} /><text x={x + 545} y={y + 25} textAnchor="middle" fill="#fff" fontSize={20} fontWeight={800} pointerEvents="none">+</text></g>
      </g>
    );
  };
  const phase = !started ? '把厚度调到 7.5、压路机 10 m，再推速度手柄到 1.0 起步' : waiting ? `${waiting.id} 号料车到场 · ${waiting.temp} ℃ → ${waiting.temp < MIN_TEMP ? '退回' : '接收'}` : t >= JAM_T && t < 185 ? `便道压车：下一车要 ${Math.max(0, Math.ceil(185 - t))} 分钟后才到 — 降速到 0.3–0.6 不断料，料斗快空就收翼板` : hopper < 25 ? '料斗快空了' : '匀速摊铺，盯厚度、盯料温、盯压路机间距';

  return (
    <g>
      {/* 右：真实画面上的叠层 */}
      <g>
        {/* 刚铺的路面带（随摊铺长度变深 / 冒热气） */}
        <path d={`M 700 900 L 1300 900 L 1180 560 L 820 560 Z`} fill="#1a1a1a" opacity={Math.min(.55, laid / 200)} />
        {started && speed > 0.05 && hopper > 0 && [0, 1, 2, 3].map(i => <ellipse key={i} cx={900 + i * 100} cy={640 + (i % 2) * 40} rx={40} ry={14} fill="#fff" opacity={.18}><animate attributeName="cy" values={`${640 + (i % 2) * 40};${600 + (i % 2) * 40}`} dur={`${1.6 + i * .3}s`} repeatCount="indefinite" /><animate attributeName="opacity" values=".2;0" dur={`${1.6 + i * .3}s`} repeatCount="indefinite" /></ellipse>)}
        {/* 料车卸料 */}
        {dock && <g><rect x={620} y={40} width={300} height={40} rx={10} fill="rgba(255,138,95,.9)" /><text x={770} y={66} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>料车卸料中 · 料斗 {hopper.toFixed(0)}%</text>
          {[0, 1, 2].map(i => <circle key={i} cx={760 + i * 18} cy={300 + i * 10} r={5} fill="#3b3b3b"><animate attributeName="cy" values={`${300 + i * 10};${380 + i * 10}`} dur=".7s" repeatCount="indefinite" /></circle>)}</g>}
        {/* 压路机间距标尺 */}
        <g>
          <line x1={1000} y1={880} x2={1000} y2={880 - roller * 22} stroke="#ffd166" strokeWidth={3} strokeDasharray="8 6" />
          <rect x={940} y={880 - roller * 22 - 44} width={120} height={36} rx={8} fill={roller >= ROLLER_BAND[0] && roller <= ROLLER_BAND[1] ? 'rgba(61,220,151,.9)' : 'rgba(255,95,162,.9)'} />
          <text x={1000} y={880 - roller * 22 - 20} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800}>压路机 {roller} m · 料温 {matT.toFixed(0)} ℃</text>
        </g>
        {/* 摊铺读数 HUD */}
        <g>
          <rect x={1210} y={40} width={350} height={110} rx={12} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
          <text x={1230} y={68} fill="#ffd166" fontSize={13} fontWeight={800}>摊铺机 · 数采</text>
          <text x={1230} y={94} fill="#fff" fontSize={14} fontFamily="ui-monospace, Menlo, monospace">速度 {speed.toFixed(1)} m/min  厚度 {thick.toFixed(1)} cm</text>
          <text x={1230} y={118} fill="#fff" fontSize={14} fontFamily="ui-monospace, Menlo, monospace">已铺 {laid.toFixed(0)} m  料斗 {hopper.toFixed(0)}%  料温 {matT.toFixed(0)} ℃</text>
          <text x={1230} y={140} fill={stopped || starved ? '#ff5fa2' : '#3ddc97'} fontSize={12.5} fontWeight={800}>{stopped ? '停机：冷接缝' : starved ? '断料：出坑' : started ? '摊铺中' : '待起步'}</text>
        </g>
        {t >= JAM_T && t < 185 && <g><rect x={620} y={90} width={560} height={40} rx={10} fill="rgba(255,95,162,.9)" /><text x={900} y={116} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>⚠ 运料便道压车 · 第 5 车晚到 · 降速等料，别停</text></g>}
      </g>
      {/* 左：驾驶室操作台 */}
      <g>
        <rect x={30} y={30} width={600} height={840} rx={20} fill="rgba(12,16,32,.86)" stroke="rgba(255,255,255,.2)" strokeWidth={2} />
        <text x={56} y={66} fill="#ffd166" fontSize={17} fontWeight={800}>驾驶室 · 操作台</text>
        <foreignObject x={50} y={78} width={560} height={48}><div style={{ color: '#c7cbe6', fontSize: 12.5, lineHeight: 1.45, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif' }}>{phase}</div></foreignObject>
        {lever('speed', '速度手柄（绿区 = 匀速窗口）', speed, 'm/min', 0, 2, 0.1, SPEED_BAND, 56, 160, n => n.toFixed(1))}
        {lever('thick', '松铺厚度', thick, 'cm', 5, 10, 0.1, THICK_BAND, 56, 240, n => n.toFixed(1))}
        {lever('roller', '压路机间距（对讲机喊）', roller, 'm', 2, 25, 1, ROLLER_BAND, 56, 320, n => n.toFixed(0))}
        {/* 料斗 */}
        <text x={56} y={400} fill="#c7cbe6" fontSize={13} fontWeight={800}>料斗余量</text>
        <rect x={56} y={410} width={380} height={28} rx={8} fill="#1b1f2a" stroke="rgba(255,255,255,.25)" strokeWidth={2} />
        <rect x={58} y={412} width={376 * hopper / 100} height={24} rx={6} fill={hopper < 20 ? '#ff5fa2' : hopper < 40 ? '#ffd166' : '#3ddc97'} />
        <text x={456} y={431} fill="#fff" fontSize={15} fontWeight={800}>{hopper.toFixed(0)}%</text>
        <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); fold(); }}>
          <rect x={56} y={452} width={180} height={44} rx={10} fill={hopper < 40 && !dock ? '#6a5cff' : 'rgba(255,255,255,.12)'} stroke="#fff" strokeWidth={2} />
          <text x={146} y={480} textAnchor="middle" fill="#fff" fontSize={13.5} fontWeight={800} pointerEvents="none">收翼板归中</text>
        </g>
        <text x={250} y={480} fill="#9aa0b8" fontSize={12}>料斗快空、车没到时收，把余料归到中间</text>
        {/* 料车卡 */}
        <text x={56} y={540} fill="#c7cbe6" fontSize={13} fontWeight={800}>料车到场</text>
        <rect x={56} y={552} width={548} height={120} rx={12} fill={waiting ? (waiting.temp < MIN_TEMP ? 'rgba(255,95,162,.18)' : 'rgba(61,220,151,.14)') : 'rgba(255,255,255,.06)'} stroke={waiting ? '#fff' : 'rgba(255,255,255,.2)'} strokeWidth={waiting ? 2 : 1} />
        {waiting ? <g>
          <text x={76} y={584} fill="#fff" fontSize={16} fontWeight={800}>{waiting.id} 号车 · 改性沥青混合料</text>
          <text x={76} y={610} fill={waiting.temp < MIN_TEMP ? '#ff5fa2' : '#3ddc97'} fontSize={22} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">车厢测温 {waiting.temp} ℃</text>
          <text x={76} y={636} fill="#9aa0b8" fontSize={12}>到场 {Math.floor(t - waiting.arrive)} 分钟 · 合格线 ≥ {MIN_TEMP} ℃</text>
          <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); accept(); }}><rect x={400} y={572} width={90} height={40} rx={10} fill="#12a150" stroke="#fff" strokeWidth={2} /><text x={445} y={598} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800} pointerEvents="none">接收</text></g>
          <g style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); reject(); }}><rect x={500} y={572} width={90} height={40} rx={10} fill="#8a2d3b" stroke="#fff" strokeWidth={2} /><text x={545} y={598} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800} pointerEvents="none">退回</text></g>
        </g> : <g>
          <text x={76} y={590} fill="#c7cbe6" fontSize={14}>{dock ? '卸料中…' : nextTruck ? `下一车 ${nextTruck.id} 号预计 ${Math.max(0, Math.ceil(nextTruck.arrive - t))} 分钟后到${t >= JAM_T && nextTruck.id === 5 ? '（便道压车，晚了）' : ''}` : '今天的料车都到完了'}</text>
          <text x={76} y={616} fill="#9aa0b8" fontSize={12}>已接 {trucksIn} 车</text>
        </g>}
        {/* 底部状态 */}
        <text x={56} y={712} fill="#9aa0b8" fontSize={12}>数采点：速度 · 厚度 · 料温 · 料斗 · 压路机间距（进事件流）</text>
        <rect x={56} y={730} width={548} height={120} rx={12} fill="rgba(255,255,255,.06)" />
        <text x={76} y={758} fill="#ffd166" fontSize={13.5} fontWeight={800}>起步 → 匀速 → 接车看温度 → 压车降速收翼板 → 接上晚到的车恢复匀速</text>
        {[['起步到位', thick >= THICK_BAND[0] && thick <= THICK_BAND[1] && roller >= 8 && roller <= 12 && speed >= 0.9 && speed <= 1.1], ['匀速 60 秒', (v.steady_s || 0) >= 60], ['三车合格 + 退低温', trucksIn >= 3 && (v.good_reject || 0) >= 1], ['压车不断料', (v.jam_slow || 0) >= 1 && (v.fold_ok || 0) >= 1], ['铺过 150 m', laid >= 150]].map(([l, ok], i) => (
          <g key={String(l)}><circle cx={86 + (i % 3) * 180} cy={i < 3 ? 790 : 826} r={7} fill={ok ? '#3ddc97' : 'transparent'} stroke={ok ? '#3ddc97' : 'rgba(255,255,255,.4)'} strokeWidth={2} /><text x={100 + (i % 3) * 180} y={i < 3 ? 795 : 831} fill={ok ? '#3ddc97' : 'rgba(255,255,255,.65)'} fontSize={12.5} fontWeight={ok ? 800 : 500}>{String(l)}</text></g>
        ))}
      </g>
      {msg && <g pointerEvents="none"><rect x={640} y={840} width={920} height={40} rx={10} fill="rgba(255,95,162,.9)" /><text x={1100} y={866} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{msg}</text></g>}
    </g>
  );
}
