'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { applyControl, benchEnv, evalExpr, finishBench, fmtT, initBench, tickBench, type BenchSpec, type BenchState, type BenchTrace, type BenchEvent } from '@/lib/bench';

/**
 * 虚拟工位：数字模拟的设备面板。
 *   - 面板是一张 SVG（仪表 + 指示灯 + 功率环），下面是真正可操作的控件
 *   - 每 250ms 推进一次模拟；每一次拨动、越线、达标都进事件流
 *   - 「俯拍镜头」= 每 5 秒和每次操作把这张 SVG 渲染成 320 像素的快照，同样进事件流（最多 16 张）
 */
const TICK_MS = 250, SNAP_EVERY_MS = 5000, SNAP_MAX = 16, SNAP_W = 320, SNAP_H = 180;

export function BenchRunner({ spec, role, onFinish, onCancel }: { spec: BenchSpec; role: 'rookie' | 'expert'; onFinish: (trace: BenchTrace) => void; onCancel: () => void }) {
  const stRef = useRef<BenchState>(initBench(spec));
  const svgRef = useRef<SVGSVGElement>(null);
  const [, bump] = useState(0);
  const [running, setRunning] = useState(true);
  const snapCount = useRef(0);
  const lastSnap = useRef(0);
  const snapping = useRef(false);
  const st = stRef.current;
  const env = benchEnv(spec, st);

  /** 把 SVG 面板渲染成一张小 JPEG，作为「镜头」事件写进事件流 */
  const snapshot = useCallback(async (force = false) => {
    const svg = svgRef.current;
    if (!svg || snapping.current || (snapCount.current >= SNAP_MAX && !force)) return;
    if (!force && Date.now() - lastSnap.current < 1500) return;
    snapping.current = true; lastSnap.current = Date.now();
    try {
      const xml = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('svg')); img.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = SNAP_W; canvas.height = SNAP_H;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#0f1224'; ctx.fillRect(0, 0, SNAP_W, SNAP_H); ctx.drawImage(img, 0, 0, SNAP_W, SNAP_H);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL('image/jpeg', 0.5);
      if (data.length < 60_000) {
        // 超过上限时替换掉最早的一张（保留首尾）
        const s = stRef.current;
        if (snapCount.current >= SNAP_MAX) { const idx = s.events.findIndex((e, i) => e.kind === 'snapshot' && i > 0); if (idx > 0) s.events.splice(idx, 1); snapCount.current--; }
        s.events.push({ t: s.t, kind: 'snapshot', image: data, state: { ...s.vars } });
        snapCount.current++;
      }
    } catch { /* 快照失败不影响操作 */ }
    finally { snapping.current = false; }
  }, []);

  // 模拟时钟
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const s = stRef.current;
      const before = s.events.length;
      tickBench(spec, s, spec.timeScale * (TICK_MS / 1000));
      if (s.events.length > before) snapshot();                       // 有新事件（越线 / 达标）就拍一张
      else if (Date.now() - lastSnap.current > SNAP_EVERY_MS) snapshot();
      if (s.t >= spec.maxSeconds) { setRunning(false); }
      bump(v => v + 1);
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [running, spec, snapshot]);

  const act = (id: string, value: number) => {
    if (!running) return;
    applyControl(spec, stRef.current, id, value);
    snapshot();
    bump(v => v + 1);
  };

  const finish = async () => {
    setRunning(false);
    await snapshot(true);
    onFinish(finishBench(spec, stRef.current, true));
  };

  const gauge = (expr: string) => { try { return evalExpr(expr, env); } catch { return 0; } };
  const goalsDone = spec.goals.filter(g => st.goalDone[g.id] !== null).length;
  const violations = st.events.filter(e => e.kind === 'rule' && e.severity === 'violation').length;
  const recent = [...st.events].filter(e => e.kind !== 'snapshot').slice(-7).reverse();
  const canFinish = st.t > 30;

  // ── SVG 面板 ──
  const W = 640, H = 360;
  const dial = (g: BenchSpec['gauges'][number], cx: number, cy: number, r: number) => {
    const v = gauge(g.expr); const p = Math.min(1, Math.max(0, (v - g.min) / (g.max - g.min || 1)));
    const warn = g.warn ? !!gauge(g.warn) : false;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, a = a0 + (a1 - a0) * p;
    const pt = (ang: number, rr: number) => [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr];
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r), [xa, ya] = pt(a, r);
    const big = a - a0 > Math.PI ? 1 : 0;
    return (
      <g key={g.id}>
        <path d={`M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1}`} fill="none" stroke="#2a2f4d" strokeWidth={10} strokeLinecap="round" />
        <path d={`M ${x0} ${y0} A ${r} ${r} 0 ${big} 1 ${xa} ${ya}`} fill="none" stroke={warn ? '#ff5fa2' : '#6a5cff'} strokeWidth={10} strokeLinecap="round" />
        <text x={cx} y={cy + 6} textAnchor="middle" fill={warn ? '#ff5fa2' : '#fff'} fontSize={22} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{v.toFixed(g.digits ?? 0)}</text>
        <text x={cx} y={cy + 24} textAnchor="middle" fill="#9aa0b8" fontSize={10}>{g.unit}</text>
        <text x={cx} y={cy + r + 22} textAnchor="middle" fill="#c7cbe6" fontSize={12} fontWeight={700}>{g.label}</text>
      </g>
    );
  };

  return (
    <div className="lab-in">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 16, alignItems: 'start' }}>
        {/* 面板 */}
        <div>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ borderRadius: 16, background: '#0f1224', display: 'block' }} xmlns="http://www.w3.org/2000/svg">
            <rect x={0} y={0} width={W} height={H} fill="#0f1224" />
            <text x={18} y={26} fill="#9aa0b8" fontSize={12} fontFamily="ui-monospace, Menlo, monospace">{spec.name.toUpperCase()} · T+{fmtT(st.t)} · {role === 'expert' ? 'EXPERT' : 'TRAINEE'}</text>
            <circle cx={W - 24} cy={20} r={5} fill={running ? '#ff3b5c' : '#555'} /><text x={W - 34} y={24} textAnchor="end" fill="#ff8aa0" fontSize={10} fontFamily="ui-monospace, Menlo, monospace">{running ? 'REC' : 'STOP'}</text>
            {spec.gauges.slice(0, 4).map((g, i) => dial(g, 90 + i * 150, 120, 50))}
            {/* 指示灯 + 控件状态 */}
            {spec.controls.map((c, i) => {
              const v = st.controls[c.id]; const x = 30 + i * 100;
              const on = c.kind === 'knob' ? v > 0 : v === 1;
              return (
                <g key={c.id}>
                  <rect x={x} y={250} width={84} height={64} rx={10} fill="#171b33" stroke={on ? '#6a5cff' : '#2a2f4d'} />
                  <circle cx={x + 14} cy={266} r={5} fill={on ? (c.id === 'door' ? '#ffb15f' : '#12b5cb') : '#3a3f5e'} />
                  <text x={x + 24} y={270} fill="#c7cbe6" fontSize={10} fontWeight={700}>{c.label}</text>
                  <text x={x + 42} y={300} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{c.kind === 'knob' ? `${v}${c.unit || ''}` : c.kind === 'button' ? (st.vars.poured ? '已按' : '—') : v ? 'ON' : 'OFF'}</text>
                </g>
              );
            })}
            <text x={18} y={H - 12} fill="#6b7089" fontSize={10} fontFamily="ui-monospace, Menlo, monospace">GOALS {goalsDone}/{spec.goals.length} · VIOLATIONS {violations} · EVENTS {st.events.length} · SNAPSHOTS {snapCount.current}</text>
          </svg>

          {/* 控件 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
            {spec.controls.map(c => {
              const v = st.controls[c.id];
              return (
                <div key={c.id} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'rgba(255,255,255,.7)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</span>
                    {c.kind === 'knob' && <span className="lab-mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--v)', letterSpacing: 0 }}>{v}{c.unit}</span>}
                  </div>
                  {c.kind === 'knob' && <input type="range" min={c.min ?? 0} max={c.max ?? 100} step={c.step ?? 1} value={v} disabled={!running} onChange={e => act(c.id, Number(e.target.value))} style={{ width: '100%', accentColor: '#6a5cff' }} />}
                  {c.kind === 'switch' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[0, 1].map(x => <button key={x} disabled={!running} onClick={() => act(c.id, x)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid var(--line)', cursor: running ? 'pointer' : 'default', fontWeight: 700, fontSize: 12, background: v === x ? (x ? 'var(--v)' : '#3a3f5e') : 'transparent', color: v === x ? '#fff' : 'var(--ink2)' }}>{x ? '开' : '关'}</button>)}
                    </div>
                  )}
                  {c.kind === 'button' && <button disabled={!running || !!st.vars.poured} onClick={() => act(c.id, 1)} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', cursor: running ? 'pointer' : 'default', fontWeight: 800, fontSize: 13, background: st.vars.poured ? '#9aa0b8' : 'linear-gradient(135deg,#ff5fa2,#ff8a5f)', color: '#fff' }}>{st.vars.poured ? '已执行' : c.label}</button>}
                  {c.hint && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 5 }}>{c.hint}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 目标 + 事件流 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 14, background: 'rgba(23,26,46,.04)', border: '1px solid var(--line)' }}>
            <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>目标 {goalsDone}/{spec.goals.length}</div>
            {spec.goals.map(g => {
              const done = st.goalDone[g.id] !== null; const hold = g.hold ? Math.min(1, st.goalHold[g.id] / g.hold) : 0;
              return (
                <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5, marginBottom: 6, color: done ? '#12a150' : 'var(--ink2)' }}>
                  <span style={{ width: 16, height: 16, borderRadius: 8, flexShrink: 0, marginTop: 2, background: done ? '#12a150' : 'transparent', border: done ? 'none' : '1.5px solid rgba(106,92,255,.4)', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : ''}</span>
                  <span style={{ flex: 1 }}>{g.label}{!done && g.hold && hold > 0 ? <span className="lab-mono" style={{ color: 'var(--v)', marginLeft: 6 }}>{Math.round(hold * 100)}%</span> : null}{done ? <span className="lab-mono" style={{ marginLeft: 6, color: 'var(--ink3)' }}>{fmtT(st.goalDone[g.id]!)}</span> : null}</span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: 14, borderRadius: 14, background: '#0f1224', color: '#c7cbe6', minHeight: 150 }}>
            <div className="lab-mono" style={{ fontSize: 11, color: '#6b7089', marginBottom: 6 }}>EVENT STREAM</div>
            {recent.length === 0 && <div style={{ fontSize: 12, color: '#6b7089' }}>还没有操作。</div>}
            {recent.map((e, i) => <EventLine key={i} spec={spec} e={e} />)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="lab-btn" disabled={!canFinish} onClick={finish} style={{ flex: 1 }}>{running ? '完成操作 →' : '提交这段操作 →'}</button>
            <button className="lab-btn ghost" onClick={onCancel}>退出</button>
          </div>
          {!canFinish && <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>至少操作 30 秒（模拟时间）后可提交。1 秒真实时间 = {spec.timeScale} 秒模拟时间。</div>}
        </div>
      </div>
    </div>
  );
}

function EventLine({ spec, e }: { spec: BenchSpec; e: BenchEvent }) {
  const c = spec.controls.find(x => x.id === e.control);
  const text = e.kind === 'control' ? (c ? (c.kind === 'switch' ? `${c.label} ${e.value ? '开' : '关'}` : c.kind === 'button' ? `按下「${c.label}」` : `${c.label} → ${e.value}${c.unit || ''}`) : e.control)
    : e.kind === 'rule' ? `${e.severity === 'violation' ? '⛔' : '⚠'} ${e.label}` : e.kind === 'goal' ? `✅ ${e.label}` : e.kind === 'finish' ? '结束' : e.text;
  const color = e.kind === 'rule' ? (e.severity === 'violation' ? '#ff5fa2' : '#ffb15f') : e.kind === 'goal' ? '#3ddc97' : '#c7cbe6';
  return <div className="lab-mono" style={{ fontSize: 11.5, lineHeight: 1.7, color, letterSpacing: 0 }}><span style={{ color: '#6b7089' }}>{fmtT(e.t)}</span> {text}</div>;
}

/** 快照胶片条：数字工位的「俯拍镜头」回放 */
export function SnapshotStrip({ trace }: { trace: BenchTrace }) {
  const snaps = (trace.events || []).filter(e => e.kind === 'snapshot' && e.image);
  if (!snaps.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 0' }}>
      {snaps.map((s, i) => (
        <div key={i} style={{ flexShrink: 0, width: 160 }}>
          <img src={s.image} alt={`T+${fmtT(s.t)}`} style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--line)' }} />
          <div className="lab-mono" style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2, textAlign: 'center' }}>T+{fmtT(s.t)}</div>
        </div>
      ))}
    </div>
  );
}
