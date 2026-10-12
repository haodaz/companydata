'use client';

/**
 * 母版 E 第一人称双手（src/lib/masters/hands.ts 的 HandsConfig）：画在 BenchRunner 的场景 svg 里（1600 × 900）。
 * 一块透明手势面接住按下 / 拖动 / 松手，按配置找第一个命中的手势，原语（点 / 按住计时 / 刷覆盖 / 拖物件 / 连拍节奏）把手势量成控件值。
 * 隐藏控件走 setHidden（不进事件流），其余走 act（进事件流、拍快照）——和代码版台面一样。
 * 计时：按住计时、回位、衰减跟着模拟时钟走（st.t 每拍一次）；连拍间隔、拖动速度、摇晃幅度要亚拍精度，仍用 performance.now。
 * 主体插件（SUBJECTS）：只有 baby（新生儿：襁褓、脸、哭、眼睛、托头的左手），参数都从配置的表达式来。
 */
import React, { useEffect, useRef, useState } from 'react';
import { benchEnv, evalExpr } from '@/lib/bench';
import { TEMPLATE_RE, type MasterStageProps, type Num } from '@/lib/lab-masters';
import type { HandsAction, HandsConfig, HandsGesture, HandsOut, HandsShape } from '@/lib/masters/hands';

type Pt = { x: number; y: number };
type Env = Record<string, number>;
const hyp = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const FONT = 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif';

// ── 主体插件 ──
interface SubjectProps { x: number; y: number; t: number; live: boolean; P: (k: string, d?: number) => number; T: (k: string) => string }

/** 新生儿（月嫂哄睡）。params：headDx / headDy 头相对身体中心、rot 整体倾角、cry 0–100、eye 睁眼 0–1、mouth 安静时嘴角弧度、
 *  wiggleFreq / wiggleAmp 哭闹扭动、hand 左手托着头（真假）、hint 头上出「点这里托头」的圈（真假，只在能操作时）；texts.hint 圈上的字 */
