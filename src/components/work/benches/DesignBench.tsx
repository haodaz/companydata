'use client';

/** 设计台：像 CAD——网格画布 + 标尺 + 左工具栏（选择 / 折线 / 撤销）+ 右侧属性（参数表）与图层（线），底部状态栏（坐标 / 缩放） */
import React, { useState } from 'react';

export type SketchLine = { pts: [number, number][]; label: string };
export function DesignBench({ params, values, onParam, onParamDone, sketch, setSketch, hint, notes, onNotes, onPaste, onSketch, leading }: { leading?: React.ReactNode;
  params: { name: string; unit?: string; hint?: string }[]; values: Record<string, string>; onParam: (k: string, v: string) => void; onParamDone: (k: string) => void;
  sketch: SketchLine[]; setSketch: (f: (s: SketchLine[]) => SketchLine[]) => void; hint?: string; notes: string; onNotes: (v: string) => void; onPaste: (e: React.ClipboardEvent) => void; onSketch: (label: string) => void;
}) {
  const [tool, setTool] = useState<'select' | 'line'>('line');
  const [cur, setCur] = useState<[number, number][]>([]);
  const [label, setLabel] = useState('');
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const [side, setSide] = useState<'props' | 'layers'>('props');
  const W = 900, H = 460, G = 20;
  const snap = (v: number) => Math.round(v / (G / 2)) * (G / 2);
  const toPt = (e: React.MouseEvent<SVGSVGElement>): [number, number] => { const r = e.currentTarget.getBoundingClientRect(); const sx = W / r.width, sy = H / r.height; return [snap((e.clientX - r.left) * sx), snap((e.clientY - r.top) * sy)]; };
  const click = (e: React.MouseEvent<SVGSVGElement>) => { if (tool !== 'line') return; const p = toPt(e); setCur(c => [...c, p]); };   // 先取坐标：React 事件在 setState 回调里 currentTarget 已为空
  const dbl = () => { if (cur.length >= 2) { const l = label.trim(); setSketch(s => [...s, { pts: cur, label: l }]); onSketch(l); setLabel(''); } setCur([]); };
  const len = (pts: [number, number][]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f4f5f9', borderRadius: 14, overflow: 'hidden', border: '1px solid #d9dbe6' }}>
      {/* 顶部菜单条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '7px 12px', background: '#2b2d3e', color: '#d6d8e6', fontSize: 12.5, whiteSpace: 'nowrap' }}>
        {leading}
        <span style={{ marginLeft: 'auto', color: '#aab', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12 }}>{hint ? hint.slice(0, 40) : ''}</span>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 420 }}>
        {/* 左工具栏 */}
        <div style={{ width: 46, background: '#f0f1f6', borderRight: '1px solid #d9dbe6', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 6 }}>
          {([['select', '↖', '选择'], ['line', '╱', '折线（点一下加点，双击结束）']] as const).map(([k, g, t]) => <button key={k} title={t} onClick={() => setTool(k)} style={{ width: 32, height: 32, borderRadius: 8, border: tool === k ? '1px solid #6055f5' : '1px solid transparent', background: tool === k ? '#e4e7f5' : 'transparent', cursor: 'pointer', fontSize: 15 }}>{g}</button>)}
          <button title="撤销上一条线" onClick={() => setSketch(s => s.slice(0, -1))} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', fontSize: 14 }}>↶</button>
          <button title="清空当前未完成的线" onClick={() => setCur([])} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        {/* 画布 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#fbfbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#fff', borderBottom: '1px solid #e6e8f0', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ color: '#888' }}>标注</span>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="这条线标什么：外轮廓 / 孔位 / 尺寸 120mm" style={{ flex: 1, maxWidth: 360, border: '1px solid #d9dbe6', borderRadius: 6, padding: '4px 8px', fontSize: 12.5, outline: 'none' }} />
            <span style={{ color: '#aaa' }}>先写标注，再画线；双击结束一条线</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMin meet" onClick={click} onDoubleClick={dbl} onMouseMove={e => setPos(toPt(e))} style={{ width: '100%', aspectRatio: `${W} / ${H}`, background: '#fbfbfe', cursor: tool === 'line' ? 'crosshair' : 'default', display: 'block' }}>
            <defs>
              <pattern id="g1" width={G} height={G} patternUnits="userSpaceOnUse"><path d={`M ${G} 0 L 0 0 0 ${G}`} fill="none" stroke="#e9ebf3" strokeWidth={1} /></pattern>
              <pattern id="g5" width={G * 5} height={G * 5} patternUnits="userSpaceOnUse"><rect width={G * 5} height={G * 5} fill="url(#g1)" /><path d={`M ${G * 5} 0 L 0 0 0 ${G * 5}`} fill="none" stroke="#d5d8e6" strokeWidth={1} /></pattern>
            </defs>
            <rect width={W} height={H} fill="url(#g5)" />
            {/* 标尺 */}
            <rect x={0} y={0} width={W} height={16} fill="#f0f1f6" /><rect x={0} y={0} width={16} height={H} fill="#f0f1f6" />
            {Array.from({ length: W / (G * 5) + 1 }, (_, i) => <g key={'x' + i}><line x1={i * G * 5} y1={10} x2={i * G * 5} y2={16} stroke="#999" /><text x={i * G * 5 + 2} y={9} fontSize={8} fill="#888" fontFamily={mono}>{i * G * 5}</text></g>)}
            {Array.from({ length: H / (G * 5) + 1 }, (_, i) => <g key={'y' + i}><line x1={10} y1={i * G * 5} x2={16} y2={i * G * 5} stroke="#999" /><text x={2} y={i * G * 5 + 9} fontSize={8} fill="#888" fontFamily={mono}>{i * G * 5}</text></g>)}
            {sketch.map((l, i) => <g key={i}>
              <polyline points={l.pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#1f3a8a" strokeWidth={2} strokeLinejoin="round" />
              {l.pts.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r={2.5} fill="#1f3a8a" />)}
              <text x={l.pts[0][0] + 5} y={l.pts[0][1] - 6} fontSize={11} fill="#1f3a8a" fontFamily={mono}>{l.label || `L${i + 1}`} · {Math.round(len(l.pts))}</text>
            </g>)}
            {cur.length > 0 && <g><polyline points={cur.map(p => p.join(',')).join(' ')} fill="none" stroke="#fa8c16" strokeWidth={2} strokeDasharray="5 4" />{cur.map((p, j) => <circle key={j} cx={p[0]} cy={p[1]} r={3} fill="#fa8c16" />)}</g>}
          </svg>
          <div style={{ display: 'flex', gap: 16, padding: '5px 12px', background: '#2b2d3e', color: '#aab', fontSize: 11.5, fontFamily: mono, marginTop: 'auto' }}>
            <span>X {pos[0]}  Y {pos[1]}</span><span>栅格 {G}</span><span>缩放 100%</span><span>{tool === 'line' ? '折线' : '选择'}</span><span style={{ marginLeft: 'auto' }}>{sketch.length} 条线{cur.length ? ` · 画着第 ${sketch.length + 1} 条（${cur.length} 点）` : ''}</span>
          </div>
        </div>
        {/* 右侧：属性 / 图层 */}
        <div style={{ width: 300, borderLeft: '1px solid #d9dbe6', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e6e8f0', fontSize: 12.5 }}>{([['props', '属性 · 参数表'], ['layers', `图层 · ${sketch.length}`]] as const).map(([k, l]) => <button key={k} onClick={() => setSide(k)} style={{ flex: 1, padding: '8px 0', border: 0, borderBottom: side === k ? '2px solid #6055f5' : '2px solid transparent', background: 'transparent', cursor: 'pointer', fontWeight: side === k ? 700 : 500, color: side === k ? '#1a1a2e' : '#777' }}>{l}</button>)}</div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {side === 'props' ? params.map(p => <div key={p.name} style={{ padding: '8px 12px', borderBottom: '1px solid #f0f1f6' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input data-param={p.name} value={values[p.name] || ''} onChange={e => onParam(p.name, e.target.value)} onBlur={() => onParamDone(p.name)} style={{ flex: 1, border: '1px solid #d9dbe6', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: mono, outline: 'none' }} /><span style={{ fontSize: 12, color: '#888', minWidth: 28 }}>{p.unit}</span></div>
              {p.hint && <div style={{ fontSize: 11.5, color: '#999', marginTop: 3, lineHeight: 1.5 }}>{p.hint}</div>}
            </div>) : (sketch.length ? sketch.map((l, i) => <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid #f0f1f6', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 10, height: 10, background: '#1f3a8a', borderRadius: 2 }} /><span style={{ flex: 1 }}>{l.label || `L${i + 1}`}</span><span style={{ color: '#999', fontFamily: mono }}>{l.pts.length} 点 · {Math.round(len(l.pts))}</span></div>) : <div style={{ padding: 16, color: '#aaa', fontSize: 12.5 }}>还没有线。先写标注，在画布上点一下加点、双击结束。</div>)}
          </div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid #d9dbe6', padding: '8px 12px', background: '#fafbff' }}>
        <div style={{ fontSize: 11.5, color: '#888', letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>设计说明（取值依据、校核、风险）</div>
        <textarea value={notes} onChange={e => onNotes(e.target.value)} onPaste={onPaste} style={{ width: '100%', minHeight: 90, border: '1px solid #d9dbe6', borderRadius: 8, padding: '8px 10px', fontSize: 13.5, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
      </div>
    </div>
  );
}
