'use client';

/** 总控回答的轻量 Markdown：段落、标题、无序 / 有序列表、粗体、行内代码、链接、图片。够用就好，不引库 */
import React from 'react';

function inline(s: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = []; let i = 0;
  const re = /(!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    const t = m[0];
    // 图片（2026-10-28：白板交卷截图等）：点开看原图
    if (t.startsWith('![')) { const mm = /!\[([^\]]*)\]\(([^)]+)\)/.exec(t)!; out.push(<a key={key + m.index} href={mm[2]} target="_blank" rel="noreferrer"><img src={mm[2]} alt={mm[1]} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #e8e9f0', display: 'block', margin: '6px 0' }} /></a>); }
    else if (t.startsWith('**')) out.push(<b key={key + m.index}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={key + m.index} className="ws-code">{t.slice(1, -1)}</code>);
    else { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!; out.push(<a key={key + m.index} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>); }
    i = m.index + t.length;
  }
  if (i < s.length) out.push(s.slice(i));
  return out;
}

export function Md({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = []; let list: { ordered: boolean; items: string[] } | null = null; let para: string[] = [];
  const flushPara = () => { if (para.length) { blocks.push(<p key={'p' + blocks.length}>{inline(para.join(' '), 'p' + blocks.length)}</p>); para = []; } };
  const flushList = () => { if (list) { const L = list.ordered ? 'ol' : 'ul'; blocks.push(React.createElement(L, { key: 'l' + blocks.length }, list.items.map((it, k) => <li key={k}>{inline(it, `l${blocks.length}-${k}`)}</li>))); list = null; } };
  // 表格（| a | b |）、引用（> ）、代码块（```）：材料正文和 AI 回答都常见（2026-10-25）
  const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const l = raw.trimEnd();
    if (/^```/.test(l.trim())) { flushPara(); flushList(); const buf: string[] = []; li++; while (li < lines.length && !/^```/.test(lines[li].trim())) { buf.push(lines[li]); li++; } blocks.push(<pre key={'c' + blocks.length} className="ws-pre">{buf.join('\n')}</pre>); continue; }
    if (/^\s*\|/.test(l) && li + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[li + 1])) {
      flushPara(); flushList(); const head = cells(l); const rows: string[][] = []; li += 2;
      while (li < lines.length && /^\s*\|/.test(lines[li])) { rows.push(cells(lines[li])); li++; } li--;
      blocks.push(<div key={'t' + blocks.length} className="ws-tw"><table className="ws-table"><thead><tr>{head.map((c, i) => <th key={i}>{inline(c, 'th' + i)}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c, 'td' + i + '_' + j)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^>\s?/.test(l)) { flushPara(); flushList(); const buf: string[] = [l.replace(/^>\s?/, '')]; while (li + 1 < lines.length && /^>\s?/.test(lines[li + 1])) { li++; buf.push(lines[li].replace(/^>\s?/, '')); } blocks.push(<blockquote key={'q' + blocks.length} className="ws-quote">{inline(buf.join(' '), 'q' + blocks.length)}</blockquote>); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l), ul = /^\s*[-*]\s+(.*)$/.exec(l), ol = /^\s*\d+[.)、]\s+(.*)$/.exec(l);
    if (!l.trim()) { flushPara(); flushList(); continue; }
    if (h) { flushPara(); flushList(); blocks.push(<div key={'h' + blocks.length} className="ws-h">{inline(h[2], 'h' + blocks.length)}</div>); continue; }
    if (ul || ol) { flushPara(); const ordered = !!ol; if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; } list.items.push((ul || ol)![1]); continue; }
    flushList(); para.push(l.trim());
  }
  flushPara(); flushList();
  return <div className="ws-md">{blocks}</div>;
}
