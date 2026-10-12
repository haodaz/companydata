'use client';

/**
 * 母版 B · 现场热点 + 工具盘（src/lib/lab-masters.ts 的 FieldConfig）：写实底图上压一层暗色，
 * 工具盘拿工具 → 点场景里的透明热区 → 拨控件 + 说一句；纸面板（操作票）、按钮（汇报 / 回令）、步骤清单、跟手的工具图标都是配置出来的。
 * 画在 BenchRunner 的场景 svg 里（1600 × 900）。变电站验电挂地线是第一个纯配置的样板（lab-switching-field.ts）。
 */
import React, { useRef, useState } from 'react';
import { benchEnv, evalExpr, type BenchSpec, type BenchState } from '@/lib/bench';
import { TEMPLATE_RE, type FieldConfig, type MasterAction, type MasterShape, type MasterWidget, type Num } from '@/lib/lab-masters';

type Pt = { x: number; y: number };

export function FieldStage({ spec, cfg, st, running: live, auto, act, toScene }: {
  spec: BenchSpec; cfg: FieldConfig; st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; toScene: (clientX: number, clientY: number) => Pt | null;
}) {
  const env = benchEnv(spec, st);
  const ok = (e?: string) => { if (!e) return true; try { return !!evalExpr(e, env); } catch { return false; } };
  const pick = <T,>(list: { when: string }[] | undefined, key: 'text' | 'color', fallback: T): T => { const hit = list?.find(x => ok(x.when)) as any; return hit ? hit[key] : fallback; };
  const num = (e: string) => { try { return evalExpr(e, env); } catch { return 0; } };
  const fill = (t: string) => t.replace(TEMPLATE_RE, (_, e: string, d?: string) => num(e).toFixed(d ? +d : 0));
  /** 坐标 / 尺寸 / 透明度：数字原样，字符串当表达式求值 */
  const N = (v: Num | undefined, d = 0) => v === undefined ? d : typeof v === 'number' ? v : num(v);
  const toolCtl = cfg.toolControl || 'tool';
  const tool = Math.round(st.controls[toolCtl] || 0);
  const canAct = live && !auto;
  const [hand, setHand] = useState<Pt | null>(null);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState<MasterAction['flash'] | null>(null);
  const [reading, setReading] = useState<{ title: string; text: string } | null>(null);
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };
  // 趋势曲线的历史：每推进一拍记一帧（只在组件里，重来时台面会 remount 清空）
  const hist = useRef<number[][]>([]);
  const lastT = useRef(-1);
  const trends = (cfg.widgets || []).filter((w): w is Extract<MasterWidget, { kind: 'trend' }> => w.kind === 'trend');
  if (trends.length && st.t !== lastT.current) {
    lastT.current = st.t;
    hist.current.push(trends.flatMap(w => w.series.map(x => num(x.expr))));
    const cap = Math.max(...trends.map(w => w.points || 240));
    if (hist.current.length > cap) hist.current.shift();
  }

  const run = (a: MasterAction) => {
    if (!canAct) return;
    const g = a.guards?.find(x => ok(x.when));
    if (g) { say(g.say); return; }
    if (a.needTool !== undefined && tool !== a.needTool) { say(a.toolMsg || `先拿${cfg.tools?.find(t => t.v === a.needTool)?.label || '对的工具'}`); return; }
    // 话和读数都按点下去那一刻的状态挑（「有电时验电笔亮」）
    const line = fill(pick(a.sayWhen, 'text', a.say || ''));
    const rd = a.readout ? { title: fill(pick(a.readout.titleWhen, 'text', a.readout.title)), text: fill(pick(a.readout.textWhen, 'text', a.readout.text)) } : null;
    for (const x of a.act || []) act(x.control, typeof x.value === 'string' ? num(x.value) : x.value ?? 1);
    if (line) say(line);
    if (rd) setReading(rd);
    if (a.flash) { setFlash(a.flash); setTimeout(() => setFlash(null), 1500); }
  };

  const steps = cfg.steps || [];
  const done = steps.map(s => ok(s.done));
  const cur = done.findIndex(d => !d);
  const wantTool = cfg.wantTool ? num(cfg.wantTool) : cur >= 0 ? steps[cur].tool : undefined;
  const ta = cfg.toolsAt || { x: 40, y: 40 };
  const sa = cfg.sayAt || { x: 470, y: 0, w: 620 };
  const stp = cfg.stepsAt || { x: 1150, y: 680, w: 400 };
  const cols = stp.cols || 1, rows = Math.ceil(steps.length / cols), head = stp.title ? 36 : 0;
  const ra = cfg.readoutAt || { x: 880, y: 120, w: 520 };

  const shape = (sh: MasterShape, i: number) => {
    if (!ok(sh.when)) return null;
    const color = pick(sh.colorWhen, 'color', sh.color || '#c7cbe6');
    const x = N(sh.x), y = N(sh.y), op = sh.opacity === undefined ? undefined : N(sh.opacity);
    const filter = sh.blur ? `url(#bench-blur${sh.blur === 'sm' ? '-sm' : ''})` : undefined;
    const pulse = sh.pulse ? <animate attributeName="opacity" values="1;.4;1" dur=".6s" repeatCount="indefinite" /> : null;
    switch (sh.kind) {
      case 'line': return <line key={i} x1={x} y1={y} x2={N(sh.x2)} y2={N(sh.y2)} stroke={color} strokeWidth={sh.width || 4} strokeDasharray={sh.dash} strokeLinecap="round" opacity={op} />;
      case 'rect': return <rect key={i} x={x} y={y} width={Math.max(0, N(sh.w))} height={Math.max(0, N(sh.h))} rx={N(sh.rx, 8)} fill={sh.fill || 'none'} stroke={sh.fill && !sh.color ? 'none' : color} strokeWidth={sh.width ?? 2} strokeDasharray={sh.dash} opacity={op} filter={filter}>{pulse}</rect>;
      case 'circle': return <circle key={i} cx={x} cy={y} r={Math.max(0, N(sh.r, 8))} fill={sh.fill || color} stroke={sh.fill ? color : 'none'} strokeWidth={sh.width ?? 0} opacity={op} filter={filter}>{pulse}</circle>;
      case 'ellipse': return <ellipse key={i} cx={x} cy={y} rx={Math.max(0, N(sh.rx))} ry={Math.max(0, N(sh.ry))} fill={sh.fill || color} opacity={op} filter={filter} />;
      case 'sparks': {
        const n = Math.round(N(sh.count, 8)), w = N(sh.w, 200), h = N(sh.h, 160);
        return <g key={i} opacity={op}>{Array.from({ length: n }, (_, k) => <circle key={k} cx={x + Math.sin(st.t * 7 + k * 1.7) * w / 2} cy={y - ((st.t * 90 + k * 37) % h)} r={2 + (k % 3)} fill={sh.fill || '#ffd166'} opacity={.8} />)}</g>;
      }
      case 'path': {
        const p = <path d={sh.d} fill={sh.fill || 'none'} stroke={sh.fill && !sh.color ? 'none' : color} strokeWidth={sh.width ?? (sh.fill ? 0 : 4)} strokeDasharray={sh.dash} opacity={op} filter={filter} />;
        if (sh.x === undefined && sh.rotate === undefined) return <g key={i}>{p}</g>;
        const r = sh.rotate || 0;
        return <g key={i} transform={`translate(${x} ${y})`}><g transform={`rotate(${r})`}>{p}{ok(sh.spinWhen) && !!sh.spinWhen && <animateTransform attributeName="transform" type="rotate" from={`${r}`} to={`${r + 360}`} dur="0.5s" repeatCount="indefinite" />}</g></g>;
      }
      case 'text': {
        const t = fill(pick(sh.textWhen, 'text', sh.text || ''));
        if (sh.wrap) return <foreignObject key={i} x={x} y={y} width={sh.wrap} height={(sh.size || 14) * 4} pointerEvents="none"><div style={{ color, fontSize: sh.size || 14, fontWeight: sh.weight || 600, lineHeight: 1.45, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif' }}>{t}</div></foreignObject>;
        return <text key={i} x={x} y={y} fill={color} fontSize={sh.size || 14} fontWeight={sh.weight || 600} textAnchor={sh.anchor || 'start'} fontFamily={sh.mono ? 'ui-monospace, Menlo, monospace' : undefined} opacity={op} pointerEvents="none">{t}</text>;
      }
    }
  };

  const press = (on: boolean, fn: () => void) => ({ style: { cursor: canAct ? 'pointer' : 'default' }, onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); if (on) fn(); } });
  let seriesAt = 0;
  const widget = (w: MasterWidget, i: number) => {
    if (w.kind === 'knob') {
      const val = st.controls[w.control] ?? w.min, f = (val - w.min) / (w.max - w.min), ang = -135 + f * 270, rad = (a: number) => (a - 90) * Math.PI / 180;
      const step = (d: number) => act(w.control, Math.round(Math.max(w.min, Math.min(w.max, val + d)) * 1000) / 1000);
      return <g key={i}>
        <text x={w.x} y={w.y - 64} textAnchor="middle" fill="#c7cbe6" fontSize={13} fontWeight={800}>{w.label}</text>
        <circle cx={w.x} cy={w.y} r={50} fill="#1b1f2a" stroke="rgba(255,255,255,.25)" strokeWidth={3} />
        <path d={`M ${w.x + 50 * Math.cos(rad(-135))} ${w.y + 50 * Math.sin(rad(-135))} A 50 50 0 ${f > 0.5 ? 1 : 0} 1 ${w.x + 50 * Math.cos(rad(ang))} ${w.y + 50 * Math.sin(rad(ang))}`} fill="none" stroke={w.color || '#7cc8ff'} strokeWidth={6} strokeLinecap="round" />
        <line x1={w.x} y1={w.y} x2={w.x + 38 * Math.cos(rad(ang))} y2={w.y + 38 * Math.sin(rad(ang))} stroke="#fff" strokeWidth={4} strokeLinecap="round" />
        <text x={w.x} y={w.y + 76} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={800}>{val.toFixed(w.digits ?? 0)} {w.unit || ''}</text>
        {([-1, 1] as const).map(sg => <g key={sg} {...press(canAct, () => step(sg * w.step))}><circle cx={w.x + sg * 70} cy={w.y + 70} r={16} fill="rgba(255,255,255,.14)" stroke="#fff" strokeWidth={1.5} /><text x={w.x + sg * 70} y={w.y + 76} textAnchor="middle" fill="#fff" fontSize={18} fontWeight={800} pointerEvents="none">{sg < 0 ? '−' : '+'}</text></g>)}
      </g>;
    }
    if (w.kind === 'bar') {
      const f = Math.max(0, Math.min(1, (num(w.expr) - w.min) / (w.max - w.min))), c = pick(w.colorWhen, 'color', w.color || '#c9a24a');
      return <g key={i} pointerEvents="none">
        <rect x={w.x} y={w.y} width={w.w} height={w.h} rx={6} fill="rgba(0,0,0,.5)" stroke="rgba(255,255,255,.3)" />
        <rect x={w.x + 3} y={w.y + 3 + (1 - f) * (w.h - 6)} width={w.w - 6} height={f * (w.h - 6)} rx={4} fill={c} />
        {w.label && <text x={w.x + w.w / 2} y={w.y - 10} textAnchor="middle" fill="#c7cbe6" fontSize={11.5}>{w.label}</text>}
        <text x={w.x + w.w / 2} y={w.y + w.h + 20} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={800}>{num(w.expr).toFixed(w.digits ?? 0)}</text>
      </g>;
    }
    // trend
    const base = seriesAt; seriesAt += w.series.length;
    const cap = w.points || 240, rows = hist.current;
    return <g key={i} pointerEvents="none">
      <rect x={w.x} y={w.y} width={w.w} height={w.h} rx={8} fill="rgba(0,0,0,.5)" stroke="rgba(255,255,255,.15)" />
      {w.series.map((s, k) => { const Y = (v: number) => w.y + w.h - ((Math.max(s.min, Math.min(s.max, v)) - s.min) / (s.max - s.min)) * w.h; return <g key={k}>
        {s.band && <rect x={w.x} y={Y(s.band[1])} width={w.w} height={Math.max(2, Y(s.band[0]) - Y(s.band[1]))} fill={s.color} opacity={.24} />}
        {rows.length > 1 && <path d={rows.map((r, j) => `${j ? 'L' : 'M'} ${w.x + (j / (cap - 1)) * w.w} ${Y(r[base + k])}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.5} />}
        {s.label && <text x={k % 2 ? w.x + w.w - 8 : w.x + 8} y={w.y + 16 + Math.floor(k / 2) * 16} textAnchor={k % 2 ? 'end' : 'start'} fill={s.color} fontSize={11}>{s.label}</text>}
      </g>; })}
    </g>;
  };

  return (
    <g onPointerMove={e => { const p = toScene(e.clientX, e.clientY); if (p) setHand(p); }} onPointerLeave={() => setHand(null)}>
      <rect x={0} y={0} width={1600} height={900} fill={cfg.bg || `rgba(10,12,30,${cfg.dim ?? 0.35})`} />
      {/* 面板（操作票 / 读数牌） */}
      {(cfg.panels || []).map((p, i) => { const paper = p.tone !== 'dark'; return (
        <g key={`p${i}`}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={14} fill={paper ? '#fffdf5' : 'rgba(12,16,32,.7)'} stroke={paper ? '#c9a24a' : 'rgba(255,255,255,.22)'} strokeWidth={2} />
          {p.title && <text x={p.x + 20} y={p.y + 30} fill={paper ? '#5a4a10' : '#ffd166'} fontSize={15} fontWeight={800}>{p.title}</text>}
          {(p.lines || []).map((l, j) => { const d = !!l.done && ok(l.done); return <text key={j} x={p.x + 20} y={p.y + 60 + j * 30} fill={d ? '#12a150' : paper ? '#5a4a10' : '#c7cbe6'} fontSize={13.5} fontWeight={d ? 800 : 500}>{d ? '✓ ' : '· '}{l.text}</text>; })}
          {p.footer && <text x={p.x + 20} y={p.y + p.h - 20} fill={paper ? '#9a7b1a' : '#9aa0b8'} fontSize={12}>{p.footer}</text>}
        </g>); })}
      {(cfg.shapes || []).map(shape)}
      {(cfg.widgets || []).map(widget)}
      {flash && <circle cx={flash.x} cy={flash.y} r={flash.r || 30} fill={flash.color || '#ffd166'} opacity={.7} pointerEvents="none"><animate attributeName="r" values={`10;${(flash.r || 30) + 10};10`} dur="0.6s" repeatCount="indefinite" /></circle>}
      {/* 按钮 */}
      {(cfg.buttons || []).map((b, i) => { if (b.when && !ok(b.when)) return null; const lit = ok(b.litWhen) && !!b.litWhen; return (
        <g key={`b${i}`} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); run(b.action); }}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={lit ? (b.litColor || '#12a150') : (b.color || '#3b4254')} stroke="#fff" strokeWidth={2} />
          <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 5} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={800} pointerEvents="none">{pick(b.labelWhen, 'text', b.label)}</text>
        </g>); })}
      {/* 热区（透明，悬停出提示） */}
      {(cfg.hotspots || []).filter(h => !h.when || ok(h.when)).map(h => (
        <rect key={h.id} x={h.x} y={h.y} width={h.w} height={h.h} rx={8} fill="transparent" style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); run(h.action); }}><title>{h.title}</title></rect>
      ))}
      {/* 工具盘：这一步该拿的那件发光 */}
      {!!cfg.tools?.length && <g>
        <rect x={ta.x} y={ta.y} width={24 + cfg.tools.length * 88} height={70} rx={14} fill="rgba(12,16,32,.7)" stroke="rgba(255,255,255,.22)" strokeWidth={2} />
        {cfg.tools.map((t, i) => { const x = ta.x + 12 + i * 88, sel = tool === t.v, g = wantTool === t.v && !sel; return (
          <g key={t.v} style={{ cursor: canAct ? 'pointer' : 'default' }} onPointerDown={e => { e.stopPropagation(); if (canAct) { act(toolCtl, t.v); setReading(null); } }}>
            {g && <rect x={x - 3} y={ta.y + 5} width={82} height={60} rx={12} fill="none" stroke="#ffd166" strokeWidth={3}><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite" /></rect>}
            <rect x={x} y={ta.y + 8} width={76} height={54} rx={10} fill={sel ? 'rgba(106,92,255,.92)' : 'rgba(255,255,255,.14)'} stroke={sel ? '#fff' : 'rgba(255,255,255,.3)'} strokeWidth={sel ? 3 : 1.5} />
            <text x={x + 38} y={ta.y + 32} textAnchor="middle" fontSize={20} pointerEvents="none">{t.icon}</text>
            <text x={x + 38} y={ta.y + 54} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700} pointerEvents="none">{t.label}</text>
          </g>); })}
      </g>}
      {reading && <g pointerEvents="none">
        {(ra.h ?? 120) < 80 ? <>
          <rect x={ra.x} y={ra.y} width={ra.w} height={ra.h} rx={12} fill="rgba(61,220,151,.18)" stroke="#3ddc97" strokeWidth={2} />
          <text x={ra.x + 20} y={ra.y + 22} fill="#3ddc97" fontSize={13} fontWeight={800}>{reading.title}</text>
          <text x={ra.x + 20} y={ra.y + 46} fill="#fff" fontSize={14} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{reading.text}</text>
        </> : <>
          <rect x={ra.x} y={ra.y} width={ra.w} height={ra.h ?? 120} rx={14} fill="#0f1224" stroke="#ffd166" strokeWidth={2} />
          <text x={ra.x + 20} y={ra.y + 30} fill="#9aa0b8" fontSize={13}>{reading.title}</text>
          <text x={ra.x + 20} y={ra.y + 80} fill="#ffd166" fontSize={26} fontWeight={800} fontFamily="ui-monospace, Menlo, monospace">{reading.text}</text>
        </>}
      </g>}
      {msg && <g pointerEvents="none"><rect x={sa.x} y={sa.y} width={sa.w} height={40} fill="rgba(255,95,162,.9)" /><text x={sa.x + sa.w / 2} y={sa.y + 26} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{msg}</text></g>}
      {/* 步骤清单 */}
      {!!steps.length && <g pointerEvents="none">
        <rect x={stp.x} y={stp.y} width={stp.w} height={24 + head + rows * 28} rx={14} fill="rgba(12,16,32,.72)" stroke="rgba(255,255,255,.2)" strokeWidth={1.5} />
        {stp.title && <text x={stp.x + 24} y={stp.y + 34} fill="#ffd166" fontSize={stp.titleSize || 20} fontWeight={800}>{stp.title}</text>}
        {steps.map((s, i) => { const cx = stp.x + 22 + (i % cols) * ((stp.w - 20) / cols), cy = stp.y + head + 26 + Math.floor(i / cols) * 28; return <g key={i}>
          <circle cx={cx} cy={cy} r={7} fill={done[i] ? '#3ddc97' : i === cur ? '#ffd166' : 'transparent'} stroke={done[i] ? '#3ddc97' : i === cur ? '#ffd166' : 'rgba(255,255,255,.4)'} strokeWidth={2} />
          <text x={cx + 16} y={cy + 5} fill={done[i] ? '#3ddc97' : i === cur ? '#fff' : 'rgba(255,255,255,.55)'} fontSize={cols > 1 ? 14 : 12.5} fontWeight={i === cur ? 800 : 500}>{i + 1}. {s.label}</text>
        </g>; })}
      </g>}
      {hand && canAct && !!cfg.tools?.length && <text x={hand.x + 18} y={hand.y + 26} fontSize={30} pointerEvents="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))' }}>{cfg.tools.find(t => t.v === tool)?.icon}</text>}
    </g>
  );
}
