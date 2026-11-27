'use client';

/** 交付后两问（lib/work/reflect.ts）：嵌在提交前的「AI 参与说明」框里，只在评分方式是 AI 驾驭量表时出现 */
import React from 'react';
import { FIX_WAYS, type AiReflect } from '@/lib/work/reflect';

export function ReflectFields({ v, set, L, line = '#e0e0ee' }: { v: AiReflect; set: (r: AiReflect) => void; L: (zh: string, en: string) => string; line?: string }) {
  const box: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${line}`, borderRadius: 8, padding: '7px 10px', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' };
  const lab: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '12px 0 4px' };
  return (
    <div>
      <div style={lab}>{L('1. 这份成果里，AI 的贡献大概占多少？', '1. Roughly how much of this work came from AI?')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="range" min={0} max={100} step={5} value={v.share ?? 50} onChange={e => set({ ...v, share: Number(e.target.value) })} onPointerUp={e => { if (v.share == null) set({ ...v, share: Number((e.target as HTMLInputElement).value) }); }} style={{ flex: 1, accentColor: '#6055f5', opacity: v.share == null ? 0.45 : 1 }} aria-label={L('AI 贡献度', 'AI contribution')} />
        <b style={{ width: 52, textAlign: 'right', color: v.share == null ? '#aaa' : '#4c43c9' }}>{v.share == null ? L('未选', '—') : `${v.share}%`}</b>
      </div>
      <div style={lab}>{L('2. 对 AI 这次的表现，最满意和最不满意的各是哪一处？', '2. What was the best and the worst thing AI did here?')}</div>
      <textarea className="wk-ta" value={v.best || ''} onChange={e => set({ ...v, best: e.target.value })} rows={2} placeholder={L('最满意：比如「竞品表的结构一次就对了，省了半小时」', 'Best: e.g. "It got the competitor table structure right first time"')} style={box} />
      <textarea className="wk-ta" value={v.worst || ''} onChange={e => set({ ...v, worst: e.target.value })} rows={2} placeholder={L('最不满意：比如「第二个结论把增长率算反了」；觉得都还行也可以写「没有」', 'Worst: e.g. "It got the growth rate backwards in the second conclusion". "None" is fine too.')} style={{ ...box, marginTop: 6 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: '#666' }}>{L('不满意的那处怎么处理的：', 'What you did about it:')}</span>
        {FIX_WAYS.map(f => { const on = v.fix === f.id; return <button key={f.id} type="button" onClick={() => set({ ...v, fix: on ? '' : f.id })} style={{ border: `1px solid ${on ? '#6055f5' : line}`, background: on ? '#efedff' : '#fff', color: on ? '#4c43c9' : '#555', borderRadius: 999, padding: '3px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{L(f.zh, f.en)}</button>; })}
      </div>
    </div>
  );
}
