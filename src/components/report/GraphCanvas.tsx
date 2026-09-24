'use client';

/**
 * 关系图谱（AntV G6）：企业 → 行业 / 投资方 → 高管 / 核心产品 / 合作方。
 * 视觉语言与 DataSquare 人才图谱一致：按层级决定大小与配色，关系类型决定连线颜色。
 * 只在报告页用，动态导入，不影响后台打包体积。
 */
import React, { useEffect, useRef, useState } from 'react';

export interface GraphNodeData { id: string; label: string; type: string; size?: number; [k: string]: any }
export interface GraphEdgeData { source: string; target: string; type: string }

const NODE_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  company: { fill: '#1d4ed8', stroke: '#1e3a8a', label: '企业' },
  industry: { fill: '#3b82f6', stroke: '#2563eb', label: '行业 / 赛道' },
  investor: { fill: '#8b5cf6', stroke: '#7c3aed', label: '投资方' },
  product: { fill: '#f5b942', stroke: '#d97706', label: '核心产品' },
  partner: { fill: '#16a34a', stroke: '#15803d', label: '合作方 / 客户' },
  executive: { fill: '#22d3ee', stroke: '#0891b2', label: '高管 / 创始人' },
};
const EDGE_COLOR: Record<string, string> = {
  owns: '#8b5cf6', has: '#3b82f6', member: '#22d3ee', offers: '#f5b942', partners: '#16a34a',
};

