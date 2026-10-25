'use client';

/** 表格 / 数据台：像电子表格——列号 A/B/C、行号、公式栏、单元格直接改、加行加列；底层还是 CSV */
import React, { useMemo, useState } from 'react';

const parse = (csv: string): string[][] => csv.split(/\r?\n/).filter((l, i, a) => l.length || i < a.length - 1).map(l => l.split(','));
const ser = (rows: string[][]) => rows.map(r => r.join(',')).join('\n');
const colName = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

export function SheetBench({ csv, onCsv, notes, onNotes, onPaste, onCell, leading, caption }: { csv: string; onCsv: (v: string) => void; notes: string; onNotes: (v: string) => void; onPaste: (e: React.ClipboardEvent) => void; onCell?: () => void; leading?: React.ReactNode; caption?: string }) {
  // 空表默认铺 8 行 × 4 列（像一张新开的工作表），真填了才序列化
  const rows = useMemo(() => { const r = parse(csv); return r.length && r.some(x => x.some(c => c !== '')) ? r : Array.from({ length: 8 }, () => Array(4).fill('')); }, [csv]);
  const cols = Math.max(1, ...rows.map(r => r.length));
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [raw, setRaw] = useState(false);
  const set = (r: number, c: number, v: string) => { const next = rows.map(x => [...x]); while (next.length <= r) next.push([]); while (next[r].length <= c) next[r].push(''); next[r][c] = v.replace(/,/g, '，'); onCsv(ser(next)); onCell?.(); };
  const addRow = () => onCsv(ser([...rows, Array(cols).fill('')]));
  const addCol = () => onCsv(ser(rows.map(r => [...r, ''])));
  const insRow = () => { const next = rows.map(x => [...x]); next.splice(sel[0], 0, Array(cols).fill('')); onCsv(ser(next)); };
  const delRow = () => { if (rows.length <= 1) return; const next = rows.filter((_, i) => i !== sel[0]); onCsv(ser(next)); setSel([Math.max(0, sel[0] - 1), sel[1]]); };
  const delCol = () => { if (cols <= 1) return; onCsv(ser(rows.map(r => r.filter((_, i) => i !== sel[1])))); setSel([sel[0], Math.max(0, sel[1] - 1)]); };
  const num = (v: string) => { const n = parseFloat(String(v).replace(/[,，%\s]/g, '')); return Number.isFinite(n) ? n : null; };
  const sortCol = (dir: 1 | -1) => { if (rows.length < 3) return; const [h, ...body] = rows; const c = sel[1]; body.sort((a, b) => { const x = num(a[c] ?? ''), y = num(b[c] ?? ''); if (x != null && y != null) return (x - y) * dir; return String(a[c] ?? '').localeCompare(String(b[c] ?? ''), 'zh') * dir; }); onCsv(ser([h, ...body])); };
  const sumCol = () => { const c = sel[1]; const vals = rows.slice(1).map(r => num(r[c] ?? '')).filter((x): x is number => x != null); const s = vals.reduce((a, b) => a + b, 0); setTip(vals.length ? `${colName(c)} 列求和 = ${Number(s.toFixed(4))}（${vals.length} 个数）` : `${colName(c)} 列没有数字`); setTimeout(() => setTip(''), 6000); };
  const clearAll = () => { if (confirm('清空整张表？')) onCsv(''); };
  const [tip, setTip] = useState('');
  const cur = rows[sel[0]]?.[sel[1]] ?? '';
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #d9dbe6' }}>
      {/* 工具栏 */}
      {leading && <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#fff', borderBottom: '1px solid #eef0f5' }}>{leading}<span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>{rows.length} 行 × {cols} 列</span></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#f3f5f9', borderBottom: '1px solid #d9dbe6', fontSize: 12.5, flexWrap: 'wrap' }}>
        <button onClick={addRow} style={tb} title="末尾加一行">＋ 行</button><button onClick={insRow} style={tb} title="在当前行上方插入">↥ 插行</button><button onClick={delRow} style={tb} title="删除当前行">− 行</button>
        <span style={{ width: 1, height: 16, background: '#d9dbe6' }} />
        <button onClick={addCol} style={tb} title="末尾加一列">＋ 列</button><button onClick={delCol} style={tb} title="删除当前列">− 列</button>
        <span style={{ width: 1, height: 16, background: '#d9dbe6' }} />
        <button onClick={() => sortCol(1)} style={tb} title="按当前列升序（首行当表头）">↑ 排序</button><button onClick={() => sortCol(-1)} style={tb} title="按当前列降序">↓ 排序</button><button onClick={sumCol} style={tb} title="当前列求和">Σ 求和</button>
        <span style={{ width: 1, height: 16, background: '#d9dbe6' }} />
        <button onClick={() => setRaw(r => !r)} style={{ ...tb, background: raw ? '#dfe3ee' : undefined }} title="直接编辑 CSV 文本">{raw ? '表格视图' : 'CSV 源'}</button><button onClick={clearAll} style={tb} title="清空">清空</button>
        {tip && <span style={{ marginLeft: 'auto', color: '#6055f5', fontWeight: 600 }}>{tip}</span>}
      </div>
      {caption && <div style={{ padding: '7px 12px', fontSize: 13, color: '#555', borderBottom: '1px solid #e6e8f0', background: '#fff' }}>{caption}</div>}
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
