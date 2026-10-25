'use client';

/** 文档 / 对账台：像在线文档——居中的纸面、顶部格式工具栏、字数、交付物大纲 */
import React, { useRef, useState } from 'react';
import { Md } from '@/components/ws/Md';

export function DocBench({ value, onChange, onPaste, deliverables, title, leading }: { value: string; onChange: (v: string) => void; onPaste: (e: React.ClipboardEvent) => void; deliverables: { id: string; title: string; format: string }[]; title: string; leading?: React.ReactNode }) {
  // deliverables 只在推进式（分步）题里当大纲用；普通题的要求已印在文档正文里（2026-10-25，顶栏不堆字）
  const ta = useRef<HTMLTextAreaElement>(null);
  const wrap = (before: string, after = '') => {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd; const sel = value.slice(s, e) || '文字';
    const next = value.slice(0, s) + before + sel + after + value.slice(e); onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const line = (prefix: string) => {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart; const ls = value.lastIndexOf('\n', s - 1) + 1;
    onChange(value.slice(0, ls) + prefix + value.slice(ls)); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); });
  };
  const words = value.replace(/\s/g, '').length;
  const [fs, setFs] = useState(15.5); const [preview, setPreview] = useState(false);
  // 工具分组（用 '|' 当分隔）：标题 / 字形 / 块 / 插入 / 视图
  const tools: ([string, () => void, string] | '|')[] = [
    ['H1', () => line('# '), '一级标题'], ['H2', () => line('## '), '二级标题'], ['H3', () => line('### '), '三级标题'], '|',
    ['B', () => wrap('**', '**'), '加粗'], ['I', () => wrap('*', '*'), '斜体'], ['S', () => wrap('~~', '~~'), '删除线'], ['</>', () => wrap('`', '`'), '行内代码'], '|',
    ['•', () => line('- '), '无序列表'], ['1.', () => line('1. '), '有序列表'], ['☑', () => line('- [ ] '), '任务清单'], ['❝', () => line('> '), '引用'], '|',
    ['⊞', () => wrap('\n| 列 | 列 | 列 |\n|---|---|---|\n| ', ' |  |  |\n'), '表格'], ['—', () => wrap('\n\n---\n\n'), '分隔线'], ['🔗', () => wrap('[', '](https://)'), '链接'], ['```', () => wrap('\n```\n', '\n```\n'), '代码块'], '|',
    ['A−', () => setFs(f => Math.max(13, f - 1)), '缩小字号'], ['A+', () => setFs(f => Math.min(20, f + 1)), '放大字号'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#eef0f5', borderRadius: 14, overflow: 'hidden', border: '1px solid #e1e3ec' }}>
      {leading && <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#fff', borderBottom: '1px solid #eef0f5' }}>{leading}<span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>{words} 字 · Markdown</span></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 10px', background: '#fff', borderBottom: '1px solid #e1e3ec', flexWrap: 'wrap' }}>
        {tools.map((t, i) => t === '|' ? <span key={'s' + i} style={{ width: 1, height: 16, background: '#e1e3ec', margin: '0 6px' }} /> : <button key={t[0]} title={t[2]} onClick={t[1]} style={{ minWidth: 28, height: 28, padding: '0 6px', border: 0, background: 'transparent', borderRadius: 6, cursor: 'pointer', fontWeight: 700, color: '#333', fontSize: 13, fontFamily: t[0] === '</>' || t[0] === '```' ? 'ui-monospace, Menlo, monospace' : 'inherit' }} onMouseEnter={e => (e.currentTarget.style.background = '#f0f1f6')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{t[0]}</button>)}
        <button onClick={() => setPreview(v => !v)} title={preview ? '回到编辑' : '预览排版'} style={{ marginLeft: 'auto', height: 28, padding: '0 12px', border: `1px solid ${preview ? '#6055f5' : '#e1e3ec'}`, background: preview ? '#f3f2ff' : '#fff', color: preview ? '#6055f5' : '#555', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>{preview ? '编辑' : '预览'}</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '22px 18px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 4, boxShadow: '0 2px 14px rgba(20,24,60,.08), 0 0 0 1px #e6e8f0', padding: '44px 56px 60px', minHeight: 640 }}>
          {deliverables.length > 0 && <><div style={{ fontSize: 12, color: '#999', letterSpacing: 1, marginBottom: 6 }}>推进 · 每一步答什么</div>
          <ol style={{ margin: '0 0 18px', paddingLeft: 18, fontSize: 13, color: '#666', lineHeight: 1.8 }}>{deliverables.map(d => <li key={d.id}>{d.title}</li>)}</ol></>}
          {preview ? <div className="wk-md wk-doc-preview" style={{ fontSize: fs, lineHeight: 1.9, color: '#1a1a2e', minHeight: 520 }}><Md text={value} /></div> : <textarea ref={ta} value={value} onChange={e => onChange(e.target.value)} onPaste={onPaste} placeholder={deliverables.length ? deliverables.map(d => `## ${d.title}\n`).join('\n') : '从这里开始写…'} spellCheck={false}
            style={{ width: '100%', minHeight: 520, border: 0, outline: 'none', resize: 'vertical', fontSize: fs, lineHeight: 1.9, color: '#1a1a2e', fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif', background: 'transparent' }} />}
        </div>
      </div>
    </div>
  );
}
