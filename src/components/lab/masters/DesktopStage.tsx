'use client';

/**
 * 母版 A 桌面工作站（桌边 N 个程序）：顶栏 + 2–3 栏或图标坞 + 窗口；表格 / 卡片名单 / 详情 / 便签 / 选项组 / 下拉 / 按钮 / 写作框（src/lib/masters/desktop.ts 的 DesktopConfig）。
 * 挂在 BenchRunner：HTML 整屏（沉浸模式走浅色 LIGHT 版面，非沉浸盖在场景 svg 上）。
 * 点了以后的事全在配置里（DAction）：拨哪些控件（隐藏控件走 setHidden）、改台面小状态 ui、说什么、过几秒再做什么；
 * 演示回放时脚本直接拨控件，靠 cfg.watch 把台面状态（划掉的行、问过的病人）补上。
 * 真做不成通用的部件登记在 DESKTOP_PLUGINS（按名字），配置里用 { kind: 'custom', plugin }。
 */
import React, { useEffect, useRef, useState } from 'react';
import { benchEnv, evalExpr, type BenchState } from '@/lib/bench';
import type { MasterStageProps } from '@/lib/lab-masters';
import { TPL_RE, isPath, parsePath, parseTpl, rootsOf, subPaths, type DAction, type DBlock, type DButton, type DCol, type DPane, type DRow, type DTone, type DTopItem, type DesktopConfig } from '@/lib/masters/desktop';
import { WaveformPlugin } from '@/components/lab/masters/plugins/waveform';

type UiVal = number | string | Record<string, number | string>;
type Ui = Record<string, UiVal>;
export type DCtx = { row?: DRow; ev?: { value: number; t: number } };
type Val = number | string | undefined;

/** 插件拿到的东西：求值 / 填模板 / 执行动作 */
export interface DesktopPluginProps { block: Extract<DBlock, { kind: 'custom' }>; ctx: DCtx; st: BenchState; canAct: boolean; num: (e: string, ctx?: DCtx) => number; fill: (t: string, ctx?: DCtx) => string; run: (a: DAction, ctx?: DCtx) => void }
/** 插件登记处：名字 → 组件（plugins/ 下各一个文件，只 `import type` 本文件） */
export const DESKTOP_PLUGINS: Record<string, React.ComponentType<DesktopPluginProps>> = { waveform: WaveformPlugin };

const INK = '#171a2e', GRAY = '#6b7089', LINE = 'rgba(23,26,46,.08)', OFF = '#c9cbe0';
const FONT = 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', MONO = 'ui-monospace, Menlo, monospace';
const TONES: Record<DTone, { bg: string; fg: string; w: number }> = {
  pink: { bg: '#ffe3ec', fg: '#d6336c', w: 700 }, violet: { bg: '#e9e6ff', fg: '#4b3fd6', w: 700 }, alarm: { bg: '#d6336c', fg: '#fff', w: 800 },
  green: { bg: '#e6f6ec', fg: '#12a150', w: 700 }, gray: { bg: '#eef0f6', fg: GRAY, w: 600 },
};
const BTN: Record<Exclude<DButton['tone'], 'toggle' | undefined>, { bg: string; fg: string; off?: string; border?: string; w: number }> = {
  primary: { bg: '#6a5cff', fg: '#fff', off: OFF, w: 800 }, ghost: { bg: '#fff', fg: INK, border: '1px solid rgba(23,26,46,.15)', w: 700 },
  dark: { bg: INK, fg: '#fff', off: OFF, w: 800 }, violet: { bg: '#6a5cff', fg: '#fff', w: 700 }, teal: { bg: '#12b5cb', fg: '#fff', w: 700 },
  gradient: { bg: 'linear-gradient(135deg,#6a5cff,#12b5cb)', fg: '#fff', off: OFF, w: 800 },
};

