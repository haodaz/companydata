'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Sim, SimReveal, SimStep, SimTrace } from '@/lib/skill-sim';
import { compareStep, describeStep } from '@/lib/skill-sim';
import { BenchRunner, SnapshotStrip } from '@/components/lab/BenchRunner';
import type { BenchTrace } from '@/lib/bench';

/** 下钻 / 回复后浮现的数据面板：带动画的对比条 */
function RevealPanel({ reveal }: { reveal: SimReveal }) {
  const max = Math.max(1, ...(reveal.rows || []).flatMap(r => [parseFloat(r.a || '0') || 0, parseFloat(r.b || '0') || 0]));
  return (
    <div className="lab-in" style={{ marginTop: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(23,26,46,.04)', border: '1px dashed rgba(106,92,255,.3)' }}>
      <div className="lab-mono" style={{ fontSize: 11, color: 'var(--v)', fontWeight: 700, marginBottom: 8 }}>▸ {reveal.title}</div>
      {(reveal.rows || []).map(r => {
        const a = parseFloat(r.a || ''), b = parseFloat(r.b || '');
        return (
          <div key={r.label} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, gap: 8 }}>
              <span style={{ fontWeight: r.hot ? 700 : 500, color: r.hot ? '#d6336c' : 'var(--ink2)' }}>{r.label}</span>
              <span className="lab-mono" style={{ letterSpacing: 0, color: r.hot ? '#d6336c' : 'var(--ink3)', whiteSpace: 'nowrap' }}>{r.a && r.a !== '—' ? `${r.a} → ` : ''}{r.b}{r.delta ? `  ${r.delta}` : ''}</span>
            </div>
            {Number.isFinite(b) && (
              <div style={{ position: 'relative', height: 6, marginTop: 4, borderRadius: 3, background: 'rgba(106,92,255,.10)' }}>
                {Number.isFinite(a) && <div style={{ position: 'absolute', inset: 0, width: `${(a / max) * 100}%`, borderRadius: 3, background: 'rgba(106,92,255,.22)' }} />}
                <div style={{ position: 'absolute', inset: 0, width: `${(b / max) * 100}%`, borderRadius: 3, background: r.hot ? 'linear-gradient(90deg,#ff5fa2,#ff8a5f)' : 'linear-gradient(90deg,var(--v),var(--c))', transition: 'width .9s cubic-bezier(.2,.8,.2,1)' }} />
              </div>
            )}
          </div>
        );
      })}
      {reveal.note && <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.75 }}>{reveal.note}</div>}
    </div>
  );
}

function Scene({ scene }: { scene: NonNullable<SimStep['scene']> }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const iv = setInterval(() => setN(v => { if (v >= scene.text.length) { clearInterval(iv); return v; } return v + 2; }), 18);
    return () => clearInterval(iv);
  }, [scene.text]);
  const me = scene.who === '你';
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
      <div style={{ width: 40, height: 40, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 15, background: me ? 'linear-gradient(135deg,var(--c),#5fd6e6)' : 'linear-gradient(135deg,#ffb15f,#ff5fa2)' }}>{scene.who.slice(0, 1)}</div>
      <div style={{ minWidth: 0 }}>
        <div className="lab-mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>{scene.who}{scene.time ? ` · ${scene.time}` : ''}</div>
        <div className={n < scene.text.length ? 'lab-caret' : ''} style={{ marginTop: 3, fontSize: 15, lineHeight: 1.75, color: 'var(--ink)' }}>{scene.text.slice(0, n)}</div>
      </div>
    </div>
  );
}

const tile = (on: boolean, disabled = false): React.CSSProperties => ({
  padding: '12px 14px', borderRadius: 14, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all .18s', opacity: disabled ? 0.45 : 1,
  border: on ? '1.5px solid var(--v)' : '1px solid var(--line)', background: on ? 'rgba(106,92,255,.08)' : 'rgba(255,255,255,.7)',
  boxShadow: on ? '0 6px 18px rgba(106,92,255,.18)' : 'none',
});

export interface SimRunnerProps {
  sim: Sim;
  /** 身份：决定文案 */
  role: 'rookie' | 'expert';
  busy?: boolean;
  onFinish: (trace: SimTrace) => void;
  onCancel: () => void;
}

