'use client';

/**
 * 客服工作台（客服的交互故事）：浅色整屏。左边订单 / 政策（核实后才显示事实），中间和李女士的对话，右边这一句做什么 + 方案 + 工单。
 *   每发一句，她按当时的怒气 / 信任回一句；怒气 / 信任写进隐藏控件，规则 / 目标在规格里算。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { ACTS, FACTS, OFFERS } from '@/lib/lab-complaint-spec';

interface Msg { who: 'her' | 'me' | 'sys'; text: string }
const OPEN: Msg[] = [
  { who: 'sys', text: '工单 #48821 已升级给你 · 李女士 · 等待 2 分 10 秒' },
  { who: 'her', text: '你们到底有没有人管？净化器收到就是碎的，我 7 号就说了，照片也发了，两次都让我"提供照片"，提供了又没人理！' },
  { who: 'her', text: '今天不给个说法我就投诉 12315，再发小红书。' },
];

export function ComplaintStage({ st, running, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const kind = Math.round(st.controls.kind || 0), offer = Math.round(st.controls.offer || 0);
  const anger = st.controls.anger ?? 85, trust = st.controls.trust ?? 20, checked = st.controls.checked === 1, agreed = st.controls.agreed === 1;
  const [msgs, setMsgs] = useState<Msg[]>(OPEN);
  const [ticket, setTicket] = useState('');
  const [typing, setTyping] = useState(false);
  const lastSent = useRef(performance.now());
  const empathy = useRef(0); const apology = useRef(0); const photo = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  // 她等你：每秒记一下这一轮等了多久
  useEffect(() => {
    if (!canAct || agreed) return;
    const iv = setInterval(() => { const s = (performance.now() - lastSent.current) / 1000; setHidden('idle', Math.round(s)); if (s > 25 && s < 26.5) setMsgs(m => [...m, { who: 'her', text: '在吗？？' }]); }, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAct, agreed]);
  useEffect(() => { scroller.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [msgs]);
  // 演示：按脚本的 kind/offer 把对话摆出来
  useEffect(() => { if (!auto) return; const last = st.events.filter(e => e.kind === 'control' && e.control === 'say').length; if (last > msgs.filter(m => m.who === 'me').length) { const k = Math.round(st.controls.kind || 0); const text = k === 4 ? OFFERS[Math.round(st.controls.offer || 0)].text : ACTS.find(a => a.v === k)?.text || ''; setMsgs(m => [...m, { who: 'me', text }, { who: 'her', text: reply(k, Math.round(st.controls.offer || 0), true) }]); } }, [auto, st.events.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  function reply(k: number, o: number, demo = false): string {
    const a = demo ? 50 : anger;
    switch (k) {
      case 1: return empathy.current <= 1 ? (a > 60 ? '…你这么说我火气是小一点。但光说没用，你们打算怎么办？' : '嗯，至少你是听明白了。') : '你别一直说这些了，我要的是解决。';
      case 2: return apology.current <= 1 ? '道歉我收下。然后呢？' : '不用一直道歉，说方案。';
      case 3: return '好，我等你三十秒。别又让我等半天。';
      case 5: return photo.current >= 3 ? '？？？我 7 号就发了！你们系统里没有吗？！我现在就去投诉！' : '我发过了！你自己去翻记录！';
      case 6: return '你这是机器人回复吧？"1–3 个工作日"，我 7 号就听过这句了。';
      case 7: return '又转？你是第三个了！转来转去谁负责？';
      case 4: {
        const of = OFFERS[o];
        if (!of || !o) return '方案呢？你发了个空的。';
        if (of.over) return '…行吧，你说的，退款机器我留着，你记得写进去。';
        if (!checked && !demo) return '你连我订单都没查就给方案？你知道我是哪天收到的吗？';
        if (trust < 40 && !demo) return '换新？我凭什么信你们，前面两个也是这么说的。';
        return of.good ? (o === 3 ? '…好，那就这样。券我也收了。希望这次真的有人上门。' : '可以，上门取件。什么时候？') : '寄回去再退？运费谁出？我还要跑一趟快递？';
      }
      default: return '？';
    }
  }

  const send = () => {
    if (!canAct || !kind) return;
    if (kind === 4 && !offer) return;
    act('say', 1); lastSent.current = performance.now(); setHidden('idle', 0);
    let dA = 0, dT = 0;
    if (kind === 1) { empathy.current++; dA = empathy.current <= 2 ? -14 : 4; dT = empathy.current <= 2 ? 12 : 0; }
    if (kind === 2) { apology.current++; dA = apology.current <= 2 ? -12 : 3; dT = apology.current <= 2 ? 10 : 0; }
    if (kind === 3) { if (!checked) { setHidden('checked', 1); dA = -6; dT = 15; } else { dA = 2; } }
    if (kind === 5) { photo.current++; dA = photo.current >= 1 ? 18 : 8; dT = -10; if (photo.current >= 1) setHidden('photo3', 1); }
    if (kind === 6) { dA = 12; dT = -8; setHidden('scripted', (st.controls.scripted || 0) + 1); }
    if (kind === 7) { dA = 10; dT = -12; }
    if (kind === 4) {
      const of = OFFERS[offer];
      if (of.over) { setHidden('over', 1); setHidden('agreed', 1); dA = -30; dT = 10; }
      else if (!checked) { dA = 6; dT = -4; }
      else if (trust < 40) { dA = 2; dT = -2; }
      else if (of.good) { setHidden('agreed', 1); dA = offer === 3 ? -34 : -26; dT = 25; }
      else { dA = 4; dT = -3; }
    }
    const text = kind === 4 ? OFFERS[offer].text : ACTS.find(a => a.v === kind)!.text;
    const her = reply(kind, offer);
    setMsgs(m => [...m, { who: 'me', text }]); setTyping(true);
    setTimeout(() => { setTyping(false); setMsgs(m => [...m, { who: 'her', text: her }]); }, 1400);
    setHidden('anger', Math.min(100, Math.max(0, anger + dA))); setHidden('trust', Math.min(100, Math.max(0, trust + dT)));
    act('kind', 0);
  };
  const onTicket = (v: string) => { setTicket(v); if (canAct) setHidden('words', v.replace(/\s/g, '').length); };
  const mood = anger > 70 ? '😡 要炸了' : anger > 50 ? '😠 还在气' : anger > 30 ? '😐 听得进话' : '🙂 缓下来了';

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f3f5fa', color: '#171a2e', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'grid', gridTemplateRows: '52px minmax(0, 1fr)', gridTemplateColumns: '300px minmax(0, 1fr) 340px', overflow: 'hidden' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', background: '#fff', borderBottom: '1px solid rgba(23,26,46,.1)' }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>客服工作台 · 升级队列</span>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>#48821 李女士 · 空气净化器破损</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: anger > 50 ? '#d6336c' : '#12a150' }}>{mood} · 怒气 {Math.round(anger)} · 信任 {Math.round(trust)}</span>
      </div>
      {/* 左：订单 / 政策 */}
      <div style={{ padding: 14, overflow: 'auto', borderRight: '1px solid rgba(23,26,46,.08)' }}>
        <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginBottom: 8 }}>订单与记录</div>
        {checked ? FACTS.map((f, i) => <div key={i} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 10, background: '#fff', border: '1px solid rgba(23,26,46,.08)', fontSize: 13, lineHeight: 1.6, color: i === 4 ? '#d6336c' : '#171a2e', fontWeight: i === 4 ? 700 : 500 }}>{f}</div>)
          : <div style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px dashed rgba(23,26,46,.2)', fontSize: 13, color: '#6b7089', lineHeight: 1.7 }}>还没核实。右边选「核实订单」发出去，系统会把订单、物流、历史记录调出来——先知道她说的是不是真的。</div>}
        <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', margin: '14px 0 8px' }}>你的权限</div>
        <div style={{ padding: '8px 10px', borderRadius: 10, background: '#fff6c2', fontSize: 13, lineHeight: 1.7, color: '#5a4a10' }}>换新 / 退款（寄回后）可直接承诺；补偿券 ≤ 100 元；「退款还让客户留货」不在权限内。</div>
      </div>
      {/* 中：对话 */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div ref={scroller} style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {msgs.map((m, i) => m.who === 'sys' ? <div key={i} style={{ textAlign: 'center', fontSize: 12, color: '#6b7089', margin: '6px 0 12px' }}>{m.text}</div> : (
            <div key={i} style={{ display: 'flex', flexDirection: m.who === 'me' ? 'row-reverse' : 'row', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: m.who === 'me' ? '#6a5cff' : '#ff8a5f', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>{m.who === 'me' ? '我' : '李'}</div>
              <div style={{ maxWidth: 520, padding: '9px 13px', borderRadius: 14, background: m.who === 'me' ? '#e9e6ff' : '#fff', border: '1px solid rgba(23,26,46,.08)', fontSize: 14.5, lineHeight: 1.65 }}>{m.text}</div>
            </div>))}
          {typing && <div style={{ fontSize: 12.5, color: '#6b7089' }}>李女士正在输入…</div>}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(23,26,46,.08)', background: '#fff', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 14, color: kind ? '#171a2e' : '#9aa0b8', lineHeight: 1.5 }}>{kind === 4 ? (OFFERS[offer].text || '右边选一个方案') : kind ? ACTS.find(a => a.v === kind)!.text : '右边选这一句要做什么，这里会生成你要说的话'}</div>
          <button disabled={!canAct || !kind || (kind === 4 && !offer)} onClick={send} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: kind ? '#6a5cff' : '#c9cbe0', color: '#fff', fontWeight: 800, cursor: canAct && kind ? 'pointer' : 'default' }}>发送</button>
        </div>
      </div>
      {/* 右：动作 / 方案 / 工单 */}
      <div style={{ padding: 14, borderLeft: '1px solid rgba(23,26,46,.08)', background: '#fff', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'auto' }}>
        <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em' }}>这一句做什么</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {ACTS.map(a => <button key={a.v} disabled={!canAct || agreed} onClick={() => act('kind', a.v)} style={{ padding: '9px 6px', borderRadius: 10, border: kind === a.v ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: kind === a.v ? '#efedff' : '#fff', fontWeight: 700, fontSize: 13, cursor: canAct ? 'pointer' : 'default', color: '#171a2e' }}>{a.label}</button>)}
        </div>
        {kind === 4 && <>
          <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginTop: 4 }}>方案</div>
          {OFFERS.slice(1).map(o => <button key={o.v} disabled={!canAct} onClick={() => act('offer', o.v)} style={{ textAlign: 'left', padding: '9px 10px', borderRadius: 10, border: offer === o.v ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: offer === o.v ? '#efedff' : '#fff', fontSize: 13, fontWeight: 700, cursor: canAct ? 'pointer' : 'default', color: '#171a2e' }}>{o.label}</button>)}
        </>}
        <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginTop: 6 }}>工单记录（谈妥后写）· {st.controls.words || 0} 字</div>
        <textarea value={ticket} disabled={!canAct && !auto} onChange={e => onTicket(e.target.value)} placeholder={'问题：\n原因：\n方案：\n时限：'} style={{ flex: 1, minHeight: 120, resize: 'none', padding: 10, borderRadius: 10, border: '1px solid rgba(23,26,46,.16)', background: '#fbfbfe', color: '#171a2e', fontSize: 13.5, lineHeight: 1.7 }} />
      </div>
    </div>
  );
}
