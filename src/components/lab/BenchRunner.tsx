'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { applyControl, benchEnv, evalExpr, finishBench, fmtT, initBench, tickBench, type BenchSpec, type BenchState, type BenchTrace, type BenchEvent, type BenchLayer } from '@/lib/bench';

/**
 * 虚拟工位：数字模拟的设备。
 *   - 左半边是「场景」：一张生成的车间底图 + 随状态变化的覆盖层（炉膛辉光、炉门、金属液流、指示灯、读数）——像在操作一台真的机器
 *   - 右半边是「数字面板」：仪表 + 目标 + 事件流；控件在场景下方
 *   - 每 250ms 推进一次模拟；每一次拨动、越线、达标都进事件流
 *   - 「镜头」= 每 5 秒和每次操作把场景渲染成 320 像素的快照，同样进事件流（最多 16 张）。没有场景时拍面板。
 */
const TICK_MS = 250, SNAP_EVERY_MS = 5000, SNAP_MAX = 16, SNAP_W = 320, SNAP_H = 180;
const VW = 1600, VH = 900; // 场景覆盖层坐标系（百分比 × 16 / × 9）

export function BenchRunner({ spec, role, onFinish, onCancel, hud }: { spec: BenchSpec; role: 'rookie' | 'expert'; onFinish: (trace: BenchTrace) => void; onCancel: () => void; /** 沉浸模式：场景撑满，面板 / 控件 / 目标 / 事件流叠成 HUD */ hud?: boolean }) {
  const stRef = useRef<BenchState>(initBench(spec));
  const panelRef = useRef<SVGSVGElement>(null);
  const sceneRef = useRef<SVGSVGElement>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const [, bump] = useState(0);
  const [running, setRunning] = useState(true);
  const snapCount = useRef(0);
  const lastSnap = useRef(0);
  const snapping = useRef(false);
  const st = stRef.current;
  const env = benchEnv(spec, st);
  const scene = spec.scene;

  // 预载底图（同源，画进 canvas 不会污染）
  useEffect(() => {
    if (!scene?.image) return;
    const img = new Image(); img.src = scene.image; img.onload = () => { bgRef.current = img; };
  }, [scene?.image]);

  /** 把场景（或面板）渲染成一张小 JPEG，作为「镜头」事件写进事件流 */
  const snapshot = useCallback(async (force = false) => {
    const svg = scene ? sceneRef.current : panelRef.current;
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
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#0f1224'; ctx.fillRect(0, 0, SNAP_W, SNAP_H);
      if (scene && bgRef.current) ctx.drawImage(bgRef.current, 0, 0, SNAP_W, SNAP_H);
      ctx.drawImage(img, 0, 0, SNAP_W, SNAP_H);
      URL.revokeObjectURL(url);
      // 镜头水印
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, SNAP_H - 16, SNAP_W, 16);
      ctx.fillStyle = '#fff'; ctx.font = '10px ui-monospace, Menlo, monospace'; ctx.fillText(`CAM 01  T+${fmtT(stRef.current.t)}`, 6, SNAP_H - 5);
      const data = canvas.toDataURL('image/jpeg', 0.55);
      if (data.length < 60_000) {
        const s = stRef.current;
        if (snapCount.current >= SNAP_MAX) { const idx = s.events.findIndex((e, i) => e.kind === 'snapshot' && i > 0); if (idx > 0) s.events.splice(idx, 1); snapCount.current--; }
        s.events.push({ t: s.t, kind: 'snapshot', image: data, state: { ...s.vars } });
        snapCount.current++;
      }
    } catch { /* 快照失败不影响操作 */ }
    finally { snapping.current = false; }
  }, [scene]);

  // 模拟时钟
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const s = stRef.current;
      const before = s.events.length;
      tickBench(spec, s, spec.timeScale * (TICK_MS / 1000));
      if (s.events.length > before) snapshot();
      else if (Date.now() - lastSnap.current > SNAP_EVERY_MS) snapshot();
      if (s.t >= spec.maxSeconds) setRunning(false);
      bump(v => v + 1);
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [running, spec, snapshot]);

  const act = (id: string, value: number) => {
    if (!running) return;
    applyControl(spec, stRef.current, id, value);
    if (spec.controls.find(c => c.id === id)?.kind !== 'path') snapshot();
    bump(v => v + 1);
  };

  // ── 在场景里拖动 path 控件（焊枪沿焊缝）：指针位置投影到轨迹线段上 → 0–100 ──
  const dragRef = useRef<BenchLayer | null>(null);
  const seamProgress = (l: BenchLayer, clientX: number, clientY: number) => {
    const svg = sceneRef.current; if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left) / r.width * VW, py = (clientY - r.top) / r.height * VH;
    const ax = l.x * 16, ay = l.y * 9, bx = (l.x + l.w) * 16, by = (l.y + l.h) * 9;
    const dx = bx - ax, dy = by - ay; const len2 = dx * dx + dy * dy || 1;
    return Math.min(100, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2 * 100));
  };
  const onScenePointerMove = (e: React.PointerEvent) => { const l = dragRef.current; if (!l?.control) return; const v = seamProgress(l, e.clientX, e.clientY); if (v !== null) act(l.control, v); };
  const onScenePointerUp = () => { dragRef.current = null; };

  const finish = async () => {
    setRunning(false);
    await snapshot(true);
    onFinish(finishBench(spec, stRef.current, true));
  };

  const ev = (expr?: string) => { if (!expr) return 0; try { return evalExpr(expr, env); } catch { return 0; } };
  const goalsDone = spec.goals.filter(g => st.goalDone[g.id] !== null).length;
  const violations = st.events.filter(e => e.kind === 'rule' && e.severity === 'violation').length;
  const recent = [...st.events].filter(e => e.kind !== 'snapshot').slice(-8).reverse();
  const canFinish = st.t > 30;
  const pressed = (c: BenchSpec['controls'][number]) => c.kind === 'button' && st.events.some(e => e.kind === 'control' && e.control === c.id);

  // ── 数字面板（SVG） ──
  const PW = 640, PH = scene ? 200 : 360;
  const dial = (g: BenchSpec['gauges'][number], cx: number, cy: number, r: number) => {
    const v = ev(g.expr); const p = Math.min(1, Math.max(0, (v - g.min) / (g.max - g.min || 1)));
    const warn = g.warn ? !!ev(g.warn) : false;
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
  const panel = (
    <svg ref={panelRef} viewBox={`0 0 ${PW} ${PH}`} width="100%" style={{ borderRadius: 16, background: '#0f1224', display: 'block' }} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={PW} height={PH} fill="#0f1224" />
      <text x={18} y={24} fill="#9aa0b8" fontSize={12} fontFamily="ui-monospace, Menlo, monospace">{spec.name.toUpperCase()} · T+{fmtT(st.t)} · {role === 'expert' ? 'EXPERT' : 'TRAINEE'}</text>
      <circle cx={PW - 24} cy={19} r={5} fill={running ? '#ff3b5c' : '#555'} /><text x={PW - 34} y={23} textAnchor="end" fill="#ff8aa0" fontSize={10} fontFamily="ui-monospace, Menlo, monospace">{running ? 'REC' : 'STOP'}</text>
      {spec.gauges.slice(0, 4).map((g, i) => dial(g, 90 + i * 150, 105, 48))}
      {!scene && spec.controls.map((c, i) => {
        const v = st.controls[c.id]; const x = 30 + i * 100;
        const on = c.kind === 'knob' ? v > 0 : v === 1;
        return (
          <g key={c.id}>
            <rect x={x} y={250} width={84} height={64} rx={10} fill="#171b33" stroke={on ? '#6a5cff' : '#2a2f4d'} />
            <circle cx={x + 14} cy={266} r={5} fill={on ? '#12b5cb' : '#3a3f5e'} />
            <text x={x + 24} y={270} fill="#c7cbe6" fontSize={10} fontWeight={700}>{c.label}</text>
            <text x={x + 42} y={300} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{c.kind === 'knob' ? `${v}${c.unit || ''}` : c.kind === 'button' ? (pressed(c) ? '已按' : '—') : v ? 'ON' : 'OFF'}</text>
          </g>
        );
      })}
      {!scene && <text x={18} y={PH - 12} fill="#6b7089" fontSize={10} fontFamily="ui-monospace, Menlo, monospace">GOALS {goalsDone}/{spec.goals.length} · VIOLATIONS {violations} · EVENTS {st.events.length} · SNAPSHOTS {snapCount.current}</text>}
    </svg>
  );

  // ── 控件 ──
  const controls = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
      {spec.controls.map(c => {
        const v = st.controls[c.id]; const done = pressed(c);
        return (
          <div key={c.id} className={hud ? 'hud-card' : undefined} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'rgba(255,255,255,.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="hud-ink" style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</span>
              {c.kind === 'knob' && <span className="lab-mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--v)', letterSpacing: 0 }}>{v}{c.unit}</span>}
            </div>
            {c.kind === 'knob' && <input type="range" min={c.min ?? 0} max={c.max ?? 100} step={c.step ?? 1} value={v} disabled={!running} onChange={e => act(c.id, Number(e.target.value))} style={{ width: '100%', accentColor: '#6a5cff' }} />}
            {c.kind === 'switch' && (
              <div style={{ display: 'flex', gap: 6 }}>
                {[0, 1].map(x => <button key={x} disabled={!running} onClick={() => act(c.id, x)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid var(--line)', cursor: running ? 'pointer' : 'default', fontWeight: 700, fontSize: 12, background: v === x ? (x ? 'var(--v)' : '#3a3f5e') : 'transparent', color: v === x ? '#fff' : hud ? '#c7cbe6' : 'var(--ink2)' }}>{x ? '开' : '关'}</button>)}
              </div>
            )}
            {c.kind === 'path' && (
              <div>
                <div style={{ height: 8, borderRadius: 4, background: 'rgba(106,92,255,.15)', overflow: 'hidden', marginBottom: 6 }}><div style={{ width: `${v}%`, height: '100%', background: 'linear-gradient(90deg,#ffb15f,#ff5fa2)', transition: 'width .1s' }} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="lab-mono hud-ink3" style={{ fontSize: 11, color: 'var(--ink3)', letterSpacing: 0 }}>{Math.round(v)}%</span>
                  <input type="range" min={0} max={100} step={0.5} value={v} disabled={!running} onChange={e => act(c.id, Number(e.target.value))} style={{ flex: 1, accentColor: '#ff5fa2' }} title="也可以直接在场景里拖" />
                </div>
              </div>
            )}
            {c.kind === 'button' && <button disabled={!running || done} onClick={() => act(c.id, 1)} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', cursor: running && !done ? 'pointer' : 'default', fontWeight: 800, fontSize: 13, background: done ? '#9aa0b8' : 'linear-gradient(135deg,#ff5fa2,#ff8a5f)', color: '#fff' }}>{done ? '已执行' : c.label}</button>}
            {c.hint && <div className="hud-ink3" style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 5 }}>{c.hint}</div>}
          </div>
        );
      })}
    </div>
  );

  // ── 目标 + 事件流 + 按钮 ──
  const side = (
    <>
      <div className={hud ? 'hud-card' : undefined} style={{ padding: 14, borderRadius: 14, background: 'rgba(23,26,46,.04)', border: '1px solid var(--line)' }}>
        <div className="lab-mono lab-cap" style={{ marginBottom: 8 }}>目标 {goalsDone}/{spec.goals.length}</div>
        {spec.goals.map(g => {
          const done = st.goalDone[g.id] !== null; const hold = g.hold ? Math.min(1, st.goalHold[g.id] / g.hold) : 0;
          return (
            <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5, marginBottom: 6, color: done ? (hud ? '#3ddc97' : '#12a150') : hud ? '#c7cbe6' : 'var(--ink2)' }}>
              <span style={{ width: 16, height: 16, borderRadius: 8, flexShrink: 0, marginTop: 2, background: done ? '#12a150' : 'transparent', border: done ? 'none' : '1.5px solid rgba(106,92,255,.4)', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : ''}</span>
              <span style={{ flex: 1 }}>{g.label}{!done && g.hold && hold > 0 ? <span className="lab-mono" style={{ color: 'var(--v)', marginLeft: 6 }}>{Math.round(hold * 100)}%</span> : null}{done ? <span className="lab-mono" style={{ marginLeft: 6, color: 'var(--ink3)' }}>{fmtT(st.goalDone[g.id]!)}</span> : null}</span>
            </div>
          );
        })}
      </div>
      <div style={{ padding: 14, borderRadius: 14, background: '#0f1224', color: '#c7cbe6', minHeight: 140 }}>
        <div className="lab-mono" style={{ fontSize: 11, color: '#6b7089', marginBottom: 6 }}>EVENT STREAM · {st.events.length} · CAM {snapCount.current}</div>
        {recent.length === 0 && <div style={{ fontSize: 12, color: '#6b7089' }}>还没有操作。</div>}
        {recent.map((e, i) => <EventLine key={i} spec={spec} e={e} />)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="lab-btn" disabled={!canFinish} onClick={finish} style={{ flex: 1 }}>{running ? '完成操作 →' : '提交这段操作 →'}</button>
        <button className="lab-btn ghost" onClick={() => { if (window.confirm('退出后这次操作不会保存，确定退出？')) onCancel(); }}>退出</button>
      </div>
      {!canFinish && <div style={{ fontSize: 11.5, color: hud ? 'rgba(255,255,255,.7)' : 'var(--ink3)' }}>至少操作 30 秒（模拟时间）后可提交。1 秒真实时间 = {spec.timeScale} 秒模拟时间。</div>}
    </>
  );

  // ── 场景视图（底图 + 覆盖层 + 镜头角标） ──
  const sceneView = scene ? (
    <div style={{ position: 'relative', borderRadius: hud ? 0 : 16, overflow: 'hidden', background: '#0f1224', aspectRatio: '16 / 9' }}>
      <img src={scene.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <svg ref={sceneRef} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} xmlns="http://www.w3.org/2000/svg" onPointerMove={onScenePointerMove} onPointerUp={onScenePointerUp} onPointerLeave={onScenePointerUp}>
        <defs>
          <filter id="bench-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18" /></filter>
          <filter id="bench-blur-sm" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        {scene.layers.map(l => <Layer key={l.id} l={l} level={l.level ? Math.min(1, Math.max(0, ev(l.level))) : 0} on={l.on ? !!ev(l.on) : false} value={l.text ? ev(l.text) : 0} progress={l.kind === 'seam' && l.control ? st.controls[l.control] || 0 : 0} onGrab={l.kind === 'seam' && running ? (e => { dragRef.current = l; (e.target as Element).setPointerCapture?.(e.pointerId); const v = l.control ? seamProgress(l, e.clientX, e.clientY) : null; if (v !== null && l.control) act(l.control, v); }) : undefined} />)}
      </svg>
      <div className="lab-mono" style={{ position: 'absolute', left: 12, top: hud ? 34 : 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.6)', letterSpacing: '.06em' }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: running ? '#ff3b5c' : '#777', boxShadow: running ? '0 0 8px #ff3b5c' : 'none' }} />CAM 01 · 数字工位 · T+{fmtT(st.t)}
      </div>
      {!hud && <div className="lab-mono" style={{ position: 'absolute', right: 12, top: 10, fontSize: 11, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>{role === 'expert' ? 'EXPERT' : 'TRAINEE'} · {goalsDone}/{spec.goals.length} · ⛔{violations}</div>}
    </div>
  ) : null;

  if (hud && scene) {
    return (
      <div className="bench-hud">
        <img className="bench-hud-blur" src={scene.image} alt="" />
        <div className="bench-hud-stage">{sceneView}</div>
        <div className="bench-hud-right">{panel}{side}</div>
        <div className="bench-hud-bottom">{controls}</div>
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="lab-in">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 16, alignItems: 'start' }}>
          <div>{panel}<div style={{ marginTop: 12 }}>{controls}</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{side}</div>
        </div>
      </div>
    );
  }

  // ── 场景（左）+ 数字面板（右） ──
  return (
    <div className="lab-in bench-split">
      <div>
        {sceneView}
        <div style={{ marginTop: 12 }}>{controls}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {panel}
        {side}
      </div>
    </div>
  );
}

/** 场景覆盖层 */
function Layer({ l, level, on, value, progress = 0, onGrab }: { l: BenchLayer; level: number; on: boolean; value: number; progress?: number; onGrab?: (e: React.PointerEvent) => void }) {
  const x = l.x * 16, y = l.y * 9, w = l.w * 16, h = l.h * 9;
  const cx = x + w / 2, cy = y + h / 2;
  const heat = (p: number) => p < 0.35 ? `rgba(120,10,0,${Math.min(1, p * 2)})` : p < 0.7 ? '#ff4d00' : p < 0.9 ? '#ffb347' : '#fff3c4';
  switch (l.kind) {
    case 'glow':
      // 底图上的观察窗本来就是亮的：冷的时候盖一层深色（冷坩埚），热起来再按温度发光
      if (level < 0.08) return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill="#23232c" opacity={0.92 - level * 4} />;
      return (
        <g>
          {level > 0.3 && <ellipse cx={cx} cy={cy} rx={w} ry={h} fill={heat(level)} opacity={(level - 0.3) * 0.9} filter="url(#bench-blur)" />}
          <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill={heat(level)} opacity={0.95} />
          <ellipse cx={cx} cy={cy} rx={w / 3.2} ry={h / 3.2} fill={level > 0.6 ? '#fff' : heat(Math.min(1, level + 0.25))} opacity={0.4 + level * 0.6} filter="url(#bench-blur-sm)" />
        </g>
      );
    case 'seam': {
      // 轨迹线段 a → b；已走过的部分画成焊道；手柄（焊枪）在当前进度处；on 时出火花
      const ax = x, ay = y, bx = x + w, by = y + h;
      const px = ax + (bx - ax) * progress / 100, py = ay + (by - ay) * progress / 100;
      const ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
      return (
        <g style={{ cursor: onGrab ? 'grab' : 'default' }} onPointerDown={onGrab}>
          <line x1={ax} y1={ay} x2={bx} y2={by} stroke="rgba(0,0,0,.35)" strokeWidth={10} strokeLinecap="round" />
          <line x1={ax} y1={ay} x2={bx} y2={by} stroke="rgba(255,255,255,.25)" strokeWidth={2} strokeDasharray="10 12" />
          {progress > 0 && <line x1={ax} y1={ay} x2={px} y2={py} stroke="#8a93a6" strokeWidth={16} strokeLinecap="round" />}
          {progress > 0 && <line x1={ax} y1={ay} x2={px} y2={py} stroke="#c9d1e0" strokeWidth={8} strokeLinecap="round" strokeDasharray="6 5" opacity={0.8} />}
          {on && <circle cx={px} cy={py} r={34} fill="#fff3c4" opacity={0.85} filter="url(#bench-blur)" />}
          {on && [0, 1, 2, 3, 4, 5].map(i => <circle key={i} cx={px} cy={py} r={4} fill="#ffd166"><animate attributeName="cx" values={`${px};${px + Math.cos(i * 1.05) * 60}`} dur={`${0.35 + i * 0.07}s`} repeatCount="indefinite" /><animate attributeName="cy" values={`${py};${py - 20 - Math.sin(i * 1.05) * 50}`} dur={`${0.35 + i * 0.07}s`} repeatCount="indefinite" /><animate attributeName="opacity" values="1;0" dur={`${0.35 + i * 0.07}s`} repeatCount="indefinite" /></circle>)}
          {/* 焊枪：一根带喷嘴的斜杆，随轨迹方向旋转 */}
          <g transform={`translate(${px} ${py}) rotate(${ang - 60})`}>
            <rect x={-8} y={-110} width={16} height={100} rx={6} fill="#2b3040" stroke="#6b7089" strokeWidth={2} />
            <rect x={-11} y={-40} width={22} height={34} rx={4} fill="#c9a24a" />
            <polygon points="-6,-6 6,-6 2,6 -2,6" fill="#b87333" />
          </g>
          <circle cx={px} cy={py} r={26} fill="transparent" />
          <text x={px} y={py + 54} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={700} fontFamily="ui-monospace, Menlo, monospace" style={{ textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>{on ? '●' : ''} {Math.round(progress)}%</text>
        </g>
      );
    }
    case 'haze':
      if (level <= 0.02) return null;
      return <rect x={x} y={y} width={w} height={h} fill={l.color || '#dfe6ff'} opacity={level * 0.55} filter="url(#bench-blur)" />;
    case 'lamp':
      return <g><circle cx={cx} cy={cy} r={Math.min(w, h) / 2} fill={on ? (l.color || '#3ddc97') : '#3a3f5e'} stroke="rgba(0,0,0,.35)" strokeWidth={2} />{on && <circle cx={cx} cy={cy} r={Math.min(w, h)} fill={l.color || '#3ddc97'} opacity={0.35} filter="url(#bench-blur-sm)" />}</g>;
    case 'door':
      if (!on) return null; // 关着时底图上本来就是关着的门
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#1a0a05" />
          <ellipse cx={cx} cy={cy + h * 0.15} rx={w * 0.4} ry={h * 0.35} fill={level > 0.05 ? heat(level) : '#2a1a10'} opacity={Math.max(0.2, level)} filter="url(#bench-blur-sm)" />
          <polygon points={`${x + w},${y} ${x + w + w * 0.35},${y + h * 0.12} ${x + w + w * 0.35},${y + h * 0.88} ${x + w},${y + h}`} fill="#8d97ad" stroke="#5b6478" strokeWidth={3} />
        </g>
      );
    case 'stream':
      if (!on) return null;
      return (
        <g>
          <path d={`M ${cx - w * 0.12} ${y} Q ${cx} ${y + h * 0.5} ${cx - w * 0.05} ${y + h} L ${cx + w * 0.05} ${y + h} Q ${cx + w * 0.02} ${y + h * 0.5} ${cx + w * 0.12} ${y} Z`} fill="#fff3c4" />
          <path d={`M ${cx - w * 0.12} ${y} Q ${cx} ${y + h * 0.5} ${cx - w * 0.05} ${y + h} L ${cx + w * 0.05} ${y + h} Q ${cx + w * 0.02} ${y + h * 0.5} ${cx + w * 0.12} ${y} Z`} fill="#ffb347" opacity={0.7} filter="url(#bench-blur-sm)" />
          <ellipse cx={cx} cy={y + h} rx={w * 0.5} ry={h * 0.08} fill="#ffd166" opacity={0.9} filter="url(#bench-blur-sm)"><animate attributeName="rx" values={`${w * 0.4};${w * 0.6};${w * 0.4}`} dur="0.6s" repeatCount="indefinite" /></ellipse>
          {[0, 1, 2, 3].map(i => <circle key={i} cx={cx + (i - 1.5) * w * 0.25} cy={y + h} r={6} fill="#fff3c4"><animate attributeName="cy" values={`${y + h};${y + h - h * 0.25 - i * 10};${y + h}`} dur={`${0.5 + i * 0.15}s`} repeatCount="indefinite" /><animate attributeName="opacity" values="1;0" dur={`${0.5 + i * 0.15}s`} repeatCount="indefinite" /></circle>)}
        </g>
      );
    case 'pulse':
      if (!on) return null;
      return <g>{[0, 1].map(i => <circle key={i} cx={cx} cy={cy} r={Math.min(w, h) / 2} fill="none" stroke={l.color || '#12b5cb'} strokeWidth={4}><animate attributeName="r" values={`${Math.min(w, h) * 0.2};${Math.min(w, h) * 0.6}`} dur="1.2s" begin={`${i * 0.6}s`} repeatCount="indefinite" /><animate attributeName="opacity" values="0.9;0" dur="1.2s" begin={`${i * 0.6}s`} repeatCount="indefinite" /></circle>)}</g>;
    case 'readout':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={8} fill="#0b0e1c" stroke="#2a2f4d" strokeWidth={2} />
          <text x={x + w - 10} y={y + h * 0.68} textAnchor="end" fill={l.color || '#7cf5c9'} fontSize={h * 0.55} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{value.toFixed(l.digits ?? 0)}{l.unit ? <tspan fontSize={h * 0.3} fill="#9aa0b8"> {l.unit}</tspan> : null}</text>
          {l.label && <text x={x + 10} y={y + h * 0.68} fill="#9aa0b8" fontSize={h * 0.3} fontFamily="ui-monospace, Menlo, monospace">{l.label}</text>}
        </g>
      );
    default: return null;
  }
}

function EventLine({ spec, e }: { spec: BenchSpec; e: BenchEvent }) {
  const c = spec.controls.find(x => x.id === e.control);
  const text = e.kind === 'control' ? (c ? (c.kind === 'switch' ? `${c.label} ${e.value ? '开' : '关'}` : c.kind === 'button' ? `按下「${c.label}」` : `${c.label} → ${e.value}${c.unit || ''}`) : e.control)
    : e.kind === 'rule' ? `${e.severity === 'violation' ? '⛔' : '⚠'} ${e.label}` : e.kind === 'goal' ? `✅ ${e.label}` : e.kind === 'finish' ? '结束' : e.text;
  const color = e.kind === 'rule' ? (e.severity === 'violation' ? '#ff5fa2' : '#ffb15f') : e.kind === 'goal' ? '#3ddc97' : '#c7cbe6';
  return <div className="lab-mono" style={{ fontSize: 11.5, lineHeight: 1.7, color, letterSpacing: 0 }}><span style={{ color: '#6b7089' }}>{fmtT(e.t)}</span> {text}</div>;
}

/** 快照胶片条：数字工位的「镜头」回放 */
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