/** 模拟操作台：一步一步操作，每一步确认后才推进；下钻 / 询问会浮现新的信息 */
export function SimRunner({ sim, role, busy, onFinish, onCancel }: SimRunnerProps) {
  const [idx, setIdx] = useState(0);
  const [trace, setTrace] = useState<SimTrace>({});
  const [confirmed, setConfirmed] = useState(false);
  const step = sim.steps[idx];
  const value = trace[step.id];
  const set = (v: any) => setTrace(t => ({ ...t, [step.id]: v }));
  const last = idx === sim.steps.length - 1;

  // 每步的默认值
  useEffect(() => {
    setConfirmed(false);
    setTrace(t => {
      if (t[step.id] !== undefined) return t;
      const init = step.type === 'multi' || step.type === 'drill' ? [] : step.type === 'classify' ? {} : step.type === 'allocate' ? Object.fromEntries((step.options || []).map(o => [o.id, 0])) : step.type === 'slider' ? 50 : step.type === 'text' ? '' : undefined;
      return init === undefined ? t : { ...t, [step.id]: init };
    });
  }, [step]);

  const allocated = step.type === 'allocate' ? (Object.values(value || {}) as number[]).reduce((a, b) => a + (b || 0), 0) : 0;
  const ready = useMemo(() => {
    switch (step.type) {
      case 'choose': return !!value;
      case 'multi': case 'drill': return (value || []).length > 0;
      case 'classify': return (step.options || []).every(o => value?.[o.id]);
      case 'allocate': return allocated === step.total;
      case 'text': return (value || '').trim().length >= 20;
      case 'bench': return !!value?.finished;
      default: return true;
    }
  }, [step, value, allocated]);

  // choose 步骤选中后，确认才浮现对方的回复
  const chosenReveal = step.type === 'choose' && confirmed ? step.options?.find(o => o.id === value)?.reveal : null;
  const needsReveal = step.type === 'choose' && !!step.options?.find(o => o.id === value)?.reveal;

  const next = () => {
    if (needsReveal && !confirmed) { setConfirmed(true); return; }
    if (last) onFinish(trace); else setIdx(i => i + 1);
  };

  const toggle = (id: string) => {
    const cur: string[] = value || [];
    if (cur.includes(id)) { if (step.type !== 'drill') set(cur.filter(x => x !== id)); return; } // 下钻看过的数据收不回去
    if (step.max && cur.length >= step.max) return;
    set([...cur, id]);
  };

  return (
    <div className={`lab-glass${busy ? ' lab-scan' : ''}`} style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
      {/* 进度轨 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span className="lab-mono lab-cap" style={{ marginRight: 6, whiteSpace: 'nowrap' }}>{role === 'expert' ? 'EXPERT RUN' : 'SIMULATION'} · {String(idx + 1).padStart(2, '0')}/{String(sim.steps.length).padStart(2, '0')}</span>
        {sim.steps.map((s, i) => <span key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, background: i < idx ? 'linear-gradient(90deg,var(--v),var(--c))' : i === idx ? 'var(--v)' : 'rgba(106,92,255,.14)', transition: 'background .4s' }} />)}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20 }}>{sim.title}{idx === 0 ? ` —— ${sim.intro}` : ''}</div>

      <div key={step.id} className="lab-in">
        {step.scene && <Scene scene={step.scene} />}
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14, lineHeight: 1.5 }}>
          {step.prompt}
          {(step.type === 'multi' || step.type === 'drill') && step.max && <span className="lab-mono" style={{ marginLeft: 10, fontSize: 12, color: 'var(--v)' }}>{(value || []).length}/{step.max}</span>}
        </div>

        {step.type === 'choose' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {step.options!.map((o, i) => (
              <div key={o.id} style={tile(value === o.id, confirmed && value !== o.id)} onClick={() => !confirmed && set(o.id)}>
                <span className="lab-mono" style={{ color: 'var(--v)', fontWeight: 700, marginRight: 10 }}>{String.fromCharCode(65 + i)}</span>{o.label}
                {o.detail && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3, paddingLeft: 24 }}>{o.detail}</div>}
              </div>
            ))}
            {chosenReveal && <RevealPanel reveal={chosenReveal} />}
            {confirmed && !chosenReveal && <div className="lab-in" style={{ fontSize: 13, color: 'var(--ink3)' }}>（没有得到新的信息）</div>}
          </div>
        )}

        {(step.type === 'multi' || step.type === 'drill') && (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: step.type === 'drill' ? 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' : '1fr' }}>
            {step.options!.map(o => {
              const on = (value || []).includes(o.id);
              const full = !on && !!step.max && (value || []).length >= step.max;
              return (
                <div key={o.id} style={{ ...tile(on, full), alignSelf: 'start' }} onClick={() => !full && toggle(o.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 18, height: 18, borderRadius: step.type === 'drill' ? 9 : 5, border: on ? 'none' : '1.5px solid rgba(106,92,255,.4)', background: on ? 'var(--v)' : 'transparent', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on ? '✓' : ''}</span>
                    <span style={{ fontWeight: 600 }}>{o.label}</span>
                    {step.type === 'drill' && !on && <span className="lab-mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink3)' }}>点击下钻</span>}
                  </div>
                  {o.detail && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3, paddingLeft: 28 }}>{o.detail}</div>}
                  {step.type === 'drill' && on && o.reveal && <RevealPanel reveal={o.reveal} />}
                </div>
              );
            })}
            {step.type === 'multi' && (value || []).length > 0 && (
              <div className="lab-in" style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.8 }}>
                这次<b style={{ color: '#d6336c' }}>不做</b>：{step.options!.filter(o => !(value || []).includes(o.id)).map(o => o.label).join('、')}
              </div>
            )}
          </div>
        )}

        {step.type === 'classify' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {step.options!.map(o => (
              <div key={o.id} style={{ ...tile(false), cursor: 'default', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}><div style={{ fontWeight: 600 }}>{o.label}</div>{o.detail && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{o.detail}</div>}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {step.labels!.map(l => {
                    const on = value?.[o.id] === l.id;
                    const color = l.tone === 'hot' ? '#d6336c' : l.tone === 'cold' ? '#0a8fa3' : 'var(--v)';
                    return <span key={l.id} onClick={() => set({ ...(value || {}), [o.id]: l.id })} style={{ padding: '6px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all .15s', color: on ? '#fff' : color, background: on ? color : 'transparent', border: `1.5px solid ${color}` }}>{l.label}</span>;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {step.type === 'allocate' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span className="lab-mono" style={{ fontSize: 30, fontWeight: 800, letterSpacing: 0, color: allocated === step.total ? '#12a150' : allocated > step.total! ? '#dc2626' : 'var(--v)' }}>{step.total! - allocated}</span>
              <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{step.unit} 还没分配（共 {step.total}{step.unit}）</span>
            </div>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(106,92,255,.10)', marginBottom: 16 }}>
              {step.options!.map((o, i) => <div key={o.id} style={{ width: `${((value?.[o.id] || 0) / step.total!) * 100}%`, background: ['#6a5cff', '#12b5cb', '#ff5fa2', '#ffb15f', '#8f7bff', '#9aa0b8'][i % 6], transition: 'width .3s' }} />)}
            </div>
            {step.options!.map((o, i) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: ['#6a5cff', '#12b5cb', '#ff5fa2', '#ffb15f', '#8f7bff', '#9aa0b8'][i % 6], flexShrink: 0 }} />
                <span style={{ flex: '1 1 150px', fontWeight: 600, fontSize: 14 }}>{o.label}</span>
                <input type="range" min={0} max={step.total} value={value?.[o.id] || 0} onChange={e => set({ ...(value || {}), [o.id]: Number(e.target.value) })} style={{ flex: '2 1 160px', accentColor: '#6a5cff' }} />
                <span className="lab-mono" style={{ width: 64, textAlign: 'right', fontWeight: 700, letterSpacing: 0 }}>{value?.[o.id] || 0}{step.unit}</span>
              </div>
            ))}
            {(() => { const n = step.options!.filter(o => (value?.[o.id] || 0) > 0).length; return n > 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>这笔预算被分到了 <b style={{ color: n > 4 ? '#d6336c' : 'var(--ink2)' }}>{n}</b> 处。</div>; })()}
          </div>
        )}

        {step.type === 'slider' && (
          <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
            <div className="lab-mono" style={{ fontSize: 54, fontWeight: 800, letterSpacing: 0, background: 'linear-gradient(120deg,var(--v),var(--c))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{value ?? 50}{step.unit}</div>
            <input type="range" min={step.min ?? 0} max={step.maxValue ?? 100} value={value ?? 50} onChange={e => set(Number(e.target.value))} style={{ width: '100%', maxWidth: 520, accentColor: '#6a5cff' }} />
          </div>
        )}

        {step.type === 'bench' && step.bench && (
          value?.finished ? (
            <div className="lab-in" style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(18,161,80,.07)', border: '1px solid rgba(18,161,80,.25)' }}>
              <div style={{ fontWeight: 700, color: '#0d7a3d', marginBottom: 4 }}>这段操作已记录</div>
              <div style={{ fontSize: 13.5, color: 'var(--ink2)' }}>{describeStep(step, value)}</div>
              <SnapshotStrip trace={value as BenchTrace} />
              <button className="lab-btn ghost" style={{ marginTop: 6 }} onClick={() => set(undefined)}>重新操作</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.75, marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(106,92,255,.06)' }}>{step.bench.brief}</div>
              <BenchRunner key={step.id} spec={step.bench} role={role} onFinish={tr => set(tr)} onCancel={onCancel} />
            </div>
          )
        )}

        {step.type === 'text' && <textarea className="lab-input" rows={9} value={value || ''} onChange={e => set(e.target.value)} placeholder={step.placeholder || '写下你的结论……'} />}
      </div>

      {!(step.type === 'bench' && !value?.finished) && <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="lab-btn" disabled={!ready || busy} onClick={next}>
          {busy ? <>AI 核心处理中<span className="lab-dots" /></> : needsReveal && !confirmed ? '确认操作' : last ? (role === 'expert' ? '操作完毕，接受追问 →' : '操作完毕，请 AI 核心评分 →') : '下一步 →'}
        </button>
        {idx > 0 && !busy && <button className="lab-btn ghost" onClick={() => setIdx(i => i - 1)}>上一步</button>}
        <button className="lab-btn ghost" disabled={busy} onClick={onCancel} style={{ marginLeft: 'auto' }}>退出操作台</button>
      </div>}
    </div>
  );
}

/** 操作回放：逐步对照「我的操作 / 专家的操作」 */
export function TraceCompare({ sim, trace, expertTrace, expertName }: { sim: Sim; trace: SimTrace; expertTrace?: SimTrace | null; expertName?: string }) {
  return (
    <div>
      {sim.steps.filter(s => s.type !== 'text').map((s, i) => {
        const m = compareStep(s, trace?.[s.id], expertTrace?.[s.id]);
        const tone = m === null ? 'var(--ink3)' : m === 1 ? '#12a150' : m === 0.5 ? '#d97706' : '#dc2626';
        const why = expertTrace?._why?.[s.id];
        return (
          <div key={s.id} style={{ display: 'flex', gap: 12, paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--line)' }}>
            <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: tone }}>{m === null ? i + 1 : m === 1 ? '✓' : m === 0.5 ? '≈' : '✗'}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>{s.prompt}</div>
              <div style={{ fontSize: 14, lineHeight: 1.75, marginTop: 3 }}>{describeStep(s, trace?.[s.id])}</div>
              {s.type === 'bench' && trace?.[s.id]?.events && <SnapshotStrip trace={trace[s.id] as BenchTrace} />}
              {expertTrace && m !== 1 && <div style={{ fontSize: 13, lineHeight: 1.75, marginTop: 4, padding: '6px 10px', borderRadius: 10, background: 'rgba(18,161,80,.07)', color: '#0d7a3d' }}><b>{expertName || '专家'}在这一步：</b>{describeStep(s, expertTrace[s.id])}</div>}
              {why && <div className="lab-mono" style={{ fontSize: 11.5, color: 'var(--v)', marginTop: 4, letterSpacing: '.02em' }}>AI 核心在这一步追问过：{why}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