function BabySubject({ x, y, t, live, P, T }: SubjectProps) {
  const hx = x + P('headDx'), hy = y + P('headDy'), cry = P('cry'), eye = P('eye', 1);
  const wiggle = Math.sin(t * P('wiggleFreq', 9)) * (cry / 100) * P('wiggleAmp', 9);
  const rot = P('rot');
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) translate(${-x} ${-y})`} pointerEvents="none">
      {/* 襁褓 */}
      <ellipse cx={x + 40} cy={y + 10 + wiggle * 0.3} rx={210} ry={95} fill="#f4e6d2" stroke="#d9c3a3" strokeWidth={4} />
      <path d={`M ${x - 120} ${y - 50} Q ${x + 60} ${y - 120} ${x + 230} ${y - 20}`} fill="none" stroke="#e8d5bb" strokeWidth={10} strokeLinecap="round" />
      {/* 头 */}
      <circle cx={hx} cy={hy + wiggle * 0.4} r={78} fill="#f7d7c0" stroke="#d9a98c" strokeWidth={3} />
      <path d={`M ${hx - 60} ${hy - 40} Q ${hx} ${hy - 95} ${hx + 62} ${hy - 36}`} fill="#8a5a3c" />
      {/* 脸颊：哭得越厉害越红 */}
      <circle cx={hx - 36} cy={hy + 22} r={16} fill="#ff8a8a" opacity={0.15 + cry / 100 * 0.6} />
      <circle cx={hx + 42} cy={hy + 22} r={16} fill="#ff8a8a" opacity={0.15 + cry / 100 * 0.6} />
      {/* 眼睛：张开 → 半闭 → 闭上 */}
      {[-26, 30].map(dx => eye > 0.05
        ? <ellipse key={dx} cx={hx + dx} cy={hy - 4} rx={9} ry={9 * eye} fill="#2b2420" />
        : <path key={dx} d={`M ${hx + dx - 10} ${hy - 2} q 10 8 20 0`} stroke="#2b2420" strokeWidth={3} fill="none" strokeLinecap="round" />)}
      {cry > 45 && [-34, 40].map(dx => <path key={dx} d={`M ${hx + dx} ${hy + 6} q ${dx < 0 ? -6 : 6} 14 0 26`} stroke="#8fd3ff" strokeWidth={3} fill="none" strokeLinecap="round" />)}
      {/* 嘴：哭是大张的椭圆，安静是小弧 */}
      {cry > 45 ? <ellipse cx={hx + 4} cy={hy + 34} rx={14 + cry / 10} ry={10 + cry / 9} fill="#8c3b3b" />
        : <path d={`M ${hx - 10} ${hy + 34} q 14 ${P('mouth', 8)} 28 0`} stroke="#b3665f" strokeWidth={3} fill="none" strokeLinecap="round" />}
      {/* 托头的左手 */}
      {!!P('hand') && <g transform={`translate(${hx - 20} ${hy + 92}) rotate(-14)`}>
        <rect x={-120} y={-30} width={200} height={60} rx={30} fill="#efbf9c" stroke="#b9805e" strokeWidth={3} />
        {[-70, -30, 10, 50].map(fx => <rect key={fx} x={fx} y={-52} width={30} height={52} rx={14} fill="#f3c8a8" stroke="#b9805e" strokeWidth={2.5} />)}
      </g>}
      {!!P('hint') && live && <g>
        <circle cx={hx} cy={hy} r={86} fill="none" stroke="#ffd166" strokeWidth={4} strokeDasharray="10 8"><animate attributeName="r" values="80;96;80" dur="1.1s" repeatCount="indefinite" /></circle>
        <text x={hx} y={hy - 108} textAnchor="middle" fill="#ffd166" fontSize={20} fontWeight={800} style={{ textShadow: '0 1px 5px rgba(0,0,0,.9)' }}>{T('hint')}</text>
      </g>}
    </g>
  );
}
const SUBJECTS: Record<string, (p: SubjectProps) => React.ReactElement> = { baby: BabySubject };

/** 跟手的右手（第一人称） */
const Hand = ({ x, y }: Pt) => (
  <g transform={`translate(${x} ${y}) rotate(-100)`} pointerEvents="none" opacity={0.95}>
    <rect x={-150} y={-38} width={92} height={78} rx={34} fill="#efbf9c" stroke="#b9805e" strokeWidth={3} />
    <rect x={-84} y={-30} width={130} height={26} rx={13} fill="#f6cfb2" stroke="#b9805e" strokeWidth={3} />
    <rect x={-88} y={2} width={122} height={26} rx={13} fill="#f3c8a8" stroke="#b9805e" strokeWidth={3} />
  </g>
);

interface Active { g: HandsGesture; p0: Pt; off0: Pt; track: { t: number; p: Pt }[]; amp: number[] }

export function HandsStage({ spec, cfg, st, running, auto, act, setHidden, toScene }: MasterStageProps<HandsConfig>) {
  const env = benchEnv(spec, st);
  const fresh = () => benchEnv(spec, st);
  const num = (e: string, en: Env = env) => { try { return evalExpr(e, en); } catch { return 0; } };
  const ok = (e?: string, en: Env = env) => { if (!e) return true; try { return !!evalExpr(e, en); } catch { return false; } };
  const N = (v: Num | undefined, d = 0, en: Env = env) => v === undefined ? d : typeof v === 'number' ? v : num(v, en);
  const fill = (s: string) => s.replace(TEMPLATE_RE, (_, e: string, d?: string) => num(e).toFixed(d ? +d : 0));
  const pick = (list: { when: string; text?: string; color?: string }[] | undefined, key: 'text' | 'color', fb: string) => { const h = list?.find(x => ok(x.when)); return h ? h[key] ?? fb : fb; };
  const canAct = running && !auto;
  const toolCtl = cfg.toolControl || 'tool';
  const tool = Math.round(st.controls[toolCtl] || 0);
  const ctl = (id: string) => spec.controls.find(c => c.id === id);
  /** 隐藏控件不进事件流（setHidden），其余 act */
  const write = (id: string, v: number) => (ctl(id)?.hidden ? setHidden(id, v) : act(id, v));

  const [hand, setHand] = useState<Pt | null>(null);
  const [, redraw] = useState(0);
  const [msg, setMsg] = useState('');
  const [fx, setFx] = useState<{ kind: 'spray' | 'ripple'; x: number; y: number; k: number }[]>([]);
  const fxK = useRef(0);
  const off = useRef<Record<string, Pt>>({});          // 物件偏移（台面自己记，不进规格）
  const seen = useRef<Record<string, boolean>>({});    // 物件上一帧显示没有（出现那一刻摆位）
  const painted = useRef<Record<string, boolean[]>>({});
  const taps = useRef<Record<string, number[]>>({});
  const active = useRef<Active | null>(null);
  const pressing = useRef(false);
  const lastTick = useRef(st.t);

  // ── 物件 / 区域 ──
  const pieceCfg = (id: string) => cfg.pieces?.find(p => p.id === id);
  const shown = (id: string, en: Env = env) => { const pc = pieceCfg(id); return !!pc && ok(pc.when, en); };
  const baseOf = (id: string, en: Env = env): Pt => { const pc = pieceCfg(id); return pc ? { x: N(pc.x, 0, en), y: N(pc.y, 0, en) } : { x: 0, y: 0 }; };
  const posOf = (id: string, en: Env = env): Pt => {
    const pc = pieceCfg(id), b = baseOf(id, en), o = off.current[id];
    if (!pc || !o || (pc.offsetWhen && !ok(pc.offsetWhen, en))) return b;
    return { x: b.x + o.x, y: b.y + o.y };
  };
  // 出现那一刻摆到另一件物件上；演示时按状态摆（摆完留着，演示停了也不跳回去，和代码版一样）
  for (const pc of cfg.pieces || []) {
    const vis = ok(pc.when);
    if (vis && !seen.current[pc.id] && pc.spawnOn) { const s = posOf(pc.spawnOn), b = baseOf(pc.id); off.current[pc.id] = { x: s.x - b.x, y: s.y - b.y }; }
    seen.current[pc.id] = vis;
    if (auto && pc.autoAt && ok(pc.autoAt.when)) { const b = baseOf(pc.id); off.current[pc.id] = { x: N(pc.autoAt.x) - b.x, y: N(pc.autoAt.y) - b.y }; }
  }
  const inZone = (id: string, p: Pt, en: Env = env) => {
    const z = cfg.zones?.find(q => q.id === id); if (!z) return false;
    let ox = 0, oy = 0;
    if (z.on) { if (!shown(z.on, en)) return false; const pp = posOf(z.on, en); ox = pp.x; oy = pp.y; }
    const x = ox + N(z.x, 0, en), y = oy + N(z.y, 0, en);
    if (z.kind === 'rect') return p.x > x && p.x < x + N(z.w, 0, en) && p.y > y && p.y < y + N(z.h, 0, en);
    return hyp(p.x, p.y, x, y) < N(z.r, 0, en);
  };

  // ── 写控件 ──
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };
  const run = (a: HandsAction) => {
    const line = fill(pick(a.sayWhen, 'text', a.say || ''));
    for (const x of a.act || []) {
      const en = fresh();   // 每一项按那一刻的状态（前一项拨过的也算）
      if (!ok(x.when, en)) continue;
      write(x.control, typeof x.value === 'string' ? num(x.value, en) : x.value ?? 1);
    }
    if (line) say(line);
  };
  const outVal = (o: HandsOut, raw: number) => {
    const f = 10 ** (o.digits ?? 0), c = ctl(o.control), cur = st.controls[o.control] || 0;
    let v = Math.round(raw * ((o.scale ?? 1) * f)) / f;
    if (o.mode === 'max') v = Math.max(cur, v); else if (o.mode === 'add') v = cur + v;
    if (c?.kind === 'knob') v = Math.min(c.max ?? 100, Math.max(c.min ?? 0, v));
    return v;
  };
  const writeOut = (o: HandsOut, raw: number) => {
    const v = outVal(o, raw);
    if (o.deadband !== undefined && Math.abs(v - (st.controls[o.control] || 0)) <= o.deadband) return;
    write(o.control, v);
  };

  // ── 原语 ──
  const paint = (g: HandsGesture, p: Pt) => {
    const pt = g.paint!; const en = fresh();
    if (!ok(pt.need, en)) return;
    const arr = painted.current[g.id] ||= pt.points.map(() => false);
    let hit = 0;
    pt.points.forEach(([x, y], i) => { if (hyp(p.x, p.y, x, y) < pt.radius && !arr[i]) { arr[i] = true; hit++; } });
    if (hit) writeOut(pt.out, arr.filter(Boolean).length / arr.length * 100);
    const sp = pt.spill;
    if (sp) {
      const minD = Math.min(...pt.points.map(([x, y]) => hyp(p.x, p.y, x, y)));
      if (minD > sp.beyond && (!sp.inside || inZone(sp.inside, p)) && (!sp.outside || !inZone(sp.outside, p))) write(sp.control, Math.min(sp.max ?? 100, (st.controls[sp.control] || 0) + sp.step));
    }
    if (pt.cost) write(pt.cost.control, Math.max(0, (st.controls[pt.cost.control] || 0) - pt.cost.step));
  };
  const dragMove = (a: Active, p: Pt) => {
    const d = a.g.drag!; const b = baseOf(d.piece);
    let o: Pt = d.mode === 'relative' ? { x: a.off0.x + p.x - a.p0.x, y: a.off0.y + p.y - a.p0.y } : { x: p.x - b.x, y: p.y - b.y };
    if (d.axis === 'x') o.y = a.off0.y; else if (d.axis === 'y') o.x = a.off0.x;
    const lim = (v: number) => Math.max(d.min ?? -Infinity, Math.min(d.max ?? Infinity, v));
    o = { x: d.axis === 'y' ? o.x : lim(o.x), y: d.axis === 'x' ? o.y : lim(o.y) };
    off.current[d.piece] = o; redraw(v => v + 1);
    const now = performance.now();
    if (d.speed) {
      const tr = a.track; tr.push({ t: now, p });
      while (tr.length > 2 && now - tr[0].t > (d.speed.windowMs ?? 300)) tr.shift();
      const dt = tr[tr.length - 1].t - tr[0].t;
      // 窗口太短算不准（按下去那一瞬的两次事件几乎同时）
      if (dt >= (d.speed.minMs ?? 80)) writeOut(d.speed.out, hyp(tr[tr.length - 1].p.x, tr[tr.length - 1].p.y, tr[0].p.x, tr[0].p.y) / dt * 100);
    }
    if (d.amplitude) {
      const v = d.axis === 'y' ? o.y : o.x, h = a.amp;
      h.push(now, v);
      while (h.length > 2 && now - h[0] > (d.amplitude.windowMs ?? 600)) h.splice(0, 2);
      let span = 0; for (let i = 1; i < h.length; i += 2) span = Math.max(span, Math.abs(h[i] - v));
      writeOut(d.amplitude.out, span);
    }
  };
  const drop = (a: Active) => {
    const d = a.g.drag!; const pos = posOf(d.piece);
    for (const dr of d.drops || []) {
      const tg = dr.piece ? posOf(dr.piece) : { x: N(dr.x), y: N(dr.y) };
      const dd = hyp(pos.x, pos.y, tg.x, tg.y);
      if ((dr.within === undefined || dd < dr.within) && (dr.beyond === undefined || dd > dr.beyond)) { if (dr.out) writeOut(dr.out, dd); if (dr.action) run(dr.action); return; }
    }
    if (d.miss === 'home') { off.current[d.piece] = { x: 0, y: 0 }; redraw(v => v + 1); }
  };

  // ── 手势面 ──
  const down = (e: React.PointerEvent) => {
    if (!canAct) return;
    const p = toScene?.(e.clientX, e.clientY); if (!p) return;
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* 合成事件 */ }
    setHand(p); pressing.current = true;
    const en = fresh();
    const g = (cfg.gestures || []).find(x => (x.tool === undefined || x.tool === tool) && ok(x.when, en) && (!x.zone || inZone(x.zone, p, en)));
    if (!g) return;
    const now = performance.now();
    if (g.tempo) taps.current[g.id] = [...(taps.current[g.id] || []), now];
    if (g.fx) { const k = fxK.current; fxK.current += 8; setFx(f => g.fx === 'spray'
      ? [...f.slice(-12), ...Array.from({ length: 6 }, (_, i) => ({ kind: 'spray' as const, x: p.x + (Math.random() - 0.5) * 120, y: p.y + (Math.random() - 0.5) * 80, k: k + i }))]
      : [...f.slice(-5), { kind: 'ripple' as const, x: p.x, y: p.y, k }]); }
    if (g.down) run(g.down);
    if (g.drag || g.paint || g.hold) {
      active.current = { g, p0: p, off0: g.drag ? { ...(off.current[g.drag.piece] || { x: 0, y: 0 }) } : { x: 0, y: 0 }, track: [{ t: now, p }], amp: [] };
      if (g.paint) paint(g, p);
    }
  };
  const move = (e: React.PointerEvent) => {
    const p = toScene?.(e.clientX, e.clientY); if (!p) return;
    setHand(p);
    if (!canAct || !pressing.current) return;
    const en = fresh();
    for (const w of cfg.watch || []) { if (ok(w.when, en) && inZone(w.zone, p, en)) write(w.control, 1); else if (st.controls[w.control]) write(w.control, 0); }
    const a = active.current; if (!a) return;
    if (a.g.paint) paint(a.g, p);
    if (a.g.drag) dragMove(a, p);
  };
  const up = () => {
    pressing.current = false;
    const a = active.current; active.current = null;
    for (const w of cfg.watch || []) if (st.controls[w.control]) write(w.control, 0);
    if (!canAct || !a) return;
    if (a.g.hold?.release !== undefined) write(a.g.hold.control, a.g.hold.release);
    if (a.g.drag) drop(a);
  };

  // ── 每拍（模拟时钟 0.25 s）：按住计时、连拍节奏、摇晃衰减、物件回位 ──
  useEffect(() => {
    const dt = Math.min(1, Math.max(0, st.t - lastTick.current)); lastTick.current = st.t;
    if (!canAct) return;
    const a = active.current, now = performance.now();
    const h = a?.g.hold;
    if (h && pressing.current && dt > 0 && ok(h.when)) write(h.control, Math.min(h.max ?? Infinity, (st.controls[h.control] || 0) + h.perSec * dt));
    for (const g of cfg.gestures || []) {
      if (g.tempo) {
        const tp = g.tempo, ts = (taps.current[g.id] || []).filter(x => now - x < (tp.keepMs ?? 6000)); taps.current[g.id] = ts;
        if (ts.length >= 2 && now - ts[ts.length - 1] < (tp.idleMs ?? 3000)) {
          const gaps = ts.slice(1).map((x, i) => x - ts[i]).slice(-(tp.last ?? 5));
          writeOut(tp.out, 60000 / (gaps.reduce((s, x) => s + x, 0) / gaps.length));
        } else if (st.controls[tp.out.control]) write(tp.out.control, 0);
      }
      const d = g.drag;
      if (!d || a?.g === g) continue;
      const am = d.amplitude;
      if (am?.decay && (st.controls[am.out.control] || 0) > 0) write(am.out.control, Math.max(0, st.controls[am.out.control] - am.decay));
      const o = off.current[d.piece];
      if (d.springBack !== undefined && o && (o.x || o.y)) {
        off.current[d.piece] = { x: Math.abs(o.x) < 2 ? 0 : o.x * d.springBack, y: Math.abs(o.y) < 2 ? 0 : o.y * d.springBack };
        redraw(v => v + 1);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.t]);

  // ── 键盘（处理函数每次渲染换新，监听只挂一次） ──
  const keyRef = useRef<{ kd: (e: KeyboardEvent) => void; ku: (e: KeyboardEvent) => void }>({ kd: () => {}, ku: () => {} });
  const keyHit = (k: NonNullable<HandsConfig['keys']>[number], e: KeyboardEvent) => k.code ? e.code === k.code : !!k.key && e.key.toLowerCase() === k.key.toLowerCase();
  keyRef.current = {
    kd: e => {
      if (e.repeat || !canAct) return;
      for (const k of cfg.keys || []) {
        if (!keyHit(k, e) || !ok(k.when, fresh())) continue;
        if (k.prevent) e.preventDefault();
        if (k.hold && !st.controls[k.hold]) write(k.hold, 1);
        if (k.action) run(k.action);
      }
    },
    ku: e => { if (!canAct) return; for (const k of cfg.keys || []) if (k.hold && keyHit(k, e) && st.controls[k.hold]) write(k.hold, 0); },
  };
  useEffect(() => {
    if (!canAct || !cfg.keys?.length) return;
    const kd = (e: KeyboardEvent) => keyRef.current.kd(e), ku = (e: KeyboardEvent) => keyRef.current.ku(e);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [canAct, cfg.keys]);

  // ── 画 ──
  const shape = (sh: HandsShape, i: number) => {
    if (!ok(sh.when) || (sh.live && !canAct)) return null;
    const color = pick(sh.colorWhen, 'color', sh.color || '#c7cbe6');
    const x = N(sh.x), y = N(sh.y), op = sh.opacity === undefined ? undefined : N(sh.opacity);
    const filter = sh.blur ? `url(#bench-blur${sh.blur === 'sm' ? '-sm' : ''})` : undefined;
    const pulse = sh.pulse ? <animate attributeName="opacity" values="1;.4;1" dur=".6s" repeatCount="indefinite" /> : null;
    switch (sh.kind) {
      case 'line': return <line key={i} x1={x} y1={y} x2={N(sh.x2)} y2={N(sh.y2)} stroke={color} strokeWidth={sh.width || 4} strokeDasharray={sh.dash} strokeLinecap="round" opacity={op} />;
      case 'rect': return <rect key={i} x={x} y={y} width={Math.max(0, N(sh.w))} height={Math.max(0, N(sh.h))} rx={N(sh.rx, 8)} fill={sh.fill || 'none'} stroke={sh.fill && !sh.color ? 'none' : color} strokeWidth={sh.width ?? 2} strokeDasharray={sh.dash} opacity={op} filter={filter}>{pulse}</rect>;
      case 'circle': return <circle key={i} cx={x} cy={y} r={Math.max(0, N(sh.r, 8))} fill={sh.fill || color} stroke={sh.fill && sh.color ? color : 'none'} strokeWidth={sh.width ?? 0} opacity={op} filter={filter}>{pulse}</circle>;
      case 'ellipse': return <ellipse key={i} cx={x} cy={y} rx={Math.max(0, N(sh.rx))} ry={Math.max(0, N(sh.ry))} fill={sh.fill || color} stroke={sh.fill && sh.color ? color : 'none'} strokeWidth={sh.width ?? 0} opacity={op} filter={filter} />;
      case 'path': return <path key={i} d={sh.d} transform={sh.x !== undefined || sh.rotate ? `translate(${x} ${y}) rotate(${sh.rotate || 0})` : undefined} fill={sh.fill || 'none'} stroke={sh.fill && !sh.color ? 'none' : color} strokeWidth={sh.width ?? (sh.fill ? 0 : 4)} strokeDasharray={sh.dash} strokeLinecap="round" opacity={op} filter={filter} />;
      case 'wave': {
        const amp = N(sh.amp), f = sh.freq ?? 9, step = sh.step ?? 10;
        const d = Array.from({ length: sh.n ?? 48 }, (_, k) => `${k ? 'L' : 'M'} ${x + k * step} ${y + amp * Math.sin(k * 1.7 + st.t * f) * (0.5 + Math.abs(Math.sin(k * 0.37)))}`).join(' ');
        return <path key={i} d={d} fill="none" stroke={color} strokeWidth={sh.width ?? 3} strokeLinejoin="round" opacity={op} />;
      }
      case 'sparks': {
        const n = Math.round(N(sh.count, 8)), w = N(sh.w, 200), h = N(sh.h, 160);
        return <g key={i} opacity={op}>{Array.from({ length: n }, (_, k) => <circle key={k} cx={x + Math.sin(st.t * 7 + k * 1.7) * w / 2} cy={y - ((st.t * 90 + k * 37) % h)} r={2 + (k % 3)} fill={sh.fill || '#ffd166'} opacity={.8} />)}</g>;
      }
      case 'text': {
        const t = sh.textParts ? sh.textParts.filter(p => ok(p.when)).map(p => fill(p.text)).join('') : fill(pick(sh.textWhen, 'text', sh.text || ''));
        if (sh.wrap) return <foreignObject key={i} x={x} y={y} width={sh.wrap} height={(sh.size || 14) * 4} pointerEvents="none"><div style={{ color, fontSize: sh.size || 14, fontWeight: sh.weight || 600, lineHeight: 1.45, fontFamily: FONT }}>{t}</div></foreignObject>;
        return <text key={i} x={x} y={y} fill={color} fontSize={sh.size || 14} fontWeight={sh.weight || 600} textAnchor={sh.anchor || 'start'} letterSpacing={sh.spacing}
          fontFamily={sh.mono ? 'ui-monospace, Menlo, monospace' : undefined} opacity={op} style={sh.shadow ? { textShadow: '0 1px 5px rgba(0,0,0,.9)' } : undefined}>{t}</text>;
      }
    }
    return null;
  };
  const layer = (list: HandsShape[] | undefined, k: string) => list?.length ? <g key={k} pointerEvents="none">{list.map(shape)}</g> : null;

  const wantTool = cfg.wantTool ? num(cfg.wantTool) : undefined;
  const steps = cfg.steps || [];
  const stepDone = steps.map(s => s.ever ? st.events.some(e => e.kind === 'control' && e.control === s.ever) : ok(s.done));
  const cur = stepDone.findIndex(d => !d);
  const sa = cfg.sayAt || { x: 470, y: 0, w: 660 };
  const toolIcon = cfg.tools?.find(t => t.v === tool)?.icon;
  const cursor = hand && canAct ? (cfg.cursor === 'hand' ? <Hand x={hand.x} y={hand.y} /> : cfg.cursor === 'tool' && toolIcon
    ? <text x={hand.x} y={hand.y + 12} textAnchor="middle" fontSize={34} pointerEvents="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.5))' }}>{toolIcon}</text> : null) : null;
  const tapTool = (v: number) => (e: React.PointerEvent) => { e.stopPropagation(); if (canAct) act(toolCtl, v); };

  return (
    <g onPointerMove={move}>
      {!!cfg.gradients?.length && <defs>{cfg.gradients.map(gr => (
        <radialGradient key={gr.id} id={gr.id} cx={gr.cx || '50%'} cy={gr.cy || '50%'} r={gr.r || '50%'}>
          {gr.stops.map(([o, c, a], j) => <stop key={j} offset={`${o * 100}%`} stopColor={c} stopOpacity={a ?? 1} />)}
        </radialGradient>))}</defs>}
      {layer(cfg.shapes, 'under')}
      {/* 刷痕：手刷过的点；演示时按覆盖率补画 */}
      <g pointerEvents="none">{(cfg.gestures || []).filter(g => g.paint).map(g => { const pt = g.paint!, arr = painted.current[g.id] || [], c = st.controls[pt.out.control] || 0; return (
        <g key={g.id}>{pt.points.map(([x, y], i) => arr[i] || (auto && c > i / pt.points.length * 100)
          ? <circle key={i} cx={x} cy={y} r={pt.mark?.r ?? 18} fill={pt.mark?.color || '#efd27a'} opacity={pt.mark?.opacity ?? 0.85} /> : null)}</g>); })}</g>
      {/* 主体插件 */}
      {(cfg.subjects || []).map((s, i) => { const S = SUBJECTS[s.plugin]; if (!S) return null; const at = s.piece ? posOf(s.piece) : { x: N(s.x), y: N(s.y) };
        return <S key={i} x={at.x} y={at.y} t={st.t} live={canAct} P={(k, d = 0) => N(s.params?.[k], d)} T={k => s.texts?.[k] || ''} />; })}
      {/* 物件 */}
      {(cfg.pieces || []).filter(pc => pc.shapes?.length && ok(pc.when)).map(pc => { const p = posOf(pc.id); return <g key={pc.id} transform={`translate(${p.x} ${p.y})`} pointerEvents="none">{pc.shapes!.map(shape)}</g>; })}
      {/* 反馈：水雾 / 波纹 */}
      <g pointerEvents="none">{fx.map(f => f.kind === 'spray'
        ? <circle key={f.k} cx={f.x} cy={f.y} r={3} fill="#bfe0ff" opacity={0.9}><animate attributeName="opacity" from="0.9" to="0" dur="0.8s" fill="freeze" /><animate attributeName="r" from="2" to="7" dur="0.8s" fill="freeze" /></circle>
        : <circle key={f.k} cx={f.x} cy={f.y} r={30} fill="none" stroke="#fff" strokeWidth={3} opacity={0.8}><animate attributeName="r" from="16" to="60" dur="0.5s" fill="freeze" /><animate attributeName="opacity" from="0.8" to="0" dur="0.5s" fill="freeze" /></circle>)}</g>
      {cfg.cursorUnder && cursor}
      {layer(cfg.over, 'over')}
      {layer(cfg.hud, 'hud')}
      {/* 步骤清单 */}
      {!!steps.length && cfg.stepsAt && (() => { const s = cfg.stepsAt, cols = s.cols || 4, cw = s.colW || 240; return (
        <g pointerEvents="none">
          <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={16} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
          {s.title && <text x={s.x + 26} y={s.y + 38} fill="#ffd166" fontSize={22} fontWeight={800}>{s.title}</text>}
          {steps.map((st_, i) => { const x = s.x + 26 + (i % cols) * cw, y = s.y + 72 + Math.floor(i / cols) * 30, done = stepDone[i], on = i === cur; return (
            <g key={i}>
              <circle cx={x + 8} cy={y - 5} r={8} fill={done ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={done ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
              <text x={x + 24} y={y} fill={done ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={s.size || 14} fontWeight={on ? 800 : 500}>{i + 1}. {st_.label}</text>
            </g>); })}
        </g>); })()}
      {msg && <g pointerEvents="none"><rect x={sa.x} y={sa.y} width={sa.w} height={40} fill="rgba(255,95,162,.9)" /><text x={sa.x + sa.w / 2} y={sa.y + 26} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{msg}</text></g>}

      {/* 手势面（按钮 / 工具盘在它上面，自己 stopPropagation） */}
      <rect x={0} y={0} width={1600} height={900} fill="transparent" style={{ cursor: canAct && cfg.cursor ? 'none' : 'default', touchAction: 'none' }}
        onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />

      {/* 按钮（透明热区 / 选项 / 按住型） */}
      {(cfg.buttons || []).map((b, i) => {
        if (!ok(b.when)) return null;
        const h = {
          style: { cursor: canAct ? 'pointer' : 'default' },
          onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); if (!canAct) return; if (b.action) run(b.action); if (b.hold && !st.controls[b.hold]) write(b.hold, 1); },
          onPointerUp: () => { if (b.hold && st.controls[b.hold]) write(b.hold, 0); },
          onPointerLeave: () => { if (b.hold && st.controls[b.hold]) write(b.hold, 0); },
        };
        if (b.ghost) return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" {...h} />;
        const sel = !!b.selWhen && ok(b.selWhen), lit = !!b.litWhen && ok(b.litWhen), size = b.size || 15;
        return (
          <g key={i} {...h}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.rx ?? 10} fill={lit ? (b.litColor || '#3ddc97') : sel ? 'rgba(106,92,255,.92)' : (b.color || 'rgba(255,255,255,.12)')}
              stroke={sel || lit ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={sel ? 2.5 : 1.5} />
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + size * 0.4} textAnchor="middle" fill={lit ? (b.litInk || '#fff') : '#fff'} fontSize={size} fontWeight={b.weight || 700} pointerEvents="none">{fill(pick(b.labelWhen, 'text', b.label || ''))}</text>
          </g>);
      })}

      {/* 器械盘：这会儿该拿的那件发光 */}
      {!!cfg.tools?.length && (() => { const ta = cfg.toolsAt || { x: 56, y: 72 }, n = cfg.tools.length; return (
        <g>
          <rect x={ta.x - 16} y={ta.y - 12} width={n * 80 + 20} height={118} rx={18} fill="rgba(12,16,32,.62)" stroke="rgba(255,255,255,.22)" strokeWidth={2} pointerEvents="none" />
          {ta.title && <text x={ta.x} y={ta.y - 20} fill="#fff" fontSize={17} fontWeight={700} style={{ textShadow: '0 1px 5px rgba(0,0,0,.8)' }} pointerEvents="none">{ta.title}</text>}
          {cfg.tools.map((t, i) => { const x = ta.x + i * 80, sel = tool === t.v, glow = wantTool === t.v && !sel; return (
            <g key={t.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={tapTool(t.v)}>
              {glow && <rect x={x - 4} y={ta.y - 4} width={76} height={100} rx={14} fill="none" stroke="#ffd166" strokeWidth={3}><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite" /></rect>}
              <rect x={x} y={ta.y} width={68} height={92} rx={12} fill={sel ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.14)'} stroke={sel ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={sel ? 3 : 1.5} />
              <text x={x + 34} y={ta.y + 46} textAnchor="middle" fontSize={30} pointerEvents="none">{t.icon}</text>
              <text x={x + 34} y={ta.y + 80} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700} pointerEvents="none">{t.label.replace(/（.*）/, '')}</text>
            </g>); })}
        </g>); })()}
      {!cfg.cursorUnder && cursor}
    </g>
  );
}