export function GraphCanvas({ nodes, edges, height = 560, legend = true }: {
  nodes: GraphNodeData[]; edges: GraphEdgeData[]; height?: number; legend?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const wheelRef = useRef<((e: WheelEvent) => void) | null>(null);
  const fitTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    const el = box.current;
    if (!el) return;

    // 进入视口再加载 G6，首屏更快
    const start = () => {
      import('@antv/g6').then(({ Graph }) => {
        if (dead || !box.current) return;
        const g6Nodes = nodes.map(n => ({ id: n.id, data: { ...n } }));
        const ids = new Set(g6Nodes.map(n => n.id));
        const g6Edges = edges
          .filter(e => ids.has(e.source) && ids.has(e.target))
          .map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target, data: { ...e } }));

        const graph = new Graph({
          container: box.current,
          width: box.current.clientWidth,
          height: box.current.clientHeight || height,
          autoFit: 'view',
          padding: 30,
          data: { nodes: g6Nodes, edges: g6Edges },
          node: {
            style: {
              size: (d: any) => d.data?.size || 16,
              fill: (d: any) => NODE_STYLE[d.data?.type]?.fill || '#94a3b8',
              stroke: (d: any) => NODE_STYLE[d.data?.type]?.stroke || '#cbd5e1',
              lineWidth: (d: any) => (d.data?.type === 'company' ? 3 : 1),
              fillOpacity: (d: any) => (d.data?.type === 'product' || d.data?.type === 'executive' ? 0.85 : 1),
              shadowColor: (d: any) => (d.data?.type === 'company' ? 'rgba(29,78,216,.45)'
                : d.data?.type === 'investor' ? 'rgba(139,92,246,.35)' : 'transparent'),
              shadowBlur: (d: any) => (d.data?.type === 'company' ? 22 : d.data?.type === 'investor' ? 14 : 0),
              labelText: (d: any) => {
                const t = d.data?.type;
                if (t === 'company' || t === 'industry' || t === 'investor') {
                  const s = String(d.data?.label || '');
                  return s.length > 22 ? `${s.slice(0, 21)}…` : s;
                }
                return '';
              },
              labelFontSize: (d: any) => (d.data?.type === 'company' ? 14 : d.data?.type === 'investor' ? 11 : 10),
              labelFontWeight: (d: any) => (d.data?.type === 'company' ? 700 : 500),
              labelFill: '#334155',
              labelPlacement: 'bottom',
              labelOffsetY: 4,
              labelBackground: true,
              labelBackgroundFill: 'rgba(255,255,255,.86)',
              labelBackgroundRadius: 3,
              labelPadding: [1, 4, 1, 4],
            },
          },
          edge: {
            style: {
              stroke: (d: any) => EDGE_COLOR[d.data?.type] || '#cbd5e1',
              strokeOpacity: (d: any) => (d.data?.type === 'owns' || d.data?.type === 'has' ? 0.5 : 0.24),
              lineWidth: (d: any) => (d.data?.type === 'owns' || d.data?.type === 'has' ? 1.6 : 0.9),
              endArrow: false,
            },
          },
          layout: {
            type: 'd3-force',
            animated: true,
            preventOverlap: true,
            nodeSize: 34,
            nodeSpacing: 14,
            center: true,
            linkDistance: (d: any) => (d.data?.type === 'owns' ? 120 : d.data?.type === 'has' ? 100 : 52),
            nodeStrength: -160,
            collide: { radius: 22 },
          },
          // 不启用 zoom-canvas：滚轮留给页面滚动，缩放走下面的按钮或 ⌘/Ctrl + 滚轮
          behaviors: ['drag-canvas', 'drag-element'],
          animation: true,
        });
        graphRef.current = graph;
        graph.render().then(() => {
          if (dead) return;
          setLoading(false);
          // d3-force 还会继续收敛，等它稳定后再自适应一次
          fitTimers.current.push(
            setTimeout(() => { try { graph.fitView(); } catch { /* ignore */ } }, 1500),
            setTimeout(() => { try { graph.fitView(); } catch { /* ignore */ } }, 3200),
          );
        });
        // 兜底：无论如何 6 秒后不再显示加载态
        fitTimers.current.push(setTimeout(() => { if (!dead) setLoading(false); }, 6000));

        // ⌘ / Ctrl + 滚轮才缩放；普通滚轮不拦截，页面照常滚
        const onWheel = (ev: WheelEvent) => {
          if (!ev.ctrlKey && !ev.metaKey) return;
          ev.preventDefault();
          try { graph.zoomBy(ev.deltaY > 0 ? 0.92 : 1.08); } catch { /* ignore */ }
        };
        box.current!.addEventListener('wheel', onWheel, { passive: false });
        wheelRef.current = onWheel;
      }).catch(() => { if (!dead) setLoading(false); });
    };

    if (typeof IntersectionObserver === 'undefined') { start(); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); start(); } }, { threshold: 0.1 });
    io.observe(el);

    const onResize = () => {
      if (graphRef.current && box.current) {
        try { graphRef.current.setSize(box.current.clientWidth, box.current.clientHeight); graphRef.current.fitView(); } catch { /* ignore */ }
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      dead = true; io.disconnect(); window.removeEventListener('resize', onResize);
      if (wheelRef.current && box.current) box.current.removeEventListener('wheel', wheelRef.current);
      fitTimers.current.forEach(clearTimeout); fitTimers.current = [];
      if (graphRef.current) { try { graphRef.current.destroy(); } catch { /* ignore */ } graphRef.current = null; }
    };
  }, [nodes, edges, height]);

  return (
    <div className="rp-graph" style={{ height }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {loading && <div className="rp-graph-loading">图谱加载中…</div>}
      <div className="rp-graph-tools">
        <button onClick={() => { try { graphRef.current?.zoomBy(1.2); } catch { /* ignore */ } }} aria-label="放大">＋</button>
        <button onClick={() => { try { graphRef.current?.zoomBy(0.83); } catch { /* ignore */ } }} aria-label="缩小">－</button>
        <button onClick={() => { try { graphRef.current?.fitView(); } catch { /* ignore */ } }} aria-label="适应画布">适应</button>
      </div>
      <div className="rp-graph-hint">拖拽平移 · ⌘/Ctrl + 滚轮缩放</div>
      {legend && (
        <div className="rp-graph-legend">
          {Object.entries(NODE_STYLE).map(([k, v]) => (
            <span key={k}><i style={{ background: v.fill }} />{v.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
