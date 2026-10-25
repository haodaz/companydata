/**
 * 操作台模组（2026-10-25）：操作台不是「题是哪一类」，而是「每个交付物各用什么模组」——一道投资题可以是一页纸备忘录（doc）+ 估值表（sheet）+ 筛选脚本（code）+ 投资逻辑图（canvas）。
 * 模组可复选：按交付物挂，候选人在页面里切标签做。旧题没写 module 的按 format 字面推。
 */
export type Module = 'doc' | 'sheet' | 'code' | 'design' | 'canvas';
export const MODULES: Record<Module, { label: string; short: string; hint: string }> = {
  doc:    { label: '文档', short: '文', hint: '备忘录 / 报告 / 方案 / 邮件，Markdown 编辑区' },
  sheet:  { label: '表格', short: '表', hint: '对账表 / 测算表 / 模型，电子表格 + 口径说明' },
  code:   { label: '代码', short: '码', hint: '脚本 / SQL / 函数，编辑器 + 自测' },
  design: { label: '参数与草图', short: '图', hint: '设计参数表 + 草图' },
  canvas: { label: '画布', short: '布', hint: '流程图 / 泳道图 / 思维导图 / 架构图，拖节点连线' },
};
export function moduleOf(format: string | undefined, fallback: Module = 'doc'): Module {
  const f = String(format || '');
  if (/流程图|泳道|思维导图|脑图|架构图|关系图|结构图|产业链图|组织图|mind ?map|flow ?chart|swim ?lane|canvas|画布|逻辑图|路径图|地图/i.test(f)) return 'canvas';
  if (/表格|表\b|excel|csv|xlsx|模型|测算表|对账表|数据表|清单表|spreadsheet|sheet/i.test(f) && !/文档|word|报告/.test(f)) return 'sheet';
  if (/代码|脚本|sql|python|函数|程序|script|code|notebook/i.test(f)) return 'code';
  if (/参数|草图|设计稿|cad|尺寸/i.test(f)) return 'design';
  if (/^(表|模型)/.test(f)) return 'sheet';
  return fallback;
}
export const isModule = (v: any): v is Module => ['doc', 'sheet', 'code', 'design', 'canvas'].includes(v);
/** 模型给的 module 和 format 字面打架时以 format 的强信号为准（「流程图」被标成 design 就纠回 canvas） */
export function resolveModule(format: string | undefined, given: any, fallback: Module = 'doc'): Module {
  const byFormat = moduleOf(format, fallback);
  const strong = /流程图|泳道|思维导图|脑图|架构图|关系图|结构图|产业链图|组织图|逻辑图|地图|表格|excel|csv|测算表|对账表|代码|脚本|sql|python/i.test(String(format || ''));
  if (strong && byFormat !== fallback) return byFormat;
  return isModule(given) ? given : byFormat;
}

/** 画布数据 → 文本（评卷能读）：Mermaid flowchart + 节点清单 */
export type CanvasNode = { id: string; text: string; x: number; y: number; lane?: number };
export type CanvasEdge = { from: string; to: string; label?: string };
export type CanvasGraph = { nodes: CanvasNode[]; edges: CanvasEdge[]; lanes: string[] };
export function canvasToText(g: CanvasGraph) {
  const id = (n: CanvasNode) => n.id.replace(/[^\w]/g, '_');
  const esc = (s: string) => s.replace(/"/g, "'").replace(/\n/g, ' ');
  const lines = ['flowchart TD'];
  if (g.lanes.length) g.lanes.forEach((l, i) => { const ns = g.nodes.filter(n => (n.lane ?? 0) === i); if (ns.length) { lines.push(`  subgraph L${i}["${esc(l || `泳道 ${i + 1}`)}"]`); ns.forEach(n => lines.push(`    ${id(n)}["${esc(n.text || '（空）')}"]`)); lines.push('  end'); } });
  else g.nodes.forEach(n => lines.push(`  ${id(n)}["${esc(n.text || '（空）')}"]`));
  g.edges.forEach(e => { const a = g.nodes.find(n => n.id === e.from), b = g.nodes.find(n => n.id === e.to); if (a && b) lines.push(`  ${id(a)} -->${e.label ? `|${esc(e.label)}|` : ''} ${id(b)}`); });
  const list = g.nodes.map(n => `- ${n.text || '（空）'}${g.lanes.length ? `（${g.lanes[n.lane ?? 0] || '泳道 ' + ((n.lane ?? 0) + 1)}）` : ''}${g.edges.filter(e => e.from === n.id).map(e => ` → ${g.nodes.find(x => x.id === e.to)?.text || '?'}${e.label ? `（${e.label}）` : ''}`).join('')}`);
  return `\`\`\`mermaid\n${lines.join('\n')}\n\`\`\`\n\n节点 ${g.nodes.length} 个、连线 ${g.edges.length} 条${g.lanes.length ? `、泳道 ${g.lanes.length} 条` : ''}：\n${list.join('\n')}`;
}
