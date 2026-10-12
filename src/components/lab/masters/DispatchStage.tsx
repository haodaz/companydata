'use client';

/**
 * 母版 D 沙盘 / 调度：地图或俯视 / 侧视场景 + 地点 + 单位 / 个体 + 调度动作 + 按时间推送的事件（src/lib/masters/dispatch.ts 的 DispatchConfig）。
 * 挂在 BenchRunner：画在场景 svg 里（1600 × 900）。
 *   点个体 = 选中（拨 select 控件，或只在台面里记着）；选中后点按钮作用在它身上，或点地点把它派过去；
 *   拖个体 = 指针坐标换成隐藏控件（潜导拖自己的位置 / 深度）；跟随者按模拟拍追目标，把距离写回隐藏控件。
 * 跟随者只在模拟时间往前走时迈步（暂停就停），所以演示回放和真人玩看到的一样。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { benchEnv, evalExpr, playDt } from '@/lib/bench';
import type { MasterStageProps, Num } from '@/lib/lab-masters';
import { DTPL_RE, expandEntities, terrainY, type DAction, type DAxis, type DEntity, type DShape, type DispatchConfig } from '@/lib/masters/dispatch';

type Pt = { x: number; y: number };
type Env = Record<string, number>;
const FONT = 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif';
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(((s % 60) + 60) % 60)).padStart(2, '0')}`;

export function DispatchStage({ spec, cfg, st, running, auto, act, setHidden, toScene }: MasterStageProps<DispatchConfig>) {
  const canAct = running && !auto;
  const ents = useMemo(() => expandEntities(cfg), [cfg]);
  const terr = useMemo(() => Object.fromEntries((cfg.terrains || []).map(t => [t.id, t])), [cfg]);
  const img = spec.scene?.image || '';
  const fol = useRef<Record<string, Pt>>({});
  const folT = useRef<number | null>(null);
  const pending = useRef<Record<string, number>>({});
  const cool = useRef<Record<string, number>>({});
  const feedSeen = useRef<{ i: number; t: number }[]>([]);
  const [selLocal, setSelLocal] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 正在拖哪个：和代码版 Dive 一样放 ref（按下后紧跟的 move 不用等重画就能读到）；另一个 state 只为让大热区跟着打开
  const dragging = useRef<string | null>(null);
  const [, setDragOn] = useState(false);

  // ── 求值 ──
  const num = (e: string, env: Env) => { try { return evalExpr(e, env); } catch { return 0; } };
  const N = (v: Num | undefined, env: Env, d = 0) => v === undefined ? d : typeof v === 'number' ? v : num(v, env);
  const ok = (e: string | undefined, env: Env) => !e || !!num(e, env);
  const pick = (list: { when: string }[] | undefined, key: string, fallback: string | undefined, env: Env): string | undefined => { const hit = list?.find(x => ok(x.when, env)) as any; return hit ? hit[key] : fallback; };

  const base: Env = benchEnv(spec, st);
  base.has_image = img ? 1 : 0;
  const ph = cfg.phases;
  const phase = ph ? Math.round(num(ph.control, base)) : 0;
  base.phase_len = ph?.items[phase - 1]?.len || 0;
  base.sel = 0;

  /** 全场本地量：跟随者当前位置 → locals（按顺序） */
  const withLocals = (): Env => {
    const env: Env = { ...base };
    for (const [id, p] of Object.entries(fol.current)) { env[`${id}_x`] = p.x; env[`${id}_y`] = p.y; }
    for (const l of cfg.locals || []) env[l.id] = l.terrain ? terrainY(terr[l.terrain], N(l.x, env)) : num(l.expr || '0', env);
    return env;
  };

  // ── 跟随者：按模拟拍迈步（一拍 = playDt 模拟秒，和体验端 250 ms 一拍对齐） ──
  const followers = ents.filter(e => e.follow);
  if (followers.length) {
    const env0 = withLocals();
    for (const e of followers) if (!fol.current[e.id]) fol.current[e.id] = { x: N(e.x, env0), y: N(e.y, env0) };
    const step = playDt(spec);
    if (folT.current === null || st.t < folT.current) folT.current = st.t;
    const n = Math.min(60, Math.floor((st.t - folT.current) / step + 1e-6));
    if (n > 0) {
      folT.current += n * step;
      for (let k = 0; k < n; k++) {
        const env = withLocals();
        for (const e of followers) {
          const f = e.follow!, p = fol.current[e.id];
          const rx = N(f.rate, env), ry = f.rateY === undefined ? rx : N(f.rateY, env);
          p.x += (N(f.x, env) - p.x) * rx; p.y += (N(f.y, env) - p.y) * ry;
        }
      }
      if (canAct) {
        const env = withLocals();
        for (const e of followers) { const d = e.follow!.distance; if (!d) continue; const p = fol.current[e.id], m = 10 ** (d.digits ?? 1); pending.current[d.control] = Math.round(Math.hypot(N(d.x, env) - p.x, N(d.y, env) - p.y) * d.scale * m) / m; }
      }
    }
  }
  useEffect(() => { const p = pending.current; pending.current = {}; for (const [id, v] of Object.entries(p)) setHidden(id, v); });

  const env = withLocals();

  // ── 个体：选中、位置 ──
  const isSel = (e: DEntity, en: Env) => !!e.select && (e.select.control !== undefined ? Math.round(en[e.select.control] ?? 0) === Math.round(N(e.select.value, en, 1)) : selLocal === e.id);
  const entEnv: Record<string, Env> = {}, pos: Record<string, Pt> = {};
  for (const e of ents) {
    const en: Env = { ...env, sel: isSel(e, env) ? 1 : 0 };
    for (const l of e.lets || []) en[l.id] = num(l.expr, en);
    entEnv[e.id] = en;
  }
  const selEnt = ents.find(e => entEnv[e.id].sel === 1 && ok(e.when, entEnv[e.id]));
  const stackK: Record<string, number> = {};
  const place = (e: DEntity): Pt => {
    const en = entEnv[e.id];
    if (e.follow) return fol.current[e.id];
    if (e.assign) {
      const v = Math.round(en[e.assign.control] ?? 0), loc = cfg.locations?.find(l => l.value === v);
      if (loc) { const s = loc.stack || { ox: 0, oy: 0, dx: 24, dy: 24, cols: 4 }, k = stackK[loc.id] = (stackK[loc.id] ?? -1) + 1; return { x: loc.x + s.ox + (k % s.cols) * s.dx, y: loc.y + s.oy + Math.floor(k / s.cols) * s.dy }; }
    }
    return { x: N(e.x, en), y: N(e.y, en) };
  };
  for (const e of ents) if (!e.near) pos[e.id] = place(e);
  for (const e of ents) if (e.near) pos[e.id] = selEnt && pos[selEnt.id] ? { x: pos[selEnt.id].x + e.near.dx, y: pos[selEnt.id].y + e.near.dy } : place(e);
  for (const e of ents) { env[`${e.id}_x`] = pos[e.id].x; env[`${e.id}_y`] = pos[e.id].y; }
  for (const e of ents) Object.assign(entEnv[e.id], { [`${e.id}_x`]: pos[e.id].x, [`${e.id}_y`]: pos[e.id].y });

  // ── 事件 ──
  const live = (cfg.incidents?.items || []).filter(x => x.t <= st.t && ok(x.open, env));
  if (cfg.feed) cfg.feed.items.forEach((x, i) => { if (!feedSeen.current.some(f => f.i === i) && ok(x.when, env)) feedSeen.current.push({ i, t: st.t }); });

  const fill = (t: string, en: Env) => t.replace(DTPL_RE, (_, e: string, d?: string) => {
    if (e === '@sel') return selEnt?.label || '';
    if (e === '@incidents') return live.length ? (cfg.incidents?.prefix || '') + live.map(x => x.text).join(cfg.incidents?.join ?? '；') : '';
    if (e === '@incident') return live.length ? live[live.length - 1].text : '';
    const v = num(e, en);
    return d === 'clock' ? clock(v) : v.toFixed(d ? +d : 0);
  });

  const say = (m: string) => { setMsg(m); if (msgTimer.current) clearTimeout(msgTimer.current); msgTimer.current = setTimeout(() => setMsg(''), cfg.sayAt?.ms ?? 2500); };
  const run = (a: DAction) => {
    // 拦截只说一句、不拨控件：没开始 / 演示时也照样提示（和代码版幼儿园一致）
    const g = a.guards?.find(x => ok(x.when, env));
    if (g) { say(g.say); return; }
    if (!canAct) return;
    if (a.cooldown) { const k = a.cooldown.group || '_', now = performance.now(); if (now - (cool.current[k] || -1e9) < a.cooldown.ms) return; cool.current[k] = now; }
    const line = pick(a.sayWhen, 'text', a.say, env);
    // 条件和取值都按点下去那一刻的状态算（先算完再拨，免得前一条改了后一条的条件）
    const todo = (a.act || []).filter(x => ok(x.when, env)).map(x => ({ ...x, control: x.control === '@sel' ? selEnt?.id || '' : x.control, v: N(x.value, env, 1) }));
    for (const x of todo) {
      if (!x.control) continue;
      const w = x.hidden ? setHidden : act;
      w(x.control, x.v);
      if (x.pulse) setTimeout(() => w(x.control, 0), x.pulse);
    }
    if (line) say(fill(line, env));
  };

  // ── 拖动 ──
  const axis = (a: DAxis, p: number) => { const f = (p - a.px[0]) / (a.px[1] - a.px[0]); return a.v[0] + f * (a.v[1] - a.v[0]); };
  const clampR = (a: DAxis, v: number) => { const m = 10 ** (a.digits ?? 1); return Math.round(v * m) / m; };
  const dragTo = (e: DEntity, p: Pt) => {
    const d = e.drag!;
    if (d.y) {
      let v = Math.max(d.y.min, Math.min(d.y.max, axis(d.y, p.y)));
      if (d.floor) v = Math.min(v, axis(d.y, terrainY(terr[d.floor.terrain], p.x) + d.floor.offset));
      setHidden(d.y.control, clampR(d.y, v));
    }
    if (d.x) setHidden(d.x.control, clampR(d.x, Math.max(d.x.min, Math.min(d.x.max, axis(d.x, p.x)))));
  };
  const onMove = (ev: React.PointerEvent) => { if (!dragging.current || !toScene) return; const e = ents.find(x => x.id === dragging.current); const p = toScene(ev.clientX, ev.clientY); if (e && p) dragTo(e, p); };
  const onUp = () => { if (!dragging.current) return; dragging.current = null; setDragOn(false); };

  // ── 画 ──
  const shape = (sh: DShape, en: Env, key: string | number, inert = false): React.ReactNode => {
    if (sh.when && !ok(sh.when, en)) return null;
    if (inert) return <g key={key} pointerEvents="none">{shape(sh, en, 0)}</g>;
    const color = pick(sh.colorWhen, 'color', sh.color, en);
    const fl = pick(sh.fillWhen, 'fill', sh.fill, en) || 'none';
    const x = N(sh.x, en), y = N(sh.y, en), op = sh.opacity === undefined ? undefined : N(sh.opacity, en);
    const sw = color ? N(sh.width, en, 2) : 0;
    const filter = sh.blur ? `url(#bench-blur${sh.blur === 'sm' ? '-sm' : ''})` : undefined;
    const anim = sh.animate ? <animate attributeName={sh.animate.attr} values={sh.animate.values} dur={sh.animate.dur} repeatCount="indefinite" /> : null;
    const common = { fill: fl, stroke: color || 'none', strokeWidth: sw, strokeDasharray: sh.dash, opacity: op, filter };
    switch (sh.kind) {
      case 'line': return <line key={key} x1={x} y1={y} x2={N(sh.x2, en)} y2={N(sh.y2, en)} stroke={color || '#fff'} strokeWidth={N(sh.width, en, 2)} strokeDasharray={sh.dash} strokeLinecap="round" opacity={op}>{anim}</line>;
      case 'rect': return <rect key={key} x={x} y={y} width={Math.max(0, N(sh.w, en))} height={Math.max(0, N(sh.h, en))} rx={N(sh.rx, en)} {...common}>{anim}</rect>;
      case 'circle': return <circle key={key} cx={x} cy={y} r={Math.max(0, N(sh.r, en, 8))} {...common}>{anim}</circle>;
      case 'ellipse': return <ellipse key={key} cx={x} cy={y} rx={Math.max(0, N(sh.rx, en))} ry={Math.max(0, N(sh.ry, en))} {...common}>{anim}</ellipse>;
      case 'path': return <path key={key} d={fill(sh.d || '', en)} strokeLinecap="round" {...common}>{anim}</path>;
      case 'image': return img ? <image key={key} href={img} x={x} y={y} width={N(sh.w, en, 1600)} height={N(sh.h, en, 900)} preserveAspectRatio="xMidYMid slice" opacity={op} /> : null;
      case 'terrain': {
        const t = terr[sh.terrain || '']; if (!t) return null;
        const from = t.from ?? 0, to = t.to ?? 1600, stp = t.step || 50, bottom = t.bottom ?? 900, pts: string[] = [];
        for (let px = from; px <= to + 1e-6; px += stp) pts.push(`L ${px} ${terrainY(t, px)}`);
        return <path key={key} d={`M ${from} ${bottom} L ${from} ${terrainY(t, from)} ${pts.join(' ')} L ${to} ${bottom} Z`} {...common} />;
      }
      case 'text': return <text key={key} x={x} y={y} fill={color || '#fff'} fontSize={sh.size || 14} fontWeight={sh.weight || 600} textAnchor={sh.anchor || 'start'} letterSpacing={sh.spacing}
        fontFamily={sh.mono ? 'ui-monospace, Menlo, monospace' : undefined} opacity={op} pointerEvents="none" style={sh.shadow ? { textShadow: '0 1px 4px rgba(0,0,0,.8)' } : undefined}>{fill(pick(sh.textWhen, 'text', sh.text, en) || '', en)}{anim}</text>;
    }
    return null;
  };

  const cursor = (on: boolean) => ({ cursor: canAct && on ? 'pointer' : 'default' });
  const ph2 = ph && phase > 0 && phase <= ph.items.length ? ph.items[phase - 1] : null;
  const phLong = ph?.long ? ok(ph.long, env) : false;
  const steps = cfg.steps || [];
  const done = steps.map(s => ok(s.done, env));
  const hasOn = steps.some(s => s.on);
  const cur = hasOn ? steps.findIndex(s => ok(s.on, env)) : done.findIndex(d => !d);
  const sp = cfg.stepsAt;
  const sa = cfg.sayAt || { x: 800, y: 60, anchor: 'middle' as const };

  return (
    <g>
      {!!cfg.gradients?.length && <defs>{cfg.gradients.map(g => <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2={g.horizontal ? '1' : '0'} y2={g.horizontal ? '0' : '1'}>{g.stops.map(([o, c], i) => <stop key={i} offset={`${o}%`} stopColor={c} />)}</linearGradient>)}</defs>}
      {cfg.bg && <rect x={0} y={0} width={1600} height={900} fill={cfg.bg} />}
      {(cfg.shapes || []).map((sh, i) => shape(sh, env, `s${i}`, true))}
      {/* 地点：选中了可派遣的个体时，点地点 = 派过去 */}
      {(cfg.locations || []).map(l => {
        if (!ok(l.when, env)) return null;
        const assignable = !!selEnt?.assign && l.value !== undefined && ok(l.enabled, env);
        const en = { ...env, sel: assignable ? 1 : 0 };
        return <g key={l.id} transform={`translate(${l.x} ${l.y})`} style={cursor(assignable || !!l.action)} onPointerDown={ev => {
          if (!canAct) return;
          if (assignable) { ev.stopPropagation(); setHidden(selEnt!.assign!.control, l.value!); setSelLocal(null); }
          else if (l.action) { ev.stopPropagation(); run(l.action); }
        }}>
          {l.hit && <rect x={-l.hit.w / 2} y={-l.hit.h / 2} width={l.hit.w} height={l.hit.h} fill="transparent" />}
          {(l.shapes || []).map((sh, i) => shape(sh, en, i))}
        </g>;
      })}
      {/* 个体 */}
      {ents.map(e => {
        const en = entEnv[e.id];
        if (!ok(e.when, en)) return null;
        const p = pos[e.id];
        const canDrag = !!e.drag && canAct && ok(e.drag.when, en);
        return <g key={e.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: canDrag ? 'grab' : canAct && e.select ? 'pointer' : 'default' }}
          onPointerDown={ev => {
            if (e.drag) {
              if (!canDrag || !toScene) return;
              const q = toScene(ev.clientX, ev.clientY); if (!q || Math.hypot(q.x - p.x, q.y - p.y) >= e.drag.grab) return;
              dragging.current = e.id; setDragOn(true); try { (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId); } catch { /* */ }
              return;
            }
            if (!e.select) return;
            ev.stopPropagation(); if (!canAct) return;
            if (e.select.control !== undefined) act(e.select.control, en.sel ? 0 : N(e.select.value, en, 1));
            else setSelLocal(en.sel ? null : e.id);
          }}
          onPointerMove={e.drag ? onMove : undefined} onPointerUp={e.drag ? onUp : undefined} onPointerCancel={e.drag ? onUp : undefined}>
          {e.hit !== undefined && <circle r={e.hit} fill="transparent" />}
          {e.shapes.map((sh, i) => shape(sh, en, i))}
        </g>;
      })}
      {/* 拖动用的大热区（拖出个体也跟着） */}
      <rect x={0} y={0} width={1600} height={900} fill="transparent" style={{ pointerEvents: dragging.current ? 'auto' : 'none' }} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />
      {(cfg.overlay || []).map((sh, i) => shape(sh, env, `o${i}`, true))}
      {/* 环节进度 */}
      {ph && <g pointerEvents="none">
        <text x={ph.at.x} y={ph.at.y} fill={ph.textColor || '#171a2e'} fontSize={20} fontWeight={800}>{ph2 ? `${phase}/${ph.items.length} ${ph2.label}` : ph.idle || ''}</text>
        {ph2 && (() => { const el = num(ph.elapsed, env), lc = ph.longColor || '#d6336c'; return <g>
          <rect x={ph.at.x} y={ph.at.y + 16} width={ph.at.w} height={14} rx={7} fill="rgba(0,0,0,.1)" />
          <rect x={ph.at.x} y={ph.at.y + 16} width={ph.at.w * Math.max(0, Math.min(1, el / ph2.len))} height={14} rx={7} fill={phLong ? lc : ph.color || '#6a5cff'} />
          <text x={ph.at.x + ph.at.w + 10} y={ph.at.y + 28} fill={phLong ? lc : ph.mutedColor || '#6b7089'} fontSize={13} fontWeight={phLong ? 800 : 500}>{clock(el)} / {ph2.len / 60} 分{phLong ? ph.longText || '' : ''}</text>
        </g>; })()}
      </g>}
      {/* 按钮 */}
      {(cfg.buttons || []).map((b, i) => {
        if (!ok(b.when, env)) return null;
        const label = fill(pick(b.labelWhen, 'text', b.label, env) || '', env), tc = pick(b.colorWhen, 'color', b.color, env) || '#fff', size = b.size || 13;
        return <g key={`b${i}`} style={cursor(true)} onPointerDown={ev => { ev.stopPropagation(); run(b.action); }}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={pick(b.fillWhen, 'fill', b.fill, env) || 'rgba(255,255,255,.14)'} stroke={b.stroke || 'none'} strokeWidth={b.stroke ? b.strokeWidth ?? 1.5 : 0} />
          {b.icon ? <>
            <text x={b.x + b.w / 2} y={b.y + b.h * 0.53} textAnchor="middle" fontSize={24} pointerEvents="none">{b.icon}</text>
            <text x={b.x + b.w / 2} y={b.y + b.h - 7} textAnchor="middle" fill={tc} fontSize={b.size || 11} fontWeight={b.weight || 700} pointerEvents="none">{label}</text>
          </> : <text x={b.x + b.w / 2} y={b.y + b.h / 2 + size * 0.42} textAnchor="middle" fill={tc} fontSize={size} fontWeight={b.weight || 800} pointerEvents="none">{label}</text>}
        </g>;
      })}
      {/* 事件流 */}
      {cfg.feed && (() => { const f = cfg.feed, rows = [...feedSeen.current].reverse(); return <foreignObject x={f.at.x} y={f.at.y} width={f.at.w} height={f.at.h} pointerEvents="none">
        <div style={{ height: '100%', overflow: 'hidden', fontFamily: FONT }}>
          {f.title && <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginBottom: 6 }}>{f.title}</div>}
          {rows.map(r => { const it = f.items[r.i], k = it.kind || 'info', m = (f.clockBase || 0) + r.t; return <div key={r.i} style={{ padding: '6px 10px', marginBottom: 6, borderRadius: 8, fontSize: 12.5, lineHeight: 1.5, background: k === 'alarm' ? '#ffe3ea' : k === 'ok' ? '#e3f7ec' : '#f3f4fa', color: k === 'alarm' ? '#a61e4d' : '#171a2e' }}>
            <span style={{ color: '#6b7089', marginRight: 6 }}>{f.clockBase !== undefined ? `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}` : clock(r.t)}</span>{fill(it.text, env)}</div>; })}
        </div>
      </foreignObject>; })()}
      {msg && <text x={sa.x} y={sa.y} textAnchor={sa.anchor || 'middle'} fill={sa.color || '#ffd166'} fontSize={sa.size || 13} fontWeight={700} pointerEvents="none">{msg}</text>}
      {/* 步骤清单（横排） */}
      {sp && !!steps.length && <g pointerEvents="none">
        <rect x={sp.x} y={sp.y} width={sp.w} height={sp.h} rx={sp.h > 60 ? 16 : 12} fill={sp.fill || 'rgba(12,16,32,.72)'} />
        {steps.map((s, i) => { const x = sp.cx + i * sp.dx, r = sp.r || 7, on = i === cur, d = done[i]; return <g key={i}>
          <circle cx={x} cy={sp.cy} r={r} fill={d ? '#3ddc97' : on ? '#ffd166' : 'transparent'} stroke={d ? '#3ddc97' : on ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
          <text x={x + 2 * r} y={sp.cy + 5} fill={d ? '#3ddc97' : on ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={sp.size || 12.5} fontWeight={on ? 800 : 500}>{sp.numbered ? `${i + 1}. ` : ''}{s.label}</text>
        </g>; })}
      </g>}
    </g>
  );
}
