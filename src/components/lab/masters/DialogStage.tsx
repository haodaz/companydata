'use client';

/**
 * 母版 F 对人应对（src/lib/masters/dialog.ts 的 DialogConfig）：浅色整屏，顶栏 + 若干栏积木（线程 / 发送栏 / 选项组 / 话术卡 / 事实栏 / 读数 / 按钮 / 工单）。
 * 挂在 BenchRunner：HTML 整屏（沉浸模式走浅色 LIGHT 版面，非沉浸盖在场景 svg 上）。
 *   - 线程从事件流推出来：触发控件每记一笔 > 0 的事件就是「说了一句」，演示回放照样摆得出对话；
 *     自己点的那一句当场按配置拨控件（怒气 / 信任……），演示时不拨（老手脚本自己拨）。
 *   - 打字延迟、让对方等了几秒、递话术松手，全按模拟时间 t 算，不看墙钟。
 *   - 本地状态（线程、工单草稿、计数）按 BenchState 对象存在模块级 WeakMap 里：组件被重挂（沉浸版面每拍都可能重挂）也不丢，重来就是新的 st。
 * 嵌进桌面母版：用 DialogApp（embedded）当一个程序窗口；只要线程 + 话术，可以直接用 dialogEngine + DialogBlockView。
 */
import React, { useEffect, useRef, useState } from 'react';
import { benchEnv, evalExpr, type BenchState } from '@/lib/bench';
import type { MasterAction, MasterStageProps } from '@/lib/lab-masters';
import { DIALOG_TPL_RE, type DialogBlock, type DialogButton, type DialogConfig, type DialogLine } from '@/lib/masters/dialog';

interface Msg { t: number; who: string; text: string; tone?: 'alert' }
interface Local {
  msgs: Msg[]; scanned: number; counts: Record<number, number>;
  lastSend: number; nudged: boolean; lastLine: number; ticket: string;
  resets: { control: string; at: number }[]; toast: string;
}
const STORE = new WeakMap<BenchState, Map<string, Local>>();
function localOf(st: BenchState, id: string): Local {
  let m = STORE.get(st);
  if (!m) { m = new Map(); STORE.set(st, m); }
  let l = m.get(id);
  if (!l) { l = { msgs: [], scanned: 0, counts: {}, lastSend: st.t, nudged: false, lastLine: -Infinity, ticket: '', resets: [], toast: '' }; m.set(id, l); }
  return l;
}

const INK = '#171a2e', MUTED = '#6b7089', LINE = '1px solid rgba(23,26,46,.08)', ACCENT = '#6a5cff';
const FONT = 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif';

export type DialogProps = MasterStageProps<DialogConfig>;
export type DialogCtx = ReturnType<typeof dialogEngine>;