/** 求值器：env 是那一刻的 bench 环境；ui / 控件读的是活的 */
function makeEval(cfg: DesktopConfig, roots: Set<string>, env: Record<string, number>, ui: Ui, controls: Record<string, number>) {
  const resolve = (path: string, ctx: DCtx): Val => {
    const { head, segs } = parsePath(path);
    if (head === 'ctl') {
      let name = '';
      for (const s of segs) name += 'f' in s ? s.f : String(Math.round(num(s.i, ctx)));
      return controls[name];
    }
    let cur: any = head === 'row' ? ctx.row : head === 'ev' ? ctx.ev : head === 'ui' ? ui : cfg.data?.[head];
    for (const s of segs) {
      if (cur === undefined || cur === null) return undefined;
      if ('f' in s) { cur = cur[s.f]; continue; }
      const k = val(s.i, ctx);
      if (Array.isArray(cur)) cur = cur.find((r: DRow) => typeof k === 'number' ? Number(r.id) === Math.round(k) : String(r.id) === k);
      else cur = cur[typeof k === 'number' ? String(Math.round(k)) : String(k)];
    }
    return typeof cur === 'number' || typeof cur === 'string' ? cur : undefined;
  };
  const asNum = (v: Val) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0; };
  /** 表达式 → 数（路径先换成数） */
  const num = (e: string, ctx: DCtx = {}): number => {
    try { return evalExpr(subPaths(e, roots, p => { const n = asNum(resolve(p, ctx)); return n < 0 ? `(${n})` : String(n); }), env); } catch { return 0; }
  };
  /** 整条是路径就原样取（可能是字符串），否则当表达式 */
  const val = (e: string, ctx: DCtx = {}): Val => isPath(e, roots) ? resolve(e, ctx) : num(e, ctx);
  const ok = (e: string | undefined, ctx: DCtx = {}) => !e || !!num(e, ctx);
  const fmt = (v: Val, f?: string): string => {
    if (v === undefined) return '';
    if (typeof v === 'string') return v;
    if (f === ',') return Math.round(v).toLocaleString();
    if (f === 'i') return String(Math.floor(v));
    if (f === 'i2') return String(Math.floor(v)).padStart(2, '0');
    if (f) return v.toFixed(+f);
    return String(Math.round(v * 1000) / 1000);
  };
  const fill = (t: string | undefined, ctx: DCtx = {}): string => (t || '').replace(TPL_RE, (_, inner: string) => {
    const { expr, fmt: f, fb } = parseTpl(inner);
    const v = val(expr, ctx);
    return (v === undefined || v === '') && fb !== undefined ? fb : fmt(v, f);
  });
  const pick = (list: { when: string }[] | undefined, key: 'text' | 'color', fallback: string | undefined, ctx: DCtx = {}) => {
    const hit = list?.find(x => ok(x.when, ctx)) as any;
    return fill(hit ? hit[key] : fallback, ctx);
  };
  return { num, val, ok, fill, pick };
}

