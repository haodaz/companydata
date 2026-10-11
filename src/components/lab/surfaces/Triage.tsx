'use client';

/**
 * 预检分诊台（急诊护士的交互故事）：浅色整屏，像真的分诊系统。
 *   左边到达队列（谁等了多久、分了没）；中间选中的病人：主诉、外观，点「量生命体征」要等几秒才出数，点「问诊」才有病史；
 *   右边分级 + 去向 + 确认。顶上时钟；候诊区有人恶化会弹红色报警。
 *   每个病人的分级 / 去向 / 量没量写进隐藏控件（lvN / dsN / mN），对错由规格里的变量算。
 */
import React, { useEffect, useRef, useState } from 'react';
import type { BenchState } from '@/lib/bench';
import { DESTS, LEVELS, TRIAGE_PATIENTS } from '@/lib/lab-triage-spec';

const LV_COLOR = ['', '#d6336c', '#ff8a5f', '#e0a800', '#12a150'];

export function TriageStage({ st, running, auto, act, setHidden }: {
  st: BenchState; running: boolean; auto: boolean;
  act: (id: string, v: number) => void; setHidden: (id: string, v: number) => void;
}) {
  const canAct = running && !auto;
  const t = st.t;
  const pick = Math.round(st.controls.pick || 0), level = Math.round(st.controls.level || 0), dest = Math.round(st.controls.dest || 0);
  const arrived = TRIAGE_PATIENTS.filter(p => p.arrive <= t);
  const cur = TRIAGE_PATIENTS.find(p => p.id === pick) || null;
  const lv = (id: number) => Math.round(st.controls[`lv${id}`] || 0), ds = (id: number) => Math.round(st.controls[`ds${id}`] || 0), measured = (id: number) => st.controls[`m${id}`] === 1;
  const [asked, setAsked] = useState<Record<number, boolean>>({});
  const [measuring, setMeasuring] = useState<{ id: number; until: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const lastArr = useRef(0);
  const alarm = t >= 85 && lv(4) === 0 && TRIAGE_PATIENTS[3].arrive <= t;

  // 新病人到：闪一下
  useEffect(() => { const n = arrived.length; if (n > lastArr.current) { lastArr.current = n; setFlash(`新到：${arrived[n - 1].name}（${arrived[n - 1].complaint}）`); const k = setTimeout(() => setFlash(null), 3500); return () => clearTimeout(k); } }, [arrived]);
  // 量体征：按下去 4 秒后出数
  // setHidden 每次渲染都是新函数，不能放进依赖（放了定时器每拍被清、永远量不完）
  useEffect(() => { if (!measuring) return; const k = setTimeout(() => { setHidden(`m${measuring.id}`, 1); setMeasuring(null); }, 4000); return () => clearTimeout(k); }, [measuring]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 演示：脚本直接写 mN，问诊也标上
  useEffect(() => { if (auto && cur && !asked[cur.id] && st.events.some(e => e.kind === 'control' && e.control === 'ask' && e.t >= (cur.arrive))) setAsked(a => ({ ...a, [cur.id]: true })); }, [auto, cur, st.events, asked]);

  const choose = (id: number) => { if (!canAct) return; act('pick', id); act('level', lv(id)); act('dest', ds(id)); };
  const measure = () => { if (!canAct || !cur || measuring) return; act('measure', 1); setMeasuring({ id: cur.id, until: performance.now() + 4000 }); };
  const ask = () => { if (!canAct || !cur) return; act('ask', 1); setAsked(a => ({ ...a, [cur.id]: true })); };
  const confirm = () => { if (!canAct || !cur || !level) return; act('confirm', 1); setHidden(`lv${cur.id}`, level); setHidden(`ds${cur.id}`, dest); };

  const card = (p: typeof TRIAGE_PATIENTS[number]) => {
    const l = lv(p.id), wait = Math.max(0, t - p.arrive), sel = pick === p.id;
    const worry = p.critical && !l && wait > 45;
    return (
      <button key={p.id} disabled={!canAct} onClick={() => choose(p.id)} style={{ textAlign: 'left', width: '100%', padding: '10px 12px', marginBottom: 8, borderRadius: 12, border: sel ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: l ? '#fff' : worry ? '#fff0f3' : '#fffdf5', cursor: canAct ? 'pointer' : 'default', color: '#171a2e', boxShadow: sel ? '0 8px 24px rgba(106,92,255,.18)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: l ? LV_COLOR[l] : '#c9cbe0', flexShrink: 0 }} />
          <b style={{ fontSize: 14 }}>{p.name}</b><span style={{ fontSize: 12, color: '#6b7089' }}>{p.age}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: worry ? '#d6336c' : '#6b7089', fontWeight: worry ? 800 : 500 }}>{l ? `${LEVELS[l]} · ${DESTS[ds(p.id)]}` : `等 ${Math.floor(wait)} 秒`}</span>
        </div>
        <div style={{ fontSize: 13, marginTop: 4, color: '#2b2f4a' }}>{p.complaint}</div>
        {p.id === 4 && alarm && <div style={{ marginTop: 4, fontSize: 12.5, color: '#d6336c', fontWeight: 800 }}>⚠ 候诊区血氧 84%，快处理</div>}
      </button>
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f3f5fa', color: '#171a2e', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif', display: 'grid', gridTemplateRows: '52px minmax(0, 1fr)', gridTemplateColumns: '330px minmax(0, 1fr) 320px', overflow: 'hidden' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', background: '#fff', borderBottom: '1px solid rgba(23,26,46,.1)' }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>急诊预检分诊 · 20:0{Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')}</span>
        <span style={{ fontSize: 12.5, color: '#6b7089' }}>到达 {arrived.length} · 已分 {Math.round(st.vars.done || 0)} · 抢救室空床 {Math.max(0, 2 - TRIAGE_PATIENTS.filter(p => ds(p.id) === 2 && lv(p.id)).length)}</span>
        {flash && <span style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 999, background: '#e9e6ff', color: '#4b3fd6', fontSize: 13, fontWeight: 700 }}>{flash}</span>}
        {alarm && <span style={{ marginLeft: flash ? 8 : 'auto', padding: '5px 12px', borderRadius: 999, background: '#d6336c', color: '#fff', fontSize: 13, fontWeight: 800 }}>⚠ 候诊区报警：王秀兰 SpO₂ 84%</span>}
      </div>
      {/* 队列 */}
      <div style={{ padding: 14, overflow: 'auto', borderRight: '1px solid rgba(23,26,46,.08)' }}>
        <div style={{ fontSize: 12, color: '#6b7089', marginBottom: 8, letterSpacing: '.06em' }}>到达队列 · 点一个叫号</div>
        {arrived.map(card)}
        {arrived.length < TRIAGE_PATIENTS.length && <div style={{ fontSize: 12.5, color: '#9aa0b8', marginTop: 6 }}>还会有人到……</div>}
      </div>
      {/* 病人 */}
      <div style={{ padding: 20, overflow: 'auto', minWidth: 0 }}>
        {!cur ? <div style={{ color: '#6b7089', fontSize: 15, marginTop: 40 }}>左边点一个病人开始。先看谁？胸痛出汗的那位等不起。</div> : (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid rgba(23,26,46,.08)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><b style={{ fontSize: 20 }}>{cur.name}</b><span style={{ color: '#6b7089' }}>{cur.age}</span><span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7089' }}>到达 {Math.floor(cur.arrive / 60)}:{String(cur.arrive % 60).padStart(2, '0')}</span></div>
              <div style={{ marginTop: 8, fontSize: 15 }}><b>主诉：</b>{cur.complaint}</div>
              <div style={{ marginTop: 4, fontSize: 14, color: '#2b2f4a' }}><b>一眼看上去：</b>{cur.look}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid rgba(23,26,46,.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><b>生命体征</b><button disabled={!canAct || measured(cur.id) || !!measuring} onClick={measure} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: 'none', background: measured(cur.id) ? '#e6f6ec' : '#6a5cff', color: measured(cur.id) ? '#12a150' : '#fff', fontWeight: 700, cursor: canAct ? 'pointer' : 'default', fontSize: 13 }}>{measured(cur.id) ? '已测' : measuring?.id === cur.id ? '测量中…' : '量生命体征（4 秒）'}</button></div>
                {measured(cur.id) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 15 }}>
                    {[['心率', `${cur.vitals.hr}`, cur.vitals.hr > 120 || cur.vitals.hr < 50], ['血压', cur.vitals.bp, cur.vitals.bp.startsWith('7') || cur.vitals.bp.startsWith('8')], ['血氧', `${cur.vitals.spo2}%`, cur.vitals.spo2 < 92], ['体温', `${cur.vitals.temp}℃`, cur.vitals.temp >= 39.5], ['呼吸', `${cur.vitals.rr}/分`, cur.vitals.rr >= 28]].map(([k, v, bad]) => <div key={k as string} style={{ padding: '6px 10px', borderRadius: 8, background: bad ? '#fff0f3' : '#f6f7fb', color: bad ? '#d6336c' : '#171a2e', fontWeight: bad ? 800 : 600 }}>{k}：{v}</div>)}
                  </div>
                ) : <div style={{ color: '#9aa0b8', fontSize: 13.5 }}>{measuring?.id === cur.id ? '袖带在充气……' : '还没量。看着轻的也要量一下。'}</div>}
              </div>
              <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid rgba(23,26,46,.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><b>问诊</b><button disabled={!canAct || !!asked[cur.id]} onClick={ask} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: 'none', background: asked[cur.id] ? '#e6f6ec' : '#12b5cb', color: asked[cur.id] ? '#12a150' : '#fff', fontWeight: 700, cursor: canAct ? 'pointer' : 'default', fontSize: 13 }}>{asked[cur.id] ? '已问' : '问两句'}</button></div>
                <div style={{ fontSize: 14, color: asked[cur.id] ? '#171a2e' : '#9aa0b8', lineHeight: 1.7 }}>{asked[cur.id] ? cur.history : '什么时候开始的、有没有基础病、吃过什么药？'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* 分级 */}
      <div style={{ padding: 16, borderLeft: '1px solid rgba(23,26,46,.08)', background: '#fff', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em' }}>分级（四级）</div>
        {[1, 2, 3, 4].map(l => <button key={l} disabled={!canAct || !cur} onClick={() => act('level', l)} style={{ padding: '12px 14px', borderRadius: 12, textAlign: 'left', border: level === l ? `2px solid ${LV_COLOR[l]}` : '1px solid rgba(23,26,46,.12)', background: level === l ? `${LV_COLOR[l]}14` : '#fff', color: '#171a2e', fontWeight: 800, fontSize: 15, cursor: canAct && cur ? 'pointer' : 'default' }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: LV_COLOR[l], marginRight: 10 }} />{LEVELS[l]}
          <div style={{ fontSize: 12, color: '#6b7089', fontWeight: 500, marginTop: 2 }}>{l === 1 ? '随时可能死，立刻抢救' : l === 2 ? '10 分钟内必须有医生' : l === 3 ? '30 分钟内看，候诊要盯' : '可以等，按号来'}</div>
        </button>)}
        <div style={{ fontSize: 12, color: '#6b7089', letterSpacing: '.06em', marginTop: 4 }}>去向</div>
        <div style={{ display: 'flex', gap: 6 }}>{DESTS.map((d, i) => <button key={d} disabled={!canAct || !cur} onClick={() => act('dest', i)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: dest === i ? '2px solid #6a5cff' : '1px solid rgba(23,26,46,.12)', background: dest === i ? '#efedff' : '#fff', fontWeight: 700, fontSize: 13, cursor: canAct && cur ? 'pointer' : 'default', color: '#171a2e' }}>{d}</button>)}</div>
        <button disabled={!canAct || !cur || !level} onClick={confirm} style={{ marginTop: 'auto', padding: '14px 0', borderRadius: 12, border: 'none', background: cur && level ? 'linear-gradient(135deg,#6a5cff,#12b5cb)' : '#c9cbe0', color: '#fff', fontWeight: 800, fontSize: 15, cursor: canAct && cur && level ? 'pointer' : 'default' }}>{cur && lv(cur.id) ? '改分诊' : '确认分诊'}</button>
      </div>
    </div>
  );
}