/** 引擎：求值、模板、发一句、按钮动作。纯函数（不含 hook），渲染时调用；rerender 让本地状态变化后重画 */
export function dialogEngine({ spec, cfg, st, running, auto, act, setHidden }: DialogProps, rerender: () => void) {
  const L = localOf(st, cfg.id || 'main');
  const canAct = running && !auto;
  const ctlDef = (id: string) => spec.controls.find(c => c.id === id);
  const envOf = (extra: Record<string, number> = {}) => {
    const env = benchEnv(spec, st);
    for (const w of cfg.waves || []) env[w.name] = w.amp * Math.sin(st.t / w.period);
    env.nth = 0; env.auto = auto ? 1 : 0;
    return Object.assign(env, extra);
  };
  const env = envOf();
  const num = (e: string, en = env) => { try { return evalExpr(e, en); } catch { return 0; } };
  const ok = (e?: string, en = env) => { if (!e) return true; try { return !!evalExpr(e, en); } catch { return false; } };
  const pick = <K extends 'text' | 'color'>(list: ({ when: string } & Record<K, string>)[] | undefined, key: K, fallback: string, en = env): string => { const hit = list?.find(x => ok(x.when, en)); return hit ? hit[key] : fallback; };
  const fill = (t: string, en = env) => t.replace(DIALOG_TPL_RE, (_, e: string, d?: string, f?: string) => {
    const v = num(e, en);
    if (d) return v.toFixed(+d);
    if (f === 'int') return String(Math.floor(v));
    if (f === 'n') return Math.round(v).toLocaleString();
    if (f === 'clock') return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
    return String(Math.round(v));
  });
  const val = (v: number | string | undefined, en = env) => typeof v === 'string' ? num(v, en) : v ?? 1;
  /** 隐藏控件直接写（不进事件流），看得见的走 act（记事件、拍快照） */
  const setCtl = (id: string, v: number) => { if (ctlDef(id)?.hidden) setHidden(id, v); else act(id, v); };
  const lineOf = (v: number) => cfg.lines.find(l => l.v === Math.round(v));
  const toast = (text: string) => { L.toast = text; rerender(); setTimeout(() => { if (L.toast === text) { L.toast = ''; rerender(); } }, 3000); };

  /** 说了一句：interactive = 自己点的（拨效果、计等待），否则是回放 / 演示（只摆对话） */
  const speak = (line: DialogLine, t: number, interactive: boolean) => {
    const nth = (L.counts[line.v] || 0) + 1; L.counts[line.v] = nth;
    const en = envOf({ nth, auto: interactive ? 0 : 1 });
    const text = fill(pick(line.textWhen, 'text', line.text, en), en);
    const reply = fill(pick(line.replies, 'text', line.reply || '', en), en);
    if (interactive) {
      if (cfg.idle) setHidden(cfg.idle.control, 0);
      const branch = line.effects?.find(b => ok(b.when, en));
      // 都按发出前的状态先算好，再一起拨
      const sets = (branch?.set || []).map(x => [x.control, val(x.value, en)] as const);
      for (const [id, v] of sets) setCtl(id, v);
    }
    L.lastSend = t; L.nudged = false;
    L.msgs.push({ t, who: 'me', text });
    if (reply) L.msgs.push({ t: interactive ? t + (cfg.typingDelay || 0) : t, who: 'npc', text: reply });
  };
  /** 扫事件流里还没处理的「说一句」 */
  const sync = (interactive: boolean) => {
    const { control, line } = cfg.trigger;
    for (; L.scanned < st.events.length; L.scanned++) {
      const e = st.events[L.scanned];
      if (e.kind !== 'control' || e.control !== control || !((e.value || 0) > 0)) continue;
      let v = e.value!;
      if (line !== control) {
        if (ctlDef(line)?.hidden) v = st.controls[line] || 0;
        else { v = ctlDef(line)?.initial ?? 0; for (let i = L.scanned - 1; i >= 0; i--) { const p = st.events[i]; if (p.kind === 'control' && p.control === line) { v = p.value || 0; break; } } }
      }
      const l = lineOf(v);
      if (l) speak(l, e.t, interactive);
    }
  };
  sync(false);

  /** 发送栏：发当前选中的那一句 */
  const cur = lineOf(st.controls[cfg.trigger.line] || 0);
  const canSend = canAct && !!cur && ok(cur.ready);
  const send = () => {
    if (!canSend || !cfg.composer) return;
    for (const x of cfg.composer.send) setCtl(x.control, val(x.value));
    sync(true);
    for (const x of cfg.composer.after || []) setCtl(x.control, val(x.value));
    rerender();
  };
  /** 话术卡：点一下就说 */
  const say = (line: DialogLine) => {
    if (!canAct) return;
    if (st.t - L.lastLine < (cfg.cooldown || 0)) return;
    L.lastLine = st.t;
    for (const a of line.act || []) { setCtl(a.control, val(a.value)); if (a.resetAfter) L.resets.push({ control: a.control, at: st.t + a.resetAfter }); }
    sync(true);
    rerender();
  };
  /** 按钮动作（和母版 B / C 的 MasterAction 同一套：拦截 → 拨控件 → 说一句） */
  const run = (a: MasterAction) => {
    if (!canAct) return;
    const g = a.guards?.find(x => ok(x.when));
    if (g) { toast(g.say); return; }
    const line = fill(pick(a.sayWhen, 'text', a.say || ''));
    const sets = (a.act || []).map(x => [x.control, val(x.value)] as const);
    for (const [id, v] of sets) setCtl(id, v);
    if (line) toast(line);
  };
  /** 每拍的副作用（不能在渲染里拨控件）：递话术松手、让对方等了几秒、催一句 */
  const tick = () => {
    for (const r of [...L.resets]) if (st.t >= r.at) { L.resets.splice(L.resets.indexOf(r), 1); if (canAct) act(r.control, 0); }
    if (cfg.idle && canAct && ok(cfg.idle.when)) {
      const s = st.t - L.lastSend, v = Math.round(s);
      if (cfg.idle.nudge && s > cfg.idle.nudge.after && !L.nudged) { L.nudged = true; L.msgs.push({ t: st.t, who: 'npc', text: cfg.idle.nudge.text }); rerender(); }
      if ((st.controls[cfg.idle.control] ?? 0) !== Math.min(v, ctlDef(cfg.idle.control)?.max ?? v)) setHidden(cfg.idle.control, v);
    }
  };
  const onTicket = (control: string, v: string) => { L.ticket = v; if (canAct) setHidden(control, v.replace(/\s/g, '').length); rerender(); };

  // 线程：开场 + 到点的消息（弹幕 / 告警）+ 说过的话；回话等打字延迟到了才出现（停了就全显示）
  const shown = L.msgs.filter(m => m.t <= st.t || !running);
  const thread: Msg[] = [
    ...(cfg.opening || []).map(m => ({ ...m, t: -Infinity })),
    ...[...(cfg.feed || []).filter(m => m.t <= st.t), ...shown].sort((a, b) => a.t - b.t),
  ];
  const typing = running && L.msgs.some(m => m.who === 'npc' && m.t > st.t);
  return { spec, cfg, st, L, canAct, auto, env, ok, num, pick, fill, cur, canSend, send, say, run, tick, onTicket, thread, typing };
}

