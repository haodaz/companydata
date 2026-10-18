'use client';

/** 表格 / 数据台：像电子表格——列号 A/B/C、行号、公式栏、单元格直接改、加行加列；底层还是 CSV */
import React, { useMemo, useState } from 'react';

const parse = (csv: string): string[][] => csv.split(/\r?\n/).filter((l, i, a) => l.length || i < a.length - 1).map(l => l.split(','));
const ser = (rows: string[][]) => rows.map(r => r.join(',')).join('\n');
const colName = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

export function SheetBench({ csv, onCsv, notes, onNotes, onPaste, onCell }: { csv: string; onCsv: (v: string) => void; notes: string; onNotes: (v: string) => void; onPaste: (e: React.ClipboardEvent) => void; onCell?: () => void }) {
  const rows = useMemo(() => parse(csv), [csv]);
  const cols = Math.max(1, ...rows.map(r => r.length));
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [raw, setRaw] = useState(false);
  const set = (r: number, c: number, v: string) => { const next = rows.map(x => [...x]); while (next.length <= r) next.push([]); while (next[r].length <= c) next[r].push(''); next[r][c] = v.replace(/,/g, '，'); onCsv(ser(next)); onCell?.(); };
  const addRow = () => onCsv(ser([...rows, Array(cols).fill('')]));
  const addCol = () => onCsv(ser(rows.map(r => [...r, ''])));
  const cur = rows[sel[0]]?.[sel[1]] ?? '';
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #d9dbe6' }}>
      {/* 工具栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f3f5f9', borderBottom: '1px solid #d9dbe6', fontSize: 12.5 }}>
        <span style={{ fontWeight: 700, color: '#1a7f4b' }}>▦ 表格</span>
        <button onClick={addRow} style={tb}>＋ 行</button><button onClick={addCol} style={tb}>＋ 列</button>
        <button onClick={() => setRaw(r => !r)} style={{ ...tb, background: raw ? '#dfe3ee' : undefined }}>{raw ? '表格视图' : 'CSV 源'}</button>
        <span style={{ marginLeft: 'auto', color: '#888' }}>{rows.length} 行 × {cols} 列 · 单元格直接改，逗号会换成全角</span>
      </div>
      {/* 公式栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid #e6e8f0', fontFamily: mono, fontSize: 13 }}>
        <span style={{ width: 56, padding: '3px 8px', border: '1px solid #d9dbe6', borderRadius: 4, textAlign: 'center', color: '#555', background: '#fafbff' }}>{colName(sel[1])}{sel[0] + 1}</span>
        <span style={{ color: '#aaa' }}>fx</span>
        <input value={cur} onChange={e => set(sel[0], sel[1], e.target.value)} style={{ flex: 1, border: '1px solid transparent', outline: 'none', padding: '3px 8px', borderRadius: 4, fontFamily: mono, fontSize: 13 }} onFocus={e => (e.currentTarget.style.borderColor = '#6055f5')} onBlur={e => (e.currentTarget.style.borderColor = 'transparent')} />
      </div>
      {raw ? (
        <textarea value={csv} onChange={e => onCsv(e.target.value)} onPaste={onPaste} spellCheck={false} style={{ flex: 1, border: 0, outline: 'none', resize: 'none', padding: 12, fontFamily: mono, fontSize: 13, lineHeight: 1.6, minHeight: 320 }} />
      ) : (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 320 }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", sans-serif', minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...hd, width: 40, position: 'sticky', left: 0, top: 0, zIndex: 3 }} />
                {Array.from({ length: cols }, (_, c) => <th key={c} style={{ ...hd, position: 'sticky', top: 0, zIndex: 2, background: sel[1] === c ? '#e4e7f5' : '#f3f5f9', minWidth: 110 }}>{colName(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => <tr key={ri}>
                <td style={{ ...hd, position: 'sticky', left: 0, zIndex: 1, background: sel[0] === ri ? '#e4e7f5' : '#f3f5f9', textAlign: 'center', color: '#777' }}>{ri + 1}</td>
                {Array.from({ length: cols }, (_, c) => { const v = r[c] ?? ''; const on = sel[0] === ri && sel[1] === c; return (
                  <td key={c} style={{ padding: 0, borderRight: '1px solid #e6e8f0', borderBottom: '1px solid #e6e8f0', background: ri === 0 ? '#fafbff' : '#fff', outline: on ? '2px solid #6055f5' : 'none', outlineOffset: -1 }}>
                    <input value={v} onFocus={() => setSel([ri, c])} onChange={e => set(ri, c, e.target.value)} onPaste={onPaste} style={{ width: '100%', border: 0, outline: 'none', padding: '6px 8px', fontSize: 13, fontWeight: ri === 0 ? 700 : 400, background: 'transparent', fontFamily: 'inherit', whiteSpace: 'nowrap' }} />
                  </td>); })}
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ borderTop: '1px solid #d9dbe6', padding: '8px 12px', background: '#fafbff' }}>
        <div style={{ fontSize: 11.5, color: '#888', letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>口径说明（怎么对的账、哪些是假设）</div>
        <textarea value={notes} onChange={e => onNotes(e.target.value)} onPaste={onPaste} style={{ width: '100%', minHeight: 90, border: '1px solid #d9dbe6', borderRadius: 8, padding: '8px 10px', fontSize: 13.5, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
      </div>
    </div>
  );
}
const hd: React.CSSProperties = { background: '#f3f5f9', borderRight: '1px solid #d9dbe6', borderBottom: '1px solid #d9dbe6', fontSize: 12, fontWeight: 600, color: '#555', padding: '5px 8px', textAlign: 'center' };
const tb: React.CSSProperties = { padding: '4px 10px', border: '1px solid #d9dbe6', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12.5 };