export function DesktopStage({ spec, cfg, st, running, auto, act, setHidden }: MasterStageProps<DesktopConfig>) {
  const canAct = running && !auto;
  const roots = rootsOf(cfg);
  const ui = useRef<Ui>(JSON.parse(JSON.stringify(cfg.ui || {})));
  const [, rerender] = useState(0);
  const [toast, setToast] = useState<{ text: string; tone: DTone; n: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const z = useRef<string[]>([]);   // dock 版面：窗口叠放顺序（最后一个在最上面）
  const live = useRef({ st, canAct, act, setHidden });
  live.current = { st, canAct, act, setHidden };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  for (const p of cfg.panes) if (p.id && ui.current[`win_${p.id}`] === undefined) ui.current[`win_${p.id}`] = p.open === false ? 0 : 1;
  // 带 demoText 的写作框（演示时补上老手写的那段）
  const demoWrites = useRef<{ control: string; text: string }[] | null>(null);
  if (!demoWrites.current) {
    const out: { control: string; text: string }[] = [];
    const scan = (o: unknown) => {
      if (Array.isArray(o)) o.forEach(scan);
      else if (o && typeof o === 'object') { const b = o as Partial<Extract<DBlock, { kind: 'write' }>>; if (b.kind === 'write' && b.demoText && b.control) out.push({ control: b.control, text: b.demoText }); Object.values(o).forEach(scan); }
    };
    scan([cfg.panes, cfg.dock?.empty]); demoWrites.current = out;
  }
  /** dock 窗口管理：开过的窗口（值 → 打开顺序） */
  const dockOpen = () => { const m = ui.current.dock_open; return (m && typeof m === 'object' ? m : {}) as Record<string, number>; };

  const E = makeEval(cfg, roots, benchEnv(spec, st), ui.current, st.controls);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const say = (text: string, tone: DTone, ms: number) => {
    if (!text) return;
    const n = Date.now() + Math.random();
    setToast({ text, tone, n });
    later(ms, () => setToast(t => t?.n === n ? null : t));
  };
  const write = (id: string, v: number) => {
    const c = spec.controls.find(x => x.id === id);
    if (!c) return;
    if (c.hidden) live.current.setHidden(id, v); else live.current.act(id, v);
  };

  /** 执行一个动作：点击要 canAct；定时器 / watch 触发的不拦（和代码版的 setTimeout 一样） */
  const run = (a: DAction, ctx: DCtx = {}, gate = true) => {
    const L = live.current;
    if (gate && !L.canAct) return;
    // 条件和取值都按这一刻的快照算（代码版读的是渲染时的 st）
    const X = makeEval(cfg, roots, benchEnv(spec, L.st), ui.current, { ...L.st.controls });
    const exec = (a: DAction) => {
      if (a.when && !X.ok(a.when, ctx)) return;
      for (const s of a.set || []) write(X.fill(s.control, ctx), s.value === undefined ? 1 : typeof s.value === 'number' ? s.value : X.num(s.value, ctx));
      for (const u of a.ui || []) {
        const v: number | string = u.text !== undefined ? X.fill(u.text, ctx) : u.value === undefined ? 1 : typeof u.value === 'number' ? u.value : X.num(u.value, ctx);
        if (u.at === undefined) ui.current[u.name] = v;
        else {
          const k = X.val(u.at, ctx), key = typeof k === 'number' ? String(Math.round(k)) : String(k ?? '');
          const m = ui.current[u.name];
          ui.current[u.name] = { ...(m && typeof m === 'object' ? m : {}), [key]: v };
        }
      }
      if (a.first) { const hit = a.first.find(x => !x.when || X.ok(x.when, ctx)); if (hit) exec(hit); }
      for (const x of a.all || []) exec(x);
      if (a.say) say(X.fill(a.say, ctx), a.tone || cfg.sayTone || 'pink', a.ms || cfg.sayMs || 2600);
      if (a.after) { const d = a.after.do; later(a.after.ms, () => run(d, ctx, false)); }
    };
    exec(a);
    rerender(x => x + 1);
  };

  // watch：隐藏控件看值、其余看新事件；announce：实体出现就播报（都在渲染后做，不在渲染里改状态）
  // replay 的 watch 从头看事件流，其余从挂上那一刻看起（start 之前的跳过）
  const seen = useRef<{ idx: number; start: number; vals: Record<string, number>; counts: number[] } | null>(null);
  if (!seen.current) {
    const replay = (cfg.watch || []).some(w => w.replay);
    seen.current = { idx: replay ? 0 : st.events.length, start: st.events.length, vals: { ...st.controls }, counts: (cfg.announce || []).map(() => 0) };
  }
  useEffect(() => {
    const S = seen.current!;
    for (const w of cfg.watch || []) {
      const c = spec.controls.find(x => x.id === w.control);
      if (!c?.hidden) continue;
      const v = st.controls[w.control];
      if (v !== S.vals[w.control]) { S.vals[w.control] = v; run(w.do, { ev: { value: v, t: st.t } }, false); }
    }
    const from = S.idx, fresh = st.events.slice(from); S.idx = st.events.length;
    fresh.forEach((e, k) => {
      if (e.kind !== 'control') return;
      for (const w of cfg.watch || []) if (w.control === e.control && (w.replay || from + k >= S.start)) run(w.do, { ev: { value: e.value ?? 0, t: e.t } }, false);
    });
    // dock：前台窗口记进「开过的」（任务栏），演示时脚本拨控件也一样
    if (cfg.dock) {
      const v = Math.round(st.controls[cfg.dock.control] || 0), m = dockOpen();
      if (v && m[v] === undefined) { const n = Number(ui.current.dock_n || 0) + 1; ui.current.dock_n = n; ui.current.dock_open = { ...m, [v]: n }; rerender(x => x + 1); }
    }
    // 演示：字数控件有了而框里没字，填上老手写的那段
    if (auto) for (const w of demoWrites.current!) if ((st.controls[w.control] || 0) > 0 && !ui.current[`text_${w.control}`]) { ui.current[`text_${w.control}`] = w.text; rerender(x => x + 1); }
    (cfg.announce || []).forEach((a, i) => {
      const rows = (cfg.data?.[a.from] || []).filter(row => E.ok(a.when, { row }));
      if (rows.length > S.counts[i]) { S.counts[i] = rows.length; say(E.fill(a.say, { row: rows[rows.length - 1] }), a.tone || 'violet', a.ms || 3500); }
    });
  });

  // ──── 块 ────
  const button = (b: DButton, ctx: DCtx, key: React.Key) => {
    if (b.when && !E.ok(b.when, ctx)) return null;
    const on = E.ok(b.enabled, ctx), done = !!b.doneWhen && E.ok(b.doneWhen, ctx);
    if (b.tone === 'toggle') {
      const lit = !!b.litWhen && E.ok(b.litWhen, ctx), col = b.color || '#6a5cff';
      return (
        <button key={key} disabled={!canAct || !on} onClick={() => run(b.action, ctx)} style={{
          border: `1px solid ${lit && b.color ? col : 'rgba(23,26,46,.14)'}`, background: lit ? col : '#fff', color: lit ? '#fff' : INK, borderRadius: 10, padding: '6px 12px',
          fontSize: 13, fontWeight: 700, cursor: canAct ? 'pointer' : 'default', opacity: b.dimWhen && E.ok(b.dimWhen, ctx) ? 0.5 : undefined, marginLeft: b.push ? 'auto' : undefined, marginTop: b.mt, flexShrink: 0,
        }}>{E.pick(b.labelWhen, 'text', b.label, ctx)}</button>
      );
    }
    const T = BTN[b.tone || 'primary'], size = b.size || 'md';
    const bg = done ? '#e6f6ec' : !on && T.off ? T.off : T.bg, fg = done ? '#12a150' : T.fg;
    const pad = size === 'sm' ? '6px 12px' : size === 'lg' ? (b.full ? '14px 0' : '14px 18px') : b.full ? '9px 0' : '7px 14px';
    return (
      <button key={key} disabled={!canAct || !on || done} onClick={() => run(b.action, ctx)} style={{
        padding: pad, borderRadius: size === 'lg' ? 12 : 8, border: T.border && !done ? T.border : 'none', background: bg, color: fg, fontWeight: T.w,
        fontSize: size === 'sm' ? 13 : size === 'lg' ? 15 : undefined, width: b.full ? '100%' : undefined, marginTop: b.push ? 'auto' : b.mt,
        cursor: canAct && on && !done ? 'pointer' : 'default', flexShrink: 0,
      }}>{E.pick(b.labelWhen, 'text', b.label, ctx)}</button>
    );
  };

  const cell = (c: DCol, ctx: DCtx, i: number, plain = false) => (
    <td key={i} style={{ padding: c.pad || '7px 8px', borderBottom: plain ? undefined : '1px solid rgba(23,26,46,.06)',fontFamily: c.mono ? MONO : undefined, fontSize: c.size || 13, textAlign: c.align, fontWeight: c.weight,
      color: c.color || c.colorWhen ? E.pick(c.colorWhen, 'color', c.color, ctx) || undefined : undefined, whiteSpace: c.nowrap ? 'nowrap' : undefined, width: c.width }}>{E.pick(c.textWhen, 'text', c.text, ctx)}</td>
  );

  const blocks = (list: DBlock[] | undefined, ctx: DCtx) => (list || []).map((b, i) => block(b, ctx, i));
  const block = (b: DBlock, ctx: DCtx, key: React.Key): React.ReactNode => {
    if (b.kind !== 'button' && b.when && !E.ok(b.when, ctx)) return null;
    const grow: React.CSSProperties = b.grow ? { flex: 1, minHeight: 0 } : {};
    switch (b.kind) {
      case 'button': return button(b, ctx, key);
      case 'label': return <div key={key} style={{ fontSize: 12, color: GRAY, marginBottom: b.mb ?? 6, marginTop: b.mt, letterSpacing: b.spaced ? '.06em' : undefined }}>{E.fill(b.text, ctx)}</div>;
      case 'text': return <div key={key} style={{ fontSize: b.size || 14, color: E.pick(b.colorWhen, 'color', b.color || GRAY, ctx), marginTop: b.mt, marginBottom: b.mb, lineHeight: b.lh, fontWeight: b.weight }}>{E.pick(b.textWhen, 'text', b.text, ctx)}</div>;
      case 'spacer': return <span key={key} style={{ marginLeft: 'auto' }} />;
      case 'box': {
        const row = b.dir === 'row', line = `1px solid ${LINE}`;
        return (
          <div key={key} style={{ display: 'flex', flexDirection: row ? 'row' : 'column', alignItems: row ? 'center' : undefined, flexWrap: b.wrap ? 'wrap' : undefined, gap: b.gap, padding: b.pad, background: b.bg,
            overflow: b.scroll ? 'auto' : undefined, borderTop: b.border === 'top' ? line : undefined, borderBottom: b.border === 'bottom' ? line : undefined, marginTop: b.mt, flexShrink: b.grow ? undefined : 0, ...grow }}>
            {blocks(b.blocks, ctx)}
          </div>);
      }
      case 'code': return (
        <pre key={key} style={{ margin: 0, marginTop: b.mt, background: '#0f1224', color: '#d9dcef', padding: 14, borderRadius: 10, fontFamily: MONO, fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre' }}>
          {b.parts.map((p, i) => {
            const t = E.pick(p.textWhen, 'text', p.text, ctx), hl = p.hl || p.hlWhen ? E.pick(p.hlWhen, 'color', p.hl, ctx) : '';
            return hl ? <span key={i} style={{ background: hl, display: 'inline-block', width: '100%' }}>{t}</span> : <React.Fragment key={i}>{t}</React.Fragment>;
          })}
        </pre>);
      case 'stats': return (
        <div key={key} style={{ display: 'grid', gap: 10, gridTemplateColumns: `repeat(${b.cols || b.items.length}, 1fr)`, marginTop: b.mt }}>
          {b.items.map((x, i) => <div key={i} style={{ padding: '12px 14px', borderRadius: 12, background: '#f3f4fa' }}>
            <div style={{ fontSize: 12, color: GRAY }}>{E.fill(x.label, ctx)}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: E.pick(x.colorWhen, 'color', x.color || INK, ctx) }}>{E.pick(x.textWhen, 'text', x.text, ctx)}</div>
          </div>)}
        </div>);
      case 'line': return <div key={key} style={{ marginTop: b.mt, fontSize: b.size || 14, color: b.color }}>{b.label && <b>{E.fill(b.label, ctx)}</b>}{E.fill(b.text, ctx)}</div>;
      case 'head': return (
        <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: b.mt }}>
          <b style={{ fontSize: 20 }}>{E.fill(b.title, ctx)}</b>{b.sub && <span style={{ color: GRAY }}>{E.fill(b.sub, ctx)}</span>}
          {b.right && <span style={{ marginLeft: 'auto', fontSize: 12.5, color: GRAY }}>{E.fill(b.right, ctx)}</span>}
        </div>);
      case 'note': return <div key={key} style={{ background: '#fff6c2', borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.65, color: '#5a4a10', minHeight: 90, marginTop: b.mt, ...grow }}>{E.pick(b.textWhen, 'text', b.text, ctx)}</div>;
      case 'card': return (
        <div key={key} style={{ background: '#fff', borderRadius: b.radius ?? 14, padding: b.pad ?? 16, border: `1px solid ${LINE}`, marginTop: b.mt, ...(b.grow ? { display: 'flex', flexDirection: 'column', ...grow } : {}) }}>
          {(b.title || b.buttons?.length) && <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>{b.title && <b>{E.fill(b.title, ctx)}</b>}<span style={{ marginLeft: 'auto' }} />{b.buttons?.map((x, i) => button(x, ctx, i))}</div>}
          {blocks(b.blocks, ctx)}
        </div>);
      case 'grid': return <div key={key} style={{ display: 'grid', gridTemplateColumns: b.cols, gap: b.gap ?? 14, marginTop: b.mt }}>{blocks(b.blocks, ctx)}</div>;
      case 'scope': {
        const at = E.val(b.at, ctx);
        const row = (cfg.data?.[b.from] || []).find(r => typeof at === 'number' ? Number(r.id) === Math.round(at) : String(r.id) === at);
        if (!row) return <React.Fragment key={key}>{blocks(b.empty, ctx)}</React.Fragment>;
        return <div key={key} style={{ display: 'grid', gap: b.gap ?? 14, marginTop: b.mt }}>{blocks(b.blocks, { ...ctx, row })}</div>;
      }
      case 'table': {
        const rows = (cfg.data?.[b.from] || []).filter(row => E.ok(b.filter, { row }));
        const plain = !!b.plain;
        return (
          <div key={key} style={plain ? { marginTop: b.mt, minHeight: 0, ...grow } : { background: '#fff', borderRadius: 14, border: `1px solid ${LINE}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: b.mt, ...grow }}>
            {b.title && <div style={{ padding: '10px 12px', fontWeight: 800, borderBottom: `1px solid ${LINE}`, background: '#f8f9fd', fontSize: 13.5 }}>{E.fill(b.title, ctx)}</div>}
            <div style={{ overflow: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: b.mono ? MONO : undefined, fontSize: b.size }}>
              {b.head && <thead><tr style={{ color: GRAY, textAlign: 'left', background: '#f8f9fd' }}>{b.head.map((h, i) => <th key={i} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(23,26,46,.1)' }}>{E.fill(h, ctx)}</th>)}</tr></thead>}
              <tbody>{rows.map(row => {
                const c = { ...ctx, row }, sel = !!b.selWhen && E.ok(b.selWhen, c), done = !!b.doneWhen && E.ok(b.doneWhen, c);
                const bg = sel ? '#efedff' : done ? '#f1f9f4' : b.rowBgWhen ? E.pick(b.rowBgWhen, 'color', 'transparent', c) : 'transparent';
                return (
                  <tr key={String(row.id)} onClick={() => b.action && run(b.action, c)} style={{ cursor: canAct && b.action ? 'pointer' : 'default', background: bg, color: done ? '#8a93a6' : INK, textDecoration: done ? 'line-through' : 'none' }}>
                    {b.cols.map((col, i) => cell(col, c, i, plain))}
                  </tr>);
              })}</tbody></table></div>
          </div>);
      }
      case 'cards': {
        const all = cfg.data?.[b.from] || [], rows = all.filter(row => E.ok(b.appear, { row }));
        return (
          <div key={key} style={{ marginTop: b.mt }}>
            {rows.map(row => {
              const c = { ...ctx, row }, sel = !!b.selWhen && E.ok(b.selWhen, c);
              const r = b.right, bold = !!r?.boldWhen && E.ok(r.boldWhen, c);
              return (
                <button key={String(row.id)} disabled={!canAct} onClick={() => b.action && run(b.action, c)} style={{ textAlign: 'left', width: '100%', padding: '10px 12px', marginBottom: 8, borderRadius: 12, border: sel ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: E.pick(b.bgWhen, 'color', b.bg || '#fff', c), cursor: canAct ? 'pointer' : 'default', color: INK, boxShadow: sel ? '0 8px 24px rgba(106,92,255,.18)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {b.dot && <span style={{ width: 10, height: 10, borderRadius: 5, background: E.fill(b.dot, c), flexShrink: 0 }} />}
                    <b style={{ fontSize: 14 }}>{E.fill(b.title, c)}</b>{b.sub && <span style={{ fontSize: 12, color: GRAY }}>{E.fill(b.sub, c)}</span>}
                    {r && <span style={{ marginLeft: 'auto', fontSize: 12, color: E.pick(r.colorWhen, 'color', r.color || GRAY, c), fontWeight: bold ? 800 : 500 }}>{E.pick(r.textWhen, 'text', r.text, c)}</span>}
                  </div>
                  {b.body && <div style={{ fontSize: 13, marginTop: 4, color: '#2b2f4a' }}>{E.fill(b.body, c)}</div>}
                  {(b.alerts || []).filter(x => E.ok(x.when, c)).map((x, i) => <div key={i} style={{ marginTop: 4, fontSize: 12.5, color: '#d6336c', fontWeight: 800 }}>{E.fill(x.text, c)}</div>)}
                </button>);
            })}
            {b.pending && rows.length < all.length && <div style={{ fontSize: 12.5, color: '#9aa0b8', marginTop: 6 }}>{E.fill(b.pending, ctx)}</div>}
          </div>);
      }
      case 'choices': {
        const on = E.ok(b.enabled, ctx), cur = Math.round(b.current ? E.num(b.current, ctx) : st.controls[b.control] || 0), row = b.dir === 'row';
        const pickOpt = (v: number) => b.action ? run(b.action, { ...ctx, ev: { value: v, t: st.t } }) : run({ set: [{ control: b.control, value: v }] }, ctx);
        if (b.look === 'list') return (
          <div key={key} style={{ marginTop: b.mt }}>
            {b.options.map(o => {
              const sel = cur === o.v;
              return (
                <button key={o.v} disabled={!canAct || !on || (!!b.lockSel && sel)} onClick={() => pickOpt(o.v)} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 8, padding: '10px 12px', borderRadius: 10,
                  border: sel ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: '#fff', cursor: canAct ? 'pointer' : 'default', fontSize: 13.5, color: INK }}>
                  <span style={{ fontFamily: b.mono ? MONO : undefined }}>{E.fill(o.label, ctx)}</span>
                  {sel && o.note && <div style={{ marginTop: 6, fontSize: 12.5, color: o.noteColor || GRAY }}>{E.fill(o.note, ctx)}</div>}
                </button>);
            })}
          </div>);
        return (
          <div key={key} style={{ display: 'flex', flexDirection: row ? 'row' : 'column', gap: row ? 6 : 12, marginTop: b.mt }}>
            {b.options.map(o => {
              const sel = cur === o.v;
              if (b.look === 'pill') return <button key={o.v} disabled={!canAct || !on} onClick={() => pickOpt(o.v)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: sel ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: sel ? '#efedff' : '#fff', fontWeight: 700, fontSize: 13, cursor: canAct && on ? 'pointer' : 'default', color: INK }}>{E.fill(o.label, ctx)}</button>;
              const col = o.color || '#6a5cff';
              return (
                <button key={o.v} disabled={!canAct || !on} onClick={() => pickOpt(o.v)} style={{ padding: '12px 14px', borderRadius: 12, textAlign: 'left', border: sel ? `2px solid ${col}` : '1px solid rgba(23,26,46,.12)', background: sel ? `${col}14` : '#fff', color: INK, fontWeight: 800, fontSize: 15, cursor: canAct && on ? 'pointer' : 'default' }}>
                  {o.color && <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: o.color, marginRight: 10 }} />}{E.fill(o.label, ctx)}
                  {o.sub && <div style={{ fontSize: 12, color: GRAY, fontWeight: 500, marginTop: 2 }}>{E.fill(o.sub, ctx)}</div>}
                </button>);
            })}
          </div>);
      }
      case 'select': {
        const on = E.ok(b.enabled, ctx);
        return (
          <select key={key} value={Math.round(st.controls[b.control] || 0)} disabled={!canAct || !on} onChange={e => run({ set: [{ control: b.control, value: Number(e.target.value) }] }, ctx)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(23,26,46,.16)', background: '#f8f9fd', color: INK, fontSize: 13.5, marginTop: b.mt }}>
            {b.options.map(o => <option key={o.v} value={o.v}>{E.fill(o.label, ctx)}</option>)}
          </select>);
      }
      case 'kv': return (
        <div key={key} style={{ display: 'grid', gridTemplateColumns: `repeat(${b.cols || 2}, 1fr)`, gap: 6, fontFamily: b.mono ? MONO : undefined, fontSize: 15, marginTop: b.mt }}>
          {b.items.map((x, i) => { const bad = !!x.bad && E.ok(x.bad, ctx); return <div key={i} style={{ padding: '6px 10px', borderRadius: 8, background: bad ? '#fff0f3' : '#f6f7fb', color: bad ? '#d6336c' : INK, fontWeight: bad ? 800 : 600 }}>{E.fill(x.label, ctx)}：{E.fill(x.text, ctx)}</div>; })}
        </div>);
      case 'write': {
        const tk = `text_${b.control}`, text = String(ui.current[tk] ?? ''), on = E.ok(b.enabled, ctx);
        const paper: React.CSSProperties = { flex: 1, minHeight: 0, border: 0, outline: 'none', resize: 'none', padding: 16, fontSize: 14, lineHeight: 1.75, fontFamily: 'inherit', background: '#fffdf5', color: INK };
        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', marginTop: b.mt, ...(b.grow ? { flex: 1, minHeight: 0 } : {}) }}>
            {b.label && <div style={{ fontSize: 12, color: GRAY, marginBottom: 6 }}>{E.fill(b.label, ctx)}</div>}
            {/* 默认和审计代码版一样：演示时也能打字，但只有自己操作时字数才进控件；autoEdit: false 演示时锁住 */}
            <textarea value={text} disabled={!on || (b.autoEdit === false ? !canAct : !canAct && !auto)} placeholder={b.placeholder} onChange={e => {
              const v = e.target.value; ui.current[tk] = v; rerender(x => x + 1);
              if (live.current.canAct) write(b.control, b.count === 'all' ? v.length : v.replace(/\s/g, '').length);
            }} style={b.look === 'paper' ? paper : { flex: 1, minHeight: 100, resize: 'none', padding: 10, borderRadius: 8, border: '1px solid rgba(23,26,46,.16)', background: '#fbfbfe', color: INK, fontSize: 13, lineHeight: 1.7 }} />
          </div>);
      }
      case 'custom': {
        const P = DESKTOP_PLUGINS[b.plugin];
        if (!P) return <div key={key} style={{ fontSize: 12, color: '#d6336c', marginTop: b.mt }}>未登记的插件：{b.plugin}</div>;
        return <div key={key} style={{ marginTop: b.mt, ...grow }}><P block={b} ctx={ctx} st={st} canAct={canAct} num={E.num} fill={E.fill} run={(a, c) => run(a, c ?? ctx)} /></div>;
      }
    }
  };

  const top = (it: DTopItem, i: number): React.ReactNode => {
    switch (it.kind) {
      case 'title': return <span key={i} style={{ fontWeight: 800, fontSize: 15 }}>{E.fill(it.text)}</span>;
      case 'sub': return <span key={i} style={{ fontSize: 12.5, color: GRAY }}>{E.fill(it.text)}</span>;
      case 'spacer': return <span key={i} style={{ marginLeft: 'auto' }} />;
      case 'toast': { if (!toast) return null; const T = TONES[toast.tone]; return <span key={i} style={{ padding: '5px 12px', borderRadius: 999, background: T.bg, color: T.fg, fontSize: 13, fontWeight: T.w }}>{toast.text}</span>; }
      case 'badge': { if (it.when && !E.ok(it.when)) return null; const T = TONES[it.tone || 'alarm']; return <span key={i} style={{ padding: '5px 12px', borderRadius: 999, background: T.bg, color: T.fg, fontSize: 13, fontWeight: T.w }}>{E.fill(it.text)}</span>; }
      case 'button': return button(it, {}, i);
    }
  };
  const gap = cfg.gap ?? 0;
  const topbar = (
    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, margin: gap ? `0 -${gap}px` : 0, padding: '0 18px', background: '#fff', borderBottom: '1px solid rgba(23,26,46,.1)', height: 52, flexShrink: 0 }}>
      {cfg.topbar.map(top)}
    </div>
  );
  const paneStyle = (p: DPane): React.CSSProperties => ({
    padding: p.pad, overflow: p.scroll ? 'auto' : 'hidden', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: p.gap, background: p.bg, fontSize: p.fs,
    borderLeft: p.border === 'left' ? `1px solid ${LINE}` : undefined, borderRight: p.border === 'right' ? `1px solid ${LINE}` : undefined,
  });
  const root: React.CSSProperties = { position: 'absolute', inset: 0, background: cfg.bg || '#f3f5fa', color: INK, fontFamily: FONT, overflow: 'hidden' };

  if (cfg.layout === 'dock' && cfg.dock) {
    // 窗口跟着控件走：前台 = 控件值对应的那个窗口（最大化），开过的进任务栏；点图标 / 任务栏 = 拨控件（走 act，评分看得见「开了哪个程序」）
    const D = cfg.dock, cur = Math.round(st.controls[D.control] || 0);
    const wins = cfg.panes.filter(p => p.v !== undefined), active = wins.find(p => p.v === cur);
    const opened = Object.entries(dockOpen()).sort((a, b) => a[1] - b[1]).map(([v]) => Number(v));
    const go = (v: number) => run({ set: [{ control: D.control, value: v }] });
    // 关窗口：和代码版一样不拦（没在操作时控件拨不动，下一拍又会记回任务栏末尾）
    const close = (p: DPane) => {
      const m = { ...dockOpen() }; delete m[String(p.v)]; ui.current.dock_open = m;
      const rest = opened.filter(v => v !== p.v);
      if (cur === p.v) go(rest[rest.length - 1] || 0);
      rerender(x => x + 1);
    };
    const tab = (on: boolean): React.CSSProperties => ({ border: '1px solid rgba(23,26,46,.14)', background: on ? '#6a5cff' : '#fff', color: on ? '#fff' : INK, borderRadius: 10, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: canAct ? 'pointer' : 'default' });
    return (
      <div style={{ ...root, display: 'flex', flexDirection: 'column' }}>
        {cfg.topbar.length > 0 && topbar}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <div style={{ position: 'absolute', left: 18, top: 18, display: 'grid', gap: 14, width: 96 }}>
            {wins.map(p => <button key={p.v} disabled={!canAct} onClick={() => go(p.v!)} title={p.hint ? E.fill(p.hint) : undefined}
              style={{ border: 0, background: cur === p.v ? 'rgba(106,92,255,.12)' : 'transparent', borderRadius: 14, padding: '10px 4px', cursor: canAct ? 'pointer' : 'default', color: INK, textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, margin: '0 auto 6px', borderRadius: 16, background: '#fff', boxShadow: '0 6px 18px rgba(23,26,46,.12)', display: 'grid', placeItems: 'center', fontSize: 28 }}>{p.icon || '🗔'}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{E.fill(p.title)}</div>
              {(p.badges || []).filter(x => E.ok(x.when)).map((x, i) => <div key={i} style={{ fontSize: 10, color: '#d6336c', fontWeight: 800 }}>{E.fill(x.text)}</div>)}
            </button>)}
          </div>
          {active ? (
            <div style={{ position: 'absolute', left: 132, top: 18, right: 18, bottom: 14, borderRadius: 16, background: '#fff', boxShadow: '0 24px 60px rgba(23,26,46,.16)', border: `1px solid ${LINE}`, display: 'grid', gridTemplateRows: '44px minmax(0, 1fr)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: '#f8f9fd', borderBottom: `1px solid ${LINE}` }}>
                <span style={{ fontSize: 18 }}>{active.icon}</span><span style={{ fontWeight: 800 }}>{E.fill(active.title)}</span>{active.hint && <span style={{ fontSize: 12, color: GRAY }}>{E.fill(active.hint)}</span>}
                <button onClick={() => close(active)} style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: GRAY, cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ ...paneStyle(active), height: '100%' }}>{blocks(active.blocks, {})}</div>
            </div>
          ) : D.empty && <div style={{ position: 'absolute', left: 160, top: '40%' }}>{blocks(D.empty, {})}</div>}
        </div>
        <div style={{ height: 54, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: 'rgba(255,255,255,.85)', borderTop: `1px solid ${LINE}`, backdropFilter: 'blur(8px)', flexShrink: 0 }}>
          {D.brand && <span style={{ fontWeight: 800, fontSize: 13, color: '#6a5cff', marginRight: 8 }}>{E.fill(D.brand)}</span>}
          {opened.map(v => { const p = wins.find(x => x.v === v); return p && <button key={v} onClick={() => canAct && go(v)} style={{ ...tab(cur === v), display: 'flex', gap: 6, alignItems: 'center' }}><span>{p.icon}</span>{E.fill(p.title)}</button>; })}
          {cfg.taskbar && <span style={{ marginLeft: 'auto', fontSize: 12.5, color: GRAY }}>{E.fill(cfg.taskbar)}</span>}
        </div>
      </div>
    );
  }

  if (cfg.layout === 'dock') {
    // 图标坞 + 窗口 + 任务栏：窗口开没开记在 ui.win_<id>（动作里也能开关），点哪个窗口哪个到最上面
    const wins = cfg.panes.filter(p => p.id);
    const isOpen = (p: DPane) => !!ui.current[`win_${p.id}`];
    const toggle = (p: DPane, v?: number) => { ui.current[`win_${p.id}`] = v ?? (isOpen(p) ? 0 : 1); if (ui.current[`win_${p.id}`]) raise(p.id!); rerender(x => x + 1); };
    const raise = (id: string) => { z.current = [...z.current.filter(x => x !== id), id]; };
    return (
      <div style={{ ...root, display: 'flex', flexDirection: 'column' }}>
        {topbar}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <div style={{ position: 'absolute', left: 10, top: 12, bottom: 12, width: 64, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 50 }}>
            {wins.map(p => <button key={p.id} title={p.title} onClick={() => toggle(p)} style={{ height: 64, borderRadius: 14, border: isOpen(p) ? '2px solid #6a5cff' : `1px solid ${LINE}`, background: '#fff', cursor: 'pointer', fontSize: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <span>{p.icon || '🗔'}</span><span style={{ fontSize: 10, color: GRAY, maxWidth: 58, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.title}</span></button>)}
          </div>
          {wins.filter(isOpen).map(p => { const w = p.win || { x: 8, y: 4, w: 60, h: 80 }; const zi = z.current.indexOf(p.id!) + 1; return (
            <div key={p.id} onPointerDown={() => { if (z.current[z.current.length - 1] !== p.id) { raise(p.id!); rerender(x => x + 1); } }} style={{ position: 'absolute', left: `${w.x}%`, top: `${w.y}%`, width: `${w.w}%`, height: `${w.h}%`, zIndex: 10 + zi, background: '#f8f9fd', borderRadius: 12, border: '1px solid rgba(23,26,46,.14)', boxShadow: '0 18px 48px rgba(23,26,46,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: '#fff', borderBottom: `1px solid ${LINE}`, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                <span>{p.icon}</span>{E.fill(p.title)}<button onClick={() => toggle(p, 0)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: GRAY, fontSize: 16 }}>×</button>
              </div>
              <div style={{ ...paneStyle(p), flex: 1 }}>{blocks(p.blocks, {})}</div>
            </div>); })}
          {cfg.panes.filter(p => !p.id).map((p, i) => <div key={`bg${i}`} style={{ ...paneStyle(p), position: 'absolute', inset: '0 0 0 84px' }}>{blocks(p.blocks, {})}</div>)}
        </div>
        <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: '#fff', borderTop: '1px solid rgba(23,26,46,.1)', flexShrink: 0 }}>
          {wins.filter(isOpen).map(p => <button key={p.id} onClick={() => { raise(p.id!); rerender(x => x + 1); }} style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${LINE}`, background: z.current[z.current.length - 1] === p.id ? '#efedff' : '#fff', fontSize: 12, cursor: 'pointer' }}>{p.icon} {E.fill(p.title)}</button>)}
          {cfg.taskbar && <span style={{ marginLeft: 'auto', fontSize: 12, color: GRAY, fontFamily: MONO }}>{E.fill(cfg.taskbar)}</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...root, display: 'grid', gridTemplateRows: '52px minmax(0, 1fr)', gridTemplateColumns: cfg.columns || `repeat(${cfg.panes.length}, minmax(0, 1fr))`, gap: `0 ${gap}px`, padding: gap ? `0 ${gap}px ${gap}px` : 0 }}>
      {topbar}
      {cfg.panes.map((p, i) => <div key={p.id || i} style={paneStyle(p)}>{blocks(p.blocks, {})}</div>)}
    </div>
  );
}
