'use client';

/**
 * 指挥沙盘（应急指挥 · 山洪的交互故事）：浅色整屏，像指挥大厅里的沙盘大屏。
 *   左边是地图：青岚河（随水位变宽变深）、青石村（低处）、柳湾村（上游高处）、厂区（第 120 分钟坍塌）、两个安置点；
 *   力量图标站在各自的任务点上。右边是调度板：七支力量各一张卡，点任务就派过去；下面是指令按钮和事件流。
 *   力量去向写进隐藏控件（f1 / r1 / p1…=0 待命 1 青石 2 柳湾 3 坍塌），其他动作都是普通控件，对错由规格里的变量算。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { COLLAPSE_T, LW_FLOOD, QS_FLOOD, TASKS, UNITS } from '@/lib/lab-sandtable-spec';

const SPOT: Record<number, { x: number; y: number }> = { 0: { x: 90, y: 560 }, 1: { x: 300, y: 420 }, 2: { x: 560, y: 150 }, 3: { x: 620, y: 470 } };

export function SandtableStage({ st, running, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const t = st.t, v = st.vars, c = st.controls;
  const level = v.level || 0, qs = v.qs_prog || 0, lw = v.lw_prog || 0, co = v.co_prog || 0;
  const qsFlooded = (v.qs_flooded || 0) >= 1, lwFlooded = (v.lw_flooded || 0) >= 1, collapsed = (v.collapsed || 0) >= 1;
  const orderQs = c.order_qs === 1, orderLw = c.order_lw === 1, site2 = c.open_site2 === 1, verified = (v.verified || 0) >= 1;
  const reports = Math.round(v.reports || 0), logs = Math.round(v.logs || 0);
  const assign = (id: string) => Math.round(c[id] || 0);
  const [sel, setSel] = useState<string | null>(null);
  const [logText, setLogText] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [feed, setFeed] = useState<{ t: number; text: string; kind: 'alarm' | 'info' | 'ok' }[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const push = (key: string, text: string, kind: 'alarm' | 'info' | 'ok' = 'info') => { if (seen.current.has(key)) return; seen.current.add(key); setFeed(f => [{ t, text, kind }, ...f].slice(0, 30)); };
  // 剧情事件
  useEffect(() => {
    if (t >= 0) push('start', '市气象台：暴雨红色预警。青岚河上游 1 小时雨量仍在增大，水位持续上涨。', 'alarm');
    if (level >= 3.2) push('warn', `青岚河水位 ${level.toFixed(1)} m，超警戒。青石村河堤段开始漫水。`, 'alarm');
    if (qsFlooded) push('qsflood', `青石村进水！${qs >= 100 ? '村里已无人。' : `还有约 ${Math.round(180 * (1 - qs / 100))} 人没转出来。`}`, qs >= 100 ? 'ok' : 'alarm');
    if (collapsed) push('collapse', '厂区：暴雨冲垮临时厂房一角，6 名工人被困，现场请求消防救援！', 'alarm');
    if ((v.co_done || 0) >= 1) push('codone', '坍塌点：6 人全部救出，2 人轻伤送医。', 'ok');
    if (lwFlooded) push('lwflood', `柳湾村进水。转移 ${lw.toFixed(0)}%。`, lw >= 90 ? 'ok' : 'alarm');
    if ((v.site_full || 0) >= 1 && !site2) push('site', '青石村临时安置点：已满，转移车辆在路口等待，没有地方可去。', 'alarm');
    if (verified) push('verified', '周主任回电：柳湾村进村主路已积水 40 cm，车进不去，要走北侧机耕道，救援队带冲锋舟更稳。', 'info');
    if ((v.qs_done || 0) >= 1) push('qsdone', '青石村：全部转出，含 12 名行动不便人员。', 'ok');
    if (t > 10 && reports === 0) push('late', '指挥部来电：为什么还没有首报？', 'alarm');
  }, [t, level, qsFlooded, lwFlooded, collapsed, qs, lw, verified, site2, reports, v.co_done, v.site_full, v.qs_done]);   // eslint-disable-line react-hooks/exhaustive-deps

  const send = (id: string, val: number) => { if (!canAct) return; act(id, val); };
  const dispatch = (uid: string, task: number) => { if (!canAct) return; setHidden(uid, task); setSel(null); };
  const clock = () => { const m = 540 + Math.floor(t); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const riverW = 26 + Math.max(0, level - 2) * 22;
  const btn = (on: boolean, color = '#6a5cff'): React.CSSProperties => ({ border: `1px solid ${on ? color : 'rgba(23,26,46,.14)'}`, background: on ? color : '#fff', color: on ? '#fff' : '#171a2e', borderRadius: 10, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: canAct ? 'pointer' : 'default' });

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#eef1f7', color: '#171a2e', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'grid', gridTemplateRows: '52px minmax(0, 1fr)', gridTemplateColumns: 'minmax(0, 1fr) 400px', overflow: 'hidden' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', background: '#fff', borderBottom: '1px solid rgba(23,26,46,.1)' }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>青岚河流域 · 指挥沙盘 · {clock()}</span>
        <span style={{ padding: '4px 10px', borderRadius: 999, background: '#ffe3ea', color: '#d6336c', fontSize: 12.5, fontWeight: 800 }}>暴雨红色预警</span>
        <span style={{ fontSize: 12.5, color: level >= 3.2 ? '#d6336c' : '#6b7089', fontWeight: level >= 3.2 ? 800 : 500 }}>水位 {level.toFixed(2)} m{level >= 3.2 ? ' · 超警戒' : ''}</span>
        {collapsed && (v.co_done || 0) < 1 && <span style={{ padding: '4px 10px', borderRadius: 999, background: '#d6336c', color: '#fff', fontSize: 12.5, fontWeight: 800 }}>⚠ 厂区坍塌 · 6 人被困 · 消防 {Math.round(v.co_fire || 0)} 支在场</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7089' }}>报告 {reports} · 决策记录 {logs}</span>
      </div>
      {/* 地图 */}
      <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden' }}>
        <svg viewBox="0 0 800 640" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
          <rect width={800} height={640} fill="#e3ecdd" />
          {/* 山 */}
          <path d="M 0 0 L 800 0 L 800 120 Q 600 60 420 140 Q 250 220 0 160 Z" fill="#cfdcc4" />
          {/* 河 */}
          <path d="M 480 0 Q 470 160 360 260 Q 250 360 230 500 Q 220 600 180 640" fill="none" stroke="#7cc8ff" strokeWidth={riverW} strokeLinecap="round" opacity={.9} />
          <path d="M 480 0 Q 470 160 360 260 Q 250 360 230 500 Q 220 600 180 640" fill="none" stroke="#2f8fd6" strokeWidth={Math.max(6, riverW * .35)} strokeLinecap="round" opacity={.7} />
          <text x={395} y={290} fill="#2f6fa6" fontSize={12} fontWeight={700} transform="rotate(-50 395 290)">青岚河 {level.toFixed(1)} m</text>
          {/* 淹没区 */}
          {level >= 3.2 && <ellipse cx={300} cy={430} rx={60 + (level - 3.2) * 70} ry={34 + (level - 3.2) * 40} fill="#7cc8ff" opacity={.35} />}
          {level >= 4.0 && <ellipse cx={560} cy={160} rx={(level - 4.0) * 120} ry={(level - 4.0) * 70} fill="#7cc8ff" opacity={.35} />}
          {/* 道路 */}
          <path d="M 90 560 L 300 420 L 560 150" fill="none" stroke="#fff" strokeWidth={8} /><path d="M 90 560 L 300 420 L 560 150" fill="none" stroke="#b8bfd0" strokeWidth={4} strokeDasharray="10 8" />
          <path d="M 300 420 L 620 470" fill="none" stroke="#fff" strokeWidth={8} /><path d="M 300 420 L 620 470" fill="none" stroke="#b8bfd0" strokeWidth={4} strokeDasharray="10 8" />
          {/* 地点 */}
          {[{ k: 1, x: 300, y: 420, name: '青石村', sub: `180 人 · 行动不便 12 · 转移 ${qs.toFixed(0)}%`, bad: qsFlooded && qs < 100, prog: qs }, { k: 2, x: 560, y: 150, name: '柳湾村', sub: `240 人 · 转移 ${lw.toFixed(0)}%${verified ? ' · 主路积水' : ' · 道路待核实'}`, bad: lwFlooded && lw < 90, prog: lw }].map(p => (
            <g key={p.k} style={{ cursor: canAct && sel ? 'pointer' : 'default' }} onPointerDown={() => sel && dispatch(sel, p.k)}>
              <circle cx={p.x} cy={p.y} r={34} fill={p.bad ? '#ffe3ea' : '#fff'} stroke={p.bad ? '#d6336c' : sel ? '#6a5cff' : '#8a93a6'} strokeWidth={sel ? 3 : 2} />
              <text x={p.x} y={p.y - 2} textAnchor="middle" fontSize={22}>🏘️</text>
              <rect x={p.x - 30} y={p.y + 14} width={60} height={6} rx={3} fill="#dfe3ee" /><rect x={p.x - 30} y={p.y + 14} width={60 * p.prog / 100} height={6} rx={3} fill="#12a150" />
              <text x={p.x} y={p.y + 56} textAnchor="middle" fontSize={13} fontWeight={800} fill="#171a2e">{p.name}</text>
              <text x={p.x} y={p.y + 72} textAnchor="middle" fontSize={10.5} fill="#6b7089">{p.sub}</text>
            </g>
          ))}
          <g style={{ cursor: canAct && sel && collapsed ? 'pointer' : 'default' }} onPointerDown={() => sel && collapsed && dispatch(sel, 3)}>
            <rect x={590} y={440} width={60} height={60} rx={10} fill={collapsed ? '#ffe3ea' : '#fff'} stroke={collapsed && co < 100 ? '#d6336c' : '#8a93a6'} strokeWidth={collapsed && co < 100 ? 3 : 2} />
            <text x={620} y={480} textAnchor="middle" fontSize={24}>{collapsed ? '🚧' : '🏭'}</text>
            <text x={620} y={520} textAnchor="middle" fontSize={13} fontWeight={800} fill="#171a2e">厂区{collapsed ? ' · 坍塌' : ''}</text>
            {collapsed && <text x={620} y={536} textAnchor="middle" fontSize={10.5} fill={co >= 100 ? '#12a150' : '#d6336c'}>{co >= 100 ? '6 人已救出' : `被困 6 · 搜救 ${co.toFixed(0)}%`}</text>}
          </g>
          {/* 安置点 */}
          <g><text x={130} y={360} textAnchor="middle" fontSize={20}>⛺</text><text x={130} y={380} textAnchor="middle" fontSize={10.5} fill="#6b7089">青石临时安置点 {Math.min(150, Math.round(180 * qs / 100))}/150</text></g>
          {site2 && <g><text x={60} y={440} textAnchor="middle" fontSize={20}>⛺</text><text x={60} y={460} textAnchor="middle" fontSize={10.5} fill="#6b7089">镇中学安置点</text></g>}
          <g style={{ cursor: canAct && sel ? 'pointer' : 'default' }} onPointerDown={() => sel && dispatch(sel, 0)}>
            <rect x={40} y={530} width={100} height={60} rx={10} fill="#fff" stroke={sel ? '#6a5cff' : '#8a93a6'} strokeWidth={sel ? 3 : 2} /><text x={90} y={565} textAnchor="middle" fontSize={13} fontWeight={800} fill="#171a2e">指挥中心</text><text x={90} y={580} textAnchor="middle" fontSize={10.5} fill="#6b7089">待命区</text>
          </g>
          {/* 力量 */}
          {UNITS.map((u, i) => { const task = assign(u.id); const s = SPOT[task]; const k = UNITS.filter(x => assign(x.id) === task).indexOf(u); const x = s.x - 40 + (k % 4) * 22, y = s.y + (task === 0 ? -34 : 96) + Math.floor(k / 4) * 22; return (
            <g key={u.id} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) setSel(sel === u.id ? null : u.id); }}>
              <circle cx={x} cy={y} r={11} fill={sel === u.id ? '#6a5cff' : '#fff'} stroke={sel === u.id ? '#fff' : '#8a93a6'} strokeWidth={2} />
              <text x={x} y={y + 5} textAnchor="middle" fontSize={13}>{u.icon}</text>
            </g>); })}
          {sel && <text x={400} y={620} textAnchor="middle" fontSize={13} fontWeight={800} fill="#6a5cff">已选 {UNITS.find(u => u.id === sel)?.name}：点地图上的村 / 厂区 / 指挥中心派过去</text>}
        </svg>
      </div>
      {/* 调度板 */}
      <div style={{ borderLeft: '1px solid rgba(23,26,46,.08)', background: '#fff', display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(23,26,46,.08)' }}>
          <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginBottom: 6 }}>力量 · 点卡片选中，再点去向</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {UNITS.map(u => { const task = assign(u.id); return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 10, border: sel === u.id ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.1)', background: task ? '#f3f4fa' : '#fff' }}>
                <span style={{ fontSize: 16 }}>{u.icon}</span><span style={{ fontSize: 12.5, fontWeight: 700, width: 92 }}>{u.name}</span>
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>{TASKS.map((tk, i) => <button key={tk} disabled={!canAct || (i === 3 && !collapsed)} onClick={() => dispatch(u.id, i)} style={{ ...btn(task === i, i === 3 ? '#d6336c' : '#6a5cff'), padding: '4px 7px', fontSize: 11, opacity: i === 3 && !collapsed ? .4 : 1 }}>{tk.replace('转移', '').replace('搜救', '')}</button>)}</div>
              </div>); })}
          </div>
        </div>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(23,26,46,.08)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button disabled={!canAct} onClick={() => send('report', 1)} style={btn(reports === 0, '#ff8a5f')}>{reports ? `续报（已报 ${reports}）` : '首报上级'}</button>
          <button disabled={!canAct || orderQs} onClick={() => send('order_qs', 1)} style={btn(!orderQs)}>{orderQs ? '✓ 青石村已下令转移' : '下令：青石村转移'}</button>
          <button disabled={!canAct || orderLw} onClick={() => send('order_lw', 1)} style={btn(!orderLw && verified)}>{orderLw ? '✓ 柳湾村已下令转移' : '下令：柳湾村转移'}</button>
          <button disabled={!canAct || verified} onClick={() => send('verify', 1)} style={btn(!verified, '#12b5cb')}>{verified ? '✓ 柳湾道路已核实' : '☎ 核实柳湾村道路'}</button>
          <button disabled={!canAct || site2} onClick={() => send('open_site2', 1)} style={btn(!site2 && (v.site_full || 0) >= 1, '#e0a800')}>{site2 ? '✓ 第二安置点已开' : '启用第二安置点'}</button>
          <button disabled={!canAct} onClick={() => setLogOpen(o => !o)} style={btn(logOpen, '#171a2e')}>📝 记决策（{logs}）</button>
          {logOpen && <div style={{ width: '100%', display: 'flex', gap: 6 }}>
            <input value={logText} onChange={e => setLogText(e.target.value)} placeholder="为什么这么调：取舍依据、风险、补偿措施" style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(23,26,46,.14)', fontSize: 12.5 }} />
            <button disabled={!canAct || logText.trim().length < 6} onClick={() => { send('log', 1); setFeed(f => [{ t, text: `决策记录：${logText.trim()}`, kind: 'info' }, ...f]); setLogText(''); setLogOpen(false); }} style={btn(logText.trim().length >= 6)}>记下</button>
          </div>}
        </div>
        <div style={{ overflow: 'auto', padding: '8px 14px' }}>
          <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginBottom: 6 }}>事件流</div>
          {feed.map((f, i) => <div key={i} style={{ padding: '6px 10px', marginBottom: 6, borderRadius: 8, fontSize: 12.5, lineHeight: 1.5, background: f.kind === 'alarm' ? '#ffe3ea' : f.kind === 'ok' ? '#e3f7ec' : '#f3f4fa', color: f.kind === 'alarm' ? '#a61e4d' : '#171a2e' }}><span style={{ color: '#6b7089', marginRight: 6 }}>{String(Math.floor((540 + f.t) / 60)).padStart(2, '0')}:{String(Math.floor((540 + f.t) % 60)).padStart(2, '0')}</span>{f.text}</div>)}
        </div>
      </div>
    </div>
  );
}
