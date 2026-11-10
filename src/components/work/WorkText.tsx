'use client';

/**
 * 真活的多段文字（11-10 潜历：「规则每条一行很难读」「Markdown 都是代码形式，希望是预览」）：
 * 任务书按 Markdown 渲染（新出的任务书分「背景 / 要你做什么 / 交付 / 时间与方式」小节）；规则按「AI 使用 / 数据与来源 / 工作过程 / 交付」分组。
 * 候选人页、管理页、任务说明弹层共用。老任务的规则没有分类前缀，归到「其他」照常列。
 */
import React from 'react';
import { Md } from '@/components/ws/Md';
import { useLang } from '@/lib/work/i18n';

export const WORK_MD_CSS = `.wt-md p{margin:0 0 8px}.wt-md ul,.wt-md ol{margin:0 0 8px;padding-left:20px}.wt-md ul{list-style:disc}.wt-md ol{list-style:decimal}.wt-md li{margin:2px 0}.wt-md .ws-h{font-weight:700;margin:12px 0 4px}.wt-md .ws-h:first-child{margin-top:0}.wt-md a{color:#6055f5}.wt-md .ws-tw{overflow:auto;margin:6px 0 10px}.wt-md .ws-table{border-collapse:collapse;font-size:12.5px;min-width:60%}.wt-md .ws-table th,.wt-md .ws-table td{border:1px solid rgba(120,120,160,.25);padding:5px 9px;text-align:left;vertical-align:top}.wt-md .ws-table th{background:rgba(96,85,245,.06)}.wt-md .ws-quote{margin:6px 0;padding:4px 12px;border-left:3px solid rgba(96,85,245,.4);color:inherit;opacity:.85}.wt-md .ws-pre{white-space:pre-wrap;background:rgba(96,85,245,.05);padding:8px 10px;border-radius:8px;font-size:12.5px}.wt-md>.ws-md>:last-child{margin-bottom:0}`;

/** Markdown 文字（材料、任务书、参考答案）：带样式的预览 */
export function MdView({ text, style }: { text: string; style?: React.CSSProperties }) {
  return <div className="wt-md" style={{ lineHeight: 1.75, ...style }}><style>{WORK_MD_CSS}</style><Md text={text || ''} /></div>;
}

const GROUPS = ['AI 使用', '数据与来源', '工作过程', '交付'];
const GROUPS_EN: Record<string, string> = { 'AI 使用': 'AI use', '数据与来源': 'Data & sources', '工作过程': 'Process', '交付': 'Deliverables', '其他': 'Other' };
/** 英文题的前缀（AI use: / Data & sources: / Process: / Deliverables:）归到同样的组 */
const EN_PREFIX: [RegExp, string][] = [[/^ai use$/i, 'AI 使用'], [/^data (?:&|and) sources$/i, '数据与来源'], [/^process$/i, '工作过程'], [/^deliverables?$/i, '交付']];
/** 规则按分类前缀分组：「AI 使用：…」→ AI 使用 组 */
export function groupRules(rules: string[]) {
  const out = new Map<string, string[]>();
  for (const r of rules || []) {
    const m = /^\s*[【[]?(AI ?使用|数据与来源|数据来源|工作过程|交付)[】\]]?\s*[：:]\s*(.+)$/.exec(r);
    const me = m ? null : /^\s*[[]?(AI\s+use|Data\s+(?:&|and)\s+sources|Process|Deliverables?)[\]]?\s*[：:]\s*(.+)$/i.exec(r);
    const g = m ? (m[1].replace('AI使用', 'AI 使用').replace('数据来源', '数据与来源')) : me ? EN_PREFIX.find(([re]) => re.test(me[1].replace(/\s+/g, ' ')))![1] : '其他';
    out.set(g, [...(out.get(g) || []), m ? m[2] : me ? me[2] : r]);
  }
  return [...GROUPS, '其他'].filter(g => out.has(g)).map(g => ({ group: g, items: out.get(g)! }));
}

export function RulesView({ rules, dark, fontSize = 14 }: { rules: string[]; dark?: boolean; fontSize?: number }) {
  const gs = groupRules(rules); const lang = useLang();
  const only = gs.length === 1 && gs[0].group === '其他';
  return <div style={{ display: 'grid', gap: 10, fontSize }}>
    {gs.map(g => <div key={g.group}>
      {!only && <div style={{ fontWeight: 700, fontSize: fontSize - 1, color: dark ? '#b8bdd6' : '#444', marginBottom: 2 }}>{lang === 'en' ? GROUPS_EN[g.group] || g.group : g.group}</div>}
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>{g.items.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </div>)}
  </div>;
}
