'use client';

/**
 * 直播中控台（直播运营的交互故事）：浅色整屏。左：直播间（在线人数、弹幕滚动）；中：商品卡 + 话术卡；右：后台（库存、成交、预警）。
 *   弹幕和预警按时间轴出现；递话术 = 主播照着说（写进 say）；上下链接、处理库存、拉黑都是按钮。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { EVENTS, PRODUCTS, SAYS } from '@/lib/lab-live-spec';

export function LiveStage({ st, running, auto, act }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const t = st.t, v = st.vars;
  const card = Math.round(st.controls.card || 0), link = st.controls.link === 1, stockDone = st.controls.stock === 1;
  const sold = Math.round(v.sold || 0), mood = v.mood ?? 60;
  const feed = EVENTS.filter(e => e.t <= t);
  const [spoken, setSpoken] = useState<{ t: number; text: string }[]>([]);
  const lastSay = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [feed.length, spoken.length]);
  // 演示：脚本递的话术也显示出来
  useEffect(() => { if (!auto) return; const n = st.events.filter(e => e.kind === 'control' && e.control === 'say' && e.value).length; if (n > spoken.length) { const last = st.events.filter(e => e.kind === 'control' && e.control === 'say' && e.value).slice(-1)[0]; setSpoken(s => [...s, { t: last.t, text: SAYS.find(x => x.v === last.value)?.text || '' }]); } }, [auto, st.events.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  const say = (n: number) => { if (!canAct) return; const now = performance.now(); if (now - lastSay.current < 500) return; lastSay.current = now; act('say', n); setSpoken(s => [...s, { t, text: SAYS.find(x => x.v === n)!.text }]); setTimeout(() => act('say', 0), 600); };
  const viewers = Math.round(1800 + mood * 12 + Math.sin(t / 3) * 60);
  const stockOf = (p: typeof PRODUCTS[number]) => p.v === 1 ? (t >= 90 ? 0 : t >= 40 ? 3 : p.stock + 5) : p.stock - (link && card === p.v ? Math.floor(sold / 3) : 0);
  const alert = t >= 40 && !stockDone;

  const merged = [...feed.map(e => ({ t: e.t, kind: e.kind, who: e.who, text: e.text })), ...spoken.map(s => ({ t: s.t, kind: 'host', who: '主播', text: s.text }))].sort((a, b) => a.t - b.t);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f3f5fa', color: '#171a2e', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'grid', gridTemplateRows: '52px minmax(0, 1fr)', gridTemplateColumns: '360px minmax(0, 1fr) 300px', overflow: 'hidden' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', background: '#fff', borderBottom: '1px solid rgba(23,26,46,.1)' }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>直播中控台 · 女装晚八点场</span>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>开播 {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')} · 在线 {viewers.toLocaleString()} · 成交 {sold} 单</span>
        {alert && <span style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 999, background: '#d6336c', color: '#fff', fontSize: 13, fontWeight: 800 }}>⚠ 开衫库存 {t >= 90 ? 0 : 3} 件 · 链接还在售</span>}
      </div>
      {/* 直播间 */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid rgba(23,26,46,.08)', background: '#171a2e' }}>
        <div style={{ padding: '10px 14px', color: '#fff', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: '#ff3b5c' }} />LIVE · 主播小禾 · 讲解中：{card ? PRODUCTS[card - 1].name : '—'}</div>
        <div style={{ margin: '0 14px', height: 150, borderRadius: 12, background: 'linear-gradient(135deg,#3a2f5c,#6a5cff)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 40 }}>🧶</div>
        <div ref={scroller} style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {merged.map((m, i) => <div key={i} style={{ alignSelf: m.kind === 'host' ? 'flex-end' : 'flex-start', maxWidth: '92%', padding: '6px 10px', borderRadius: 10, fontSize: 13, lineHeight: 1.5, background: m.kind === 'alert' ? '#d6336c' : m.kind === 'host' ? '#6a5cff' : 'rgba(255,255,255,.12)', color: '#fff' }}><b style={{ opacity: 0.8 }}>{m.who}：</b>{m.text}</div>)}
        </div>
      </div>
      {/* 商品 + 话术 */}
      <div style={{ padding: 16, overflow: 'auto', display: 'grid', gap: 14, alignContent: 'start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginBottom: 8 }}>商品 · 点一个切到讲解位</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {PRODUCTS.map(p => { const sel = card === p.v, s = stockOf(p); return (
              <button key={p.v} disabled={!canAct} onClick={() => act('card', p.v)} style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: sel ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: sel ? '#efedff' : '#fff', cursor: canAct ? 'pointer' : 'default', color: '#171a2e' }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{p.name}{p.hot ? ' 🔥' : ''}</div>
                <div style={{ fontSize: 12.5, color: '#6b7089', marginTop: 4 }}>¥{p.price} · 库存 <b style={{ color: s <= 3 ? '#d6336c' : '#171a2e' }}>{s}</b></div>
              </button>); })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button disabled={!canAct || !card} onClick={() => act('link', link ? 0 : 1)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: link ? '#12a150' : '#6a5cff', color: '#fff', fontWeight: 800, cursor: canAct ? 'pointer' : 'default' }}>{link ? '链接在售 · 点击下链接' : '上链接'}</button>
            <button disabled={!canAct || stockDone} onClick={() => { act('stock', 1); act('link', 0); }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(23,26,46,.15)', background: alert ? '#ffe3ec' : '#fff', color: alert ? '#d6336c' : '#171a2e', fontWeight: 800, cursor: canAct ? 'pointer' : 'default' }}>{stockDone ? '✓ 库存预警已处理' : '处理库存预警：下链接 + 切款'}</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginBottom: 8 }}>话术卡 · 点一下 = 递给主播说</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {SAYS.map(s => <button key={s.v} disabled={!canAct} onClick={() => say(s.v)} style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: '1px solid rgba(23,26,46,.12)', background: s.v === 6 ? '#fff6c2' : '#fff', cursor: canAct ? 'pointer' : 'default', color: '#171a2e' }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{s.label}</div>
              <div style={{ fontSize: 12.5, color: '#6b7089', marginTop: 4, lineHeight: 1.5 }}>{s.text}</div>
            </button>)}
          </div>
        </div>
      </div>
      {/* 后台 */}
      <div style={{ padding: 14, borderLeft: '1px solid rgba(23,26,46,.08)', background: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em' }}>后台</div>
        {[['在线', viewers.toLocaleString()], ['成交', `${sold} 单`], ['气氛', `${Math.round(mood)}`], ['违规', `${Math.round(v.banned || 0)} 次`]].map(([k, val]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: '#f8f9fd', fontSize: 13.5 }}><span style={{ color: '#6b7089' }}>{k}</span><b>{val}</b></div>)}
        <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginTop: 8 }}>弹幕管理</div>
        <button disabled={!canAct} onClick={() => act('mute', 1)} style={{ padding: '9px 0', borderRadius: 8, border: '1px solid rgba(23,26,46,.15)', background: '#fff', fontWeight: 700, cursor: canAct ? 'pointer' : 'default', color: '#171a2e' }}>拉黑最近发言的人</button>
        <div style={{ marginTop: 'auto', fontSize: 12.5, color: '#6b7089', lineHeight: 1.7 }}>提醒：问尺码 20 秒内要回；库存见底先下链接再切款；有人喊假货要回应不是删人；「全网最低」是违规词。</div>
      </div>
    </div>
  );
}
