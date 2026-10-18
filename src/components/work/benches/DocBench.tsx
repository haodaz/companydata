'use client';

/** 文档 / 对账台：像在线文档——居中的纸面、顶部格式工具栏、字数、交付物大纲 */
import React, { useRef } from 'react';

export function DocBench({ value, onChange, onPaste, deliverables, title }: { value: string; onChange: (v: string) => void; onPaste: (e: React.ClipboardEvent) => void; deliverables: { id: string; title: string; format: string }[]; title: string }) {
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
  const tools: [string, () => void, string?][] = [['H1', () => line('# '), '标题'], ['H2', () => line('## '), '小标题'], ['B', () => wrap('**', '**'), '加粗'], ['I', () => wrap('*', '*'), '斜体'], ['•', () => line('- '), '列表'], ['1.', () => line('1. '), '编号'], ['❝', () => line('> '), '引用'], ['⊞', () => wrap('\n| 列 | 列 |\n|---|---|\n| ', ' |  |\n'), '表格']];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#eef0f5', borderRadius: 14, overflow: 'hidden', border: '1px solid #e1e3ec' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e1e3ec' }}>
        <span style={{ fontSize: 12, color: '#888', marginRight: 8 }}>📄 {title} · 交付文档</span>
        {tools.map(([l, f, t]) => <button key={l} title={t} onClick={f} style={{ minWidth: 28, height: 28, border: 0, background: 'transparent', borderRadius: 6, cursor: 'pointer', fontWeight: 700, color: '#333', fontSize: 13 }} onMouseEnter={e => (e.currentTarget.style.background = '#f0f1f6')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{l}</button>)}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#999' }}>{words} 字 · Markdown · 自动保存</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '22px 18px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 4, boxShadow: '0 2px 14px rgba(20,24,60,.08), 0 0 0 1px #e6e8f0', padding: '44px 56px 60px', minHeight: 640 }}>
          <div style={{ fontSize: 12, color: '#999', letterSpacing: 1, marginBottom: 6 }}>大纲 · 要交什么</div>
          <ol style={{ margin: '0 0 18px', paddingLeft: 18, fontSize: 13, color: '#666', lineHeight: 1.8 }}>{deliverables.map(d => <li key={d.id}>{d.title} <span style={{ color: '#aaa' }}>{d.format}</span></li>)}</ol>
          <textarea ref={ta} value={value} onChange={e => onChange(e.target.value)} onPaste={onPaste} placeholder={deliverables.map(d => `## ${d.title}\n`).join('\n')} spellCheck={false}
            style={{ width: '100%', minHeight: 520, border: 0, outline: 'none', resize: 'vertical', fontSize: 15.5, lineHeight: 1.9, color: '#1a1a2e', fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif', background: 'transparent' }} />
        </div>
      </div>
    </div>
  );
}