/** 整个对话台（可嵌进桌面：embedded 时不铺满父元素的绝对定位，跟着窗口走） */
export function DialogApp(props: DialogProps & { embedded?: boolean }) {
  const [, force] = useState(0);
  const ctx = dialogEngine(props, () => force(x => x + 1));
  useEffect(() => { ctx.tick(); });
  const { cfg, fill, pick, ok } = ctx;
  return (
    <div style={{ position: props.embedded ? 'relative' : 'absolute', inset: props.embedded ? undefined : 0, height: props.embedded ? '100%' : undefined, background: '#f3f5fa', color: INK, fontFamily: FONT, display: 'grid', gridTemplateRows: '52px minmax(0, 1fr)', gridTemplateColumns: cfg.columns.map(c => c.width).join(' '), overflow: 'hidden' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', background: '#fff', borderBottom: '1px solid rgba(23,26,46,.1)' }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>{fill(cfg.title)}</span>
        {cfg.subtitle && <span style={{ fontSize: 12.5, color: MUTED }}>{fill(pick(cfg.subtitleWhen, 'text', cfg.subtitle))}</span>}
        {(cfg.badges || []).filter(b => ok(b.when)).map((b, i) => { const c = pick(b.colorWhen, 'color', b.color || '#d6336c'), t = fill(pick(b.textWhen, 'text', b.text)); return b.look === 'pill'
          ? <span key={i} style={{ marginLeft: i ? 0 : 'auto', padding: '5px 12px', borderRadius: 999, background: c, color: '#fff', fontSize: 13, fontWeight: 800 }}>{t}</span>
          : <span key={i} style={{ marginLeft: i ? 0 : 'auto', fontSize: 13, fontWeight: 800, color: c }}>{t}</span>; })}
      </div>
      {cfg.columns.map((col, ci) => {
        const dark = col.tone === 'dark';
        return (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: col.flush ? 0 : col.gap ?? 14, minHeight: 0, padding: col.flush ? 0 : 14, overflow: col.flush ? 'hidden' : 'auto', borderLeft: ci ? LINE : undefined, background: dark ? INK : col.tone === 'panel' ? '#fff' : undefined }}>
            {col.blocks.map((b, bi) => <DialogBlockView key={bi} ctx={ctx} block={b} dark={dark} />)}
          </div>);
      })}
      {ctx.L.toast && <div style={{ position: 'absolute', left: '50%', top: 60, transform: 'translateX(-50%)', padding: '8px 16px', borderRadius: 10, background: 'rgba(255,95,162,.95)', color: '#fff', fontSize: 14, fontWeight: 800, pointerEvents: 'none' }}>{ctx.L.toast}</div>}
    </div>
  );
}

export function DialogStage(props: DialogProps) {
  return <DialogApp {...props} />;
}

const Title = ({ text, dark }: { text?: string; dark?: boolean }) => text ? <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,.6)' : MUTED, letterSpacing: '.06em', marginBottom: 8 }}>{text}</div> : null;

