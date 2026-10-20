'use client';

/** 总控回答的轻量 Markdown：段落、标题、无序 / 有序列表、粗体、行内代码、链接。够用就好，不引库 */
import React from 'react';

function inline(s: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = []; let i = 0;
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={key + m.index}>{t.slice(2, -2)}</b>);
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
  for (const raw of lines) {
    const l = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(l), ul = /^\s*[-*]\s+(.*)$/.exec(l), ol = /^\s*\d+[.)、]\s+(.*)$/.exec(l);
    if (!l.trim()) { flushPara(); flushList(); continue; }
    if (h) { flushPara(); flushList(); blocks.push(<div key={'h' + blocks.length} className="ws-h">{inline(h[2], 'h' + blocks.length)}</div>); continue; }
    if (ul || ol) { flushPara(); const ordered = !!ol; if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; } list.items.push((ul || ol)![1]); continue; }
    flushList(); para.push(l.trim());
  }
  flushPara(); flushList();
  return <div className="ws-md">{blocks}</div>;
}
