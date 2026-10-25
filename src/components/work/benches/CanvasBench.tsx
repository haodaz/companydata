'use client';

/**
 * 画布台（2026-10-25）：流程图 / 泳道图 / 思维导图 / 架构图。拖节点、连线、双击改字、可开泳道。
 * 交付时由 canvasToText 转成 Mermaid + 节点清单（评卷读文本）。
 */
import React, { useRef, useState } from 'react';
import type { CanvasEdge, CanvasGraph, CanvasNode } from '@/lib/work/modules';

const W = 180, H = 46;
export function CanvasBench({ graph, onChange, notes, onNotes, onPaste, onEvent, hint }: { graph: CanvasGraph; onChange: (f: (g: CanvasGraph) => CanvasGraph) => void; notes: string; onNotes: (v: string) => void; onPaste: (e: React.ClipboardEvent) => void; onEvent?: (type: string, extra?: Record<string, any>) => void; hint?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const laneH = 220;
  const pt = (e: React.MouseEvent) => { const r = svg.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const add = () => { const id = `n${Date.now().toString(36)}`; onChange(g => ({ ...g, nodes: [...g.nodes, { id, text: '', x: 60 + (g.nodes.length % 5) * 200, y: 40 + Math.floor(g.nodes.length / 5) * 90, lane: 0 }] })); setSel(id); setEdit(id); onEvent?.('canvas_add'); };
  const del = () => { if (!sel) return; onChange(g => ({ ...g, nodes: g.nodes.filter(n => n.id !== sel), edges: g.edges.filter(e => e.from !== sel && e.to !== sel) })); setSel(null); onEvent?.('canvas_del'); };
  const clickNode = (n: CanvasNode) => { if (linking && linking !== n.id) { onChange(g => g.edges.some(e => e.from === linking && e.to === n.id) ? g : { ...g, edges: [...g.edges, { from: linking, to: n.id }] }); setLinking(null); onEvent?.('canvas_link'); return; } setSel(n.id); };
  const move = (e: React.MouseEvent) => { if (!drag) return; const p = pt(e); onChange(g => ({ ...g, nodes: g.nodes.map(n => n.id === drag.id ? { ...n, x: Math.max(0, p.x - drag.dx), y: Math.max(0, p.y - drag.dy), lane: g.lanes.length ? Math.min(g.lanes.length - 1, Math.max(0, Math.floor((p.y - drag.dy + H / 2) / laneH))) : 0 } : n) })); };
  const setLanes = (n: number) => { onChange(g => ({ ...g, lanes: n ? Array.from({ length: n }, (_, i) => g.lanes[i] || '') : [], nodes: g.nodes.map(x => ({ ...x, lane: n ? Math.min(n - 1, x.lane ?? 0) : 0 })) })); onEvent?.('canvas_lanes', { n }); };
  const center = (n: CanvasNode) => ({ cx: n.x + W / 2, cy: n.y + H / 2 });
  const edgeLabel = (e: CanvasEdge, i: number) => { const l = prompt('连线上的字（可空）', e.label || ''); if (l === null) return; onChange(g => ({ ...g, edges: g.edges.map((x, j) => j === i ? { ...x, label: l } : x) })); };
  const height = Math.max(520, graph.lanes.length * laneH, ...graph.nodes.map(n => n.y + H + 60));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
        <button onClick={add} style={btn}>＋ 节点</button>
        <button onClick={() => { if (!sel) return; setLinking(linking ? null : sel); }} disabled={!sel} style={{ ...btn, ...(linking ? { background: '#6055f5', color: '#fff' } : {}) }}>{linking ? '点另一个节点连上 · 取消' : '连线（先选起点）'}</button>
        <button onClick={del} disabled={!sel} style={btn}>删除</button>
        <span style={{ color: '#888' }}>泳道</span>
        <select value={graph.lanes.length} onChange={e => setLanes(Number(e.target.value))} style={{ ...btn, padding: '4px 8px' }}>{[0, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n ? `${n} 条` : '无'}</option>)}</select>
        <span style={{ color: '#999', marginLeft: 'auto' }}>双击节点改字 · 点连线改标签{hint ? ` · ${hint}` : ''}</span>
      </div>
      <div style={{ flex: 1, border: '1px solid #e8e9f0', borderRadius: 12, background: '#fff', overflow: 'auto', minHeight: 420 }}>
        <svg ref={svg} width="100%" height={height} style={{ display: 'block', minWidth: 900, userSelect: 'none', cursor: drag ? 'grabbing' : 'default' }} onMouseMove={move} onMouseUp={() => { if (drag) onEvent?.('canvas_move'); setDrag(null); }} onMouseLeave={() => setDrag(null)} onClick={() => { setSel(null); setLinking(null); }}>
          <defs><marker id="arr" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#6055f5" /></marker></defs>
          {graph.lanes.map((l, i) => <g key={i}><rect x={0} y={i * laneH} width="100%" height={laneH} fill={i % 2 ? '#fafbff' : '#fff'} stroke="#e8e9f0" /><foreignObject x={8} y={i * laneH + 6} width={220} height={28}><input value={l} placeholder={`泳道 ${i + 1}：谁 / 哪个部门`} onChange={e => onChange(g => ({ ...g, lanes: g.lanes.map((x, j) => j === i ? e.target.value : x) }))} onClick={e => e.stopPropagation()} style={{ fontSize: 12, border: 0, background: 'transparent', color: '#6055f5', fontWeight: 700, width: 210, outline: 0 }} /></foreignObject></g>)}
          {graph.edges.map((e, i) => { const a = graph.nodes.find(n => n.id === e.from), b = graph.nodes.find(n => n.id === e.to); if (!a || !b) return null; const A0 = center(a), B0 = center(b); const A = clip(A0, B0), B = clip(B0, A0); const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2; return <g key={i} onClick={ev => { ev.stopPropagation(); edgeLabel(e, i); }} style={{ cursor: 'pointer' }}><line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#6055f5" strokeWidth={1.6} markerEnd="url(#arr)" /><line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="transparent" strokeWidth={12} />{e.label && <text x={mx} y={my - 6} fontSize={12} fill="#4c43c9" textAnchor="middle" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4 }}>{e.label}</text>}</g>; })}
          {graph.nodes.map(n => <g key={n.id} transform={`translate(${n.x},${n.y})`} onMouseDown={e => { e.stopPropagation(); const p = pt(e); setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y }); setSel(n.id); }} onClick={e => { e.stopPropagation(); clickNode(n); }} onDoubleClick={e => { e.stopPropagation(); setEdit(n.id); }} style={{ cursor: 'grab' }}>
            <rect width={W} height={H} rx={10} fill={sel === n.id ? '#f3f2ff' : '#fff'} stroke={linking === n.id ? '#f59e0b' : sel === n.id ? '#6055f5' : '#c9c9dc'} strokeWidth={sel === n.id || linking === n.id ? 2 : 1.2} />
            {edit === n.id
              ? <foreignObject width={W} height={H}><input autoFocus value={n.text} onChange={e => onChange(g => ({ ...g, nodes: g.nodes.map(x => x.id === n.id ? { ...x, text: e.target.value } : x) }))} onBlur={() => { setEdit(null); onEvent?.('canvas_text', { id: n.id }); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} style={{ width: W - 16, margin: '11px 8px', fontSize: 13, border: 0, outline: 0, background: 'transparent', textAlign: 'center' }} /></foreignObject>
              : <text x={W / 2} y={H / 2 + 5} fontSize={13} textAnchor="middle" fill={n.text ? '#1a1a2e' : '#bbb'}>{(n.text || '双击写字').slice(0, 16)}{n.text.length > 16 ? '…' : ''}</text>}
          </g>)}
          {!graph.nodes.length && <text x={40} y={60} fontSize={14} fill="#aaa">点「＋ 节点」开始；需要分部门 / 分角色就开泳道。</text>}
        </svg>
      </div>
      <textarea value={notes} onChange={e => onNotes(e.target.value)} onPaste={onPaste} placeholder="图的说明：每个节点 / 分支的含义、关键判断、没画出来的前提（评卷会读）" style={{ minHeight: 80, border: '1px solid #e8e9f0', borderRadius: 10, padding: 10, font: 'inherit', fontSize: 13.5, resize: 'vertical' }} />
    </div>
  );
}
// 线段从节点边框出发 / 到达（不画进框里，箭头才看得见）
function clip(from: { cx: number; cy: number }, to: { cx: number; cy: number }) {
  const dx = to.cx - from.cx, dy = to.cy - from.cy; if (!dx && !dy) return { x: from.cx, y: from.cy };
  const sx = Math.abs(dx) > 0 ? (W / 2) / Math.abs(dx) : Infinity, sy = Math.abs(dy) > 0 ? (H / 2) / Math.abs(dy) : Infinity; const t = Math.min(sx, sy);
  return { x: from.cx + dx * t, y: from.cy + dy * t };
}
const btn: React.CSSProperties = { border: '1px solid #e0e0ee', background: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', font: 'inherit', fontSize: 13 };