/** 一块积木（嵌桌面时可以单拿线程 / 话术卡这几块用） */
export function DialogBlockView({ ctx, block: b, dark }: { ctx: DialogCtx; block: DialogBlock; dark?: boolean }) {
  const { cfg, st, canAct, ok, fill, pick } = ctx;
  if ('when' in b && b.kind !== 'facts' && !ok(b.when)) return null;
  const pointer = canAct ? 'pointer' : 'default';
  switch (b.kind) {
    case 'thread': return <Thread ctx={ctx} look={b.look || 'chat'} />;
    case 'composer': {
      const cur = ctx.cur, c = cfg.composer;
      const text = cur ? (fill(pick(cur.textWhen, 'text', cur.text)) || c?.emptyText || '') : c?.placeholder || '';
      return (
        <div style={{ padding: '10px 18px', borderTop: LINE, background: '#fff', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 14, color: cur ? INK : '#9aa0b8', lineHeight: 1.5 }}>{text}</div>
          <button disabled={!ctx.canSend} onClick={ctx.send} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: cur ? ACCENT : '#c9cbe0', color: '#fff', fontWeight: 800, cursor: ctx.canSend ? 'pointer' : 'default' }}>{c?.button || '发送'}</button>
        </div>);
    }
    case 'choices': {
      const v = Math.round(st.controls[b.control] || 0), look = b.look || 'chip';
      const off = !canAct || (!!b.disabledWhen && ok(b.disabledWhen));
      return (
        <div>
          <Title text={b.title && fill(b.title)} dark={dark} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.cols || 1}, minmax(0, 1fr))`, gap: look === 'card' ? 10 : 6 }}>
            {b.options.map(o => { const sel = v === o.v; return (
              <button key={o.v} disabled={off} onClick={() => ctx.run({ act: [{ control: b.control, value: o.v }] })} style={{
                textAlign: look === 'chip' ? 'center' : 'left', padding: look === 'card' ? 12 : look === 'option' ? '9px 10px' : '9px 6px', borderRadius: look === 'card' ? 12 : 10,
                border: sel ? `2px solid ${ACCENT}` : '1px solid rgba(23,26,46,.12)', background: sel ? '#efedff' : '#fff', fontWeight: 700, fontSize: 13, cursor: pointer, color: INK }}>
                {look === 'card' ? <>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{o.label}{o.badge ? ` ${o.badge}` : ''}</div>
                  {(o.sub || o.value) && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, fontWeight: 500 }}>{o.sub ? fill(o.sub) : ''}{o.value && <b style={{ color: pick(o.value.colorWhen, 'color', o.value.color || INK) }}>{fill(o.value.text)}</b>}</div>}
                </> : <>{o.label}{o.badge ? ` ${o.badge}` : ''}</>}
              </button>); })}
          </div>
        </div>);
    }
    case 'lines': {
      const lines = b.lines ? cfg.lines.filter(l => b.lines!.includes(l.v)) : cfg.lines;
      return (
        <div>
          <Title text={b.title} dark={dark} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.cols || 2}, minmax(0, 1fr))`, gap: 10 }}>
            {lines.map(l => <button key={l.v} disabled={!canAct} onClick={() => ctx.say(l)} style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: '1px solid rgba(23,26,46,.12)', background: l.hot ? '#fff6c2' : '#fff', cursor: pointer, color: INK }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{l.label}</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{fill(l.text)}</div>
            </button>)}
          </div>
        </div>);
    }
    case 'facts': {
      const open = ok(b.when);
      return (
        <div>
          <Title text={b.title} dark={dark} />
          {open ? b.items.map((f, i) => <div key={i} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 10, background: '#fff', border: LINE, fontSize: 13, lineHeight: 1.6, color: f.hot ? '#d6336c' : INK, fontWeight: f.hot ? 700 : 500 }}>{fill(f.text)}</div>)
            : <div style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px dashed rgba(23,26,46,.2)', fontSize: 13, color: MUTED, lineHeight: 1.7 }}>{b.placeholder || '还看不到'}</div>}
        </div>);
    }
    case 'note': return (
      <div style={{ marginTop: b.bottom ? 'auto' : undefined }}>
        <Title text={b.title} dark={dark} />
        {b.tone === 'plain' ? <div style={{ fontSize: 12.5, color: dark ? 'rgba(255,255,255,.7)' : MUTED, lineHeight: 1.7 }}>{fill(b.text)}</div>
          : <div style={{ padding: '8px 10px', borderRadius: 10, background: '#fff6c2', fontSize: 13, lineHeight: 1.7, color: '#5a4a10' }}>{fill(b.text)}</div>}
      </div>);
    case 'stats': return (
      <div>
        <Title text={b.title} dark={dark} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {b.rows.map(r => <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: '#f8f9fd', fontSize: 13.5 }}><span style={{ color: MUTED }}>{r.label}</span><b>{fill(r.text)}</b></div>)}
        </div>
      </div>);
    case 'buttons': return (
      <div>
        <Title text={b.title} dark={dark} />
        <div style={{ display: 'flex', flexDirection: b.row ? 'row' : 'column', gap: 8, flexWrap: 'wrap' }}>
          {b.buttons.filter(x => ok(x.when)).map((x, i) => <Btn key={i} ctx={ctx} b={x} />)}
        </div>
      </div>);
    case 'ticket': return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Title text={b.title && fill(b.title)} dark={dark} />
        <textarea value={ctx.L.ticket} disabled={!canAct && !ctx.auto} onChange={e => ctx.onTicket(b.control, e.target.value)} placeholder={b.placeholder} style={{ flex: 1, minHeight: 120, resize: 'none', padding: 10, borderRadius: 10, border: '1px solid rgba(23,26,46,.16)', background: '#fbfbfe', color: INK, fontSize: 13.5, lineHeight: 1.7 }} />
      </div>);
    case 'caption': return (
      <div style={{ padding: '10px 14px', color: dark ? '#fff' : INK, fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center' }}>
        {b.dot && <span style={{ width: 8, height: 8, borderRadius: 4, background: b.dot }} />}{fill(pick(b.textWhen, 'text', b.text))}
      </div>);
    case 'hero': return <div style={{ margin: '0 14px', height: b.height || 150, flexShrink: 0, borderRadius: 12, background: b.bg || 'linear-gradient(135deg,#3a2f5c,#6a5cff)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 40 }}>{b.icon}</div>;
  }
}

function Btn({ ctx, b }: { ctx: DialogCtx; b: DialogButton }) {
  const { canAct, ok, pick, fill } = ctx;
  const off = !canAct || (!!b.disabledWhen && ok(b.disabledWhen));
  const outline = b.look === 'outline';
  return (
    <button disabled={off} onClick={() => ctx.run(b.action)} style={{
      padding: outline ? '9px 14px' : '8px 14px', borderRadius: 8, border: outline ? '1px solid rgba(23,26,46,.15)' : 'none',
      background: pick(b.bgWhen, 'color', b.bg || (outline ? '#fff' : ACCENT)), color: pick(b.fgWhen, 'color', b.fg || (outline ? INK : '#fff')),
      fontWeight: 800, cursor: canAct ? 'pointer' : 'default' }}>{fill(pick(b.labelWhen, 'text', b.label))}</button>
  );
}

function Thread({ ctx, look }: { ctx: DialogCtx; look: 'chat' | 'feed' }) {
  const { cfg, thread } = ctx;
  const scroller = useRef<HTMLDivElement>(null);
  const seen = useRef(-1);
  useEffect(() => {
    // 第一次（含被重挂）直接到底，之后有新消息平滑滚
    if (thread.length !== seen.current) scroller.current?.scrollTo({ top: 1e6, behavior: seen.current < 0 ? 'auto' : 'smooth' });
    seen.current = thread.length;
  });
  const name = (who: string) => who === 'me' ? cfg.me.name : who === 'npc' ? cfg.npc.name : who;
  if (look === 'feed') return (
    <div ref={scroller} style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {thread.map((m, i) => <div key={i} style={{ alignSelf: m.who === 'me' ? 'flex-end' : 'flex-start', maxWidth: '92%', padding: '6px 10px', borderRadius: 10, fontSize: 13, lineHeight: 1.5, background: m.tone === 'alert' ? '#d6336c' : m.who === 'me' ? (cfg.me.color || ACCENT) : 'rgba(255,255,255,.12)', color: '#fff' }}><b style={{ opacity: 0.8 }}>{name(m.who)}：</b>{m.text}</div>)}
    </div>);
  return (
    <div ref={scroller} style={{ flex: 1, overflow: 'auto', padding: 18 }}>
      {thread.map((m, i) => m.who === 'sys' ? <div key={i} style={{ textAlign: 'center', fontSize: 12, color: MUTED, margin: '6px 0 12px' }}>{m.text}</div> : (
        <div key={i} style={{ display: 'flex', flexDirection: m.who === 'me' ? 'row-reverse' : 'row', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: m.who === 'me' ? (cfg.me.color || ACCENT) : (cfg.npc.color || '#ff8a5f'), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>{m.who === 'me' ? cfg.me.avatar : m.who === 'npc' ? cfg.npc.avatar : m.who.slice(0, 1)}</div>
          <div style={{ maxWidth: 520, padding: '9px 13px', borderRadius: 14, background: m.who === 'me' ? '#e9e6ff' : m.tone === 'alert' ? '#ffe3ec' : '#fff', border: '1px solid rgba(23,26,46,.08)', fontSize: 14.5, lineHeight: 1.65 }}>{m.text}</div>
        </div>))}
      {ctx.typing && <div style={{ fontSize: 12.5, color: MUTED }}>{cfg.npc.typing || `${cfg.npc.name}正在输入…`}</div>}
    </div>
  );
}
