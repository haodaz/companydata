'use client';

/**
 * 白板操作台（2026-10-27）：给产品经理画线框、UI 设计、海报 / IP 形象这类「自由画」的交付物。
 * 底层是 Excalidraw（MIT）：矩形 / 圆 / 箭头 / 文字 / 手绘 / 贴图片 / 画框，拖拽缩放；中文界面。
 * 上面一行放交付物标签（leading）+ 本交付物的要求；再一行放模板（手机屏 / 网页屏 / 便签）；下面是说明框。
 * 交卷时父组件用 apiRef 导出 PNG 存图给人看，boardToText 转成文字给评卷读。
 */
import React, { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import '@excalidraw/excalidraw/index.css';
import { BOARD_LIBRARY, buildBoardLibrary } from './boardLibrary';

const Excalidraw = dynamic(() => import('@excalidraw/excalidraw').then(m => m.Excalidraw), { ssr: false, loading: () => <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#999', fontSize: 13 }}>白板加载中…</div> });

let libLoading: Promise<void> | null = null;   // 素材库是整页共用的一份（开发模式会挂两个白板实例）：整页只装一次

export type BoardValue = { elements: any[]; files: Record<string, any> };
export const emptyBoard = (): BoardValue => ({ elements: [], files: {} });

export function BoardBench({ value, onChange, notes, onNotes, caption, leading, onEvent, apiRef }: {
  value: BoardValue; onChange: (v: BoardValue) => void; notes: string; onNotes: (v: string) => void; caption?: string;
  leading?: React.ReactNode; onEvent?: (type: string, data?: any) => void; apiRef?: React.MutableRefObject<any>;
}) {
  const api = useRef<any>(null);
  const lastCount = useRef(value.elements.filter(e => !e.isDeleted).length);
  const timer = useRef<any>(null);
  const setApi = useCallback((a: any) => {
    api.current = a; if (apiRef) apiRef.current = a;
    // 录屏 / 调试用：把白板接口和组件骨架挂到 window 上（录演示片时程序化摆组件；对作答没有影响）
    import('@excalidraw/excalidraw').then(m => { (window as any).__workBoard = { api: a, lib: BOARD_LIBRARY, convert: m.convertToExcalidrawElements }; }).catch(() => {});
    // 组件库：白板就绪后放进素材库。按 id 替换我们自己的那批（开发模式会初始化两次，不能叠加），用户自己存的条目保留
    if (!a || libLoading) return;
    libLoading = import('@excalidraw/excalidraw').then(({ convertToExcalidrawElements }) => {
      const ours = buildBoardLibrary(convertToExcalidrawElements as any);
      a.updateLibrary?.({ libraryItems: (cur: any[]) => [...(cur || []).filter(x => !String(x.id).startsWith('work-lib-')), ...ours], merge: false });
    }).catch(() => {});
  }, [apiRef]);
  // Excalidraw 每次指针移动都会触发 onChange：攒 400ms 再写回父组件；元素数变化记一条事件
  const change = useCallback((els: readonly any[], _st: any, files: any) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const live = els.filter(e => !e.isDeleted).length;
      if (live !== lastCount.current) { onEvent?.('board_edit', { n: live, delta: live - lastCount.current }); lastCount.current = live; }
      onChange({ elements: [...els], files: { ...files } });
    }, 400);
  }, [onChange, onEvent]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // 模板：放在现有内容右边，避免压住
  const addTemplate = async (kind: 'phone' | 'web' | 'note') => {
    const a = api.current; if (!a) return;
    const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
    const cur = a.getSceneElements();
    const x0 = cur.length ? Math.max(...cur.map((e: any) => e.x + (e.width || 0))) + 80 : 40, y0 = 40;
    const sk: any[] = kind === 'phone'
      ? [{ type: 'frame', x: x0, y: y0, width: 375, height: 812, name: '手机屏', children: [] }]
      : kind === 'web'
        ? [{ type: 'frame', x: x0, y: y0, width: 1280, height: 800, name: '网页屏', children: [] }]
        : [{ type: 'rectangle', x: x0, y: y0, width: 220, height: 140, backgroundColor: '#ffec99', fillStyle: 'solid', strokeColor: '#e0b400', label: { text: '便签' } }];
    a.updateScene({ elements: [...cur, ...convertToExcalidrawElements(sk)] });
    a.scrollToContent(undefined, { fitToContent: true, animate: true });
    onEvent?.('board_template', { kind });
  };

  const btn: React.CSSProperties = { border: '1px solid #e0e0ee', background: '#fff', borderRadius: 7, padding: '4px 10px', fontSize: 12.5, cursor: 'pointer', color: '#3b405a' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#fff' }}>
      {leading && <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#fff', borderBottom: '1px solid #eef0f5' }}>{leading}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #eef0f5', background: '#fafbff', flexWrap: 'wrap' }}>
        {caption && <span style={{ fontSize: 12.5, color: '#3b405a', fontWeight: 600, marginRight: 6, maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={caption}>{caption}</span>}
        <span style={{ fontSize: 12, color: '#999', marginLeft: 'auto' }}>放一个：</span>
        <button style={btn} onClick={() => addTemplate('phone')}>手机屏</button>
        <button style={btn} onClick={() => addTemplate('web')}>网页屏</button>
        <button style={btn} onClick={() => addTemplate('note')}>便签</button>
        <button style={{ ...btn, borderColor: '#d8d4ff', color: '#4c43c9', fontWeight: 600 }} onClick={() => { api.current?.toggleSidebar?.({ name: 'default', tab: 'library', force: true }); onEvent?.('board_library'); }}>组件库</button>
      </div>
      <div style={{ flex: 1, minHeight: 360, position: 'relative' }}>
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={{ elements: value.elements, files: value.files, appState: { viewBackgroundColor: '#ffffff', currentItemFontFamily: 2 }, scrollToContent: value.elements.length > 0 }}
          onChange={change}
          langCode="zh-CN"
          theme="light"
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false, saveAsImage: true, clearCanvas: true, changeViewBackgroundColor: false } }}
        />
      </div>
      <div style={{ borderTop: '1px solid #e6e8f0', padding: '8px 12px', background: '#fafbff' }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>设计说明（思路、取舍、没画出来的交互）</div>
        <textarea value={notes} onChange={e => onNotes(e.target.value)} rows={2} placeholder="比如：首页先给结果再给入口，因为……；头像变体按职业 × 情绪两个维度……" style={{ width: '100%', border: '1px solid #e0e0ee', borderRadius: 8, padding: '6px 10px', font: 'inherit', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
    </div>
  );
}
