/**
 * 操作台模组（2026-10-25）：操作台不是「题是哪一类」，而是「每个交付物各用什么模组」——一道投资题可以是一页纸备忘录（doc）+ 估值表（sheet）+ 筛选脚本（code）+ 投资逻辑图（canvas）。
 * 模组可复选：按交付物挂，候选人在页面里切标签做。旧题没写 module 的按 format 字面推。
 */
export type Module = 'doc' | 'sheet' | 'code' | 'design' | 'canvas' | 'board';
export const MODULES: Record<Module, { label: string; short: string; hint: string }> = {
  doc:    { label: '文档', short: '文', hint: '备忘录 / 报告 / 方案 / 邮件，Markdown 编辑区' },
  sheet:  { label: '表格', short: '表', hint: '对账表 / 测算表 / 模型，电子表格 + 口径说明' },
  code:   { label: '代码', short: '码', hint: '脚本 / SQL / 函数，编辑器 + 自测' },
  design: { label: '参数与草图', short: '图', hint: '设计参数表 + 草图' },
  canvas: { label: '画布', short: '布', hint: '流程图 / 泳道图 / 思维导图 / 架构图，拖节点连线' },
  board:  { label: '白板', short: '板', hint: '线框图 / 界面草图 / 海报 / IP 形象：自由画、拖图形、贴图片（2026-10-27）' },
};
export function moduleOf(format: string | undefined, fallback: Module = 'doc'): Module {
  const f = String(format || '');
  if (/流程图|泳道|思维导图|脑图|架构图|关系图|结构图|产业链图|组织图|mind ?map|flow ?chart|swim ?lane|canvas|画布|逻辑图|路径图|地图/i.test(f)) return 'canvas';
  if (/线框|原型|界面|ui\b|ux\b|交互稿|高保真|低保真|视觉稿|视觉|海报|banner|ip\b|ip ?形象|形象设计|插画|头像|logo|标志|品牌|分镜|版式|排版|白板|wireframe|mockup|prototype|figma/i.test(f)) return 'board';
  if (/表格|表\b|excel|csv|xlsx|模型|测算表|对账表|数据表|清单表|spreadsheet|sheet/i.test(f) && !/文档|word|报告/.test(f)) return 'sheet';
  if (/代码|脚本|sql|python|函数|程序|script|code|notebook/i.test(f)) return 'code';
  if (/参数|草图|设计稿|cad|尺寸/i.test(f)) return 'design';
  if (/^(表|模型)/.test(f)) return 'sheet';
  return fallback;
}
export const isModule = (v: any): v is Module => ['doc', 'sheet', 'code', 'design', 'canvas', 'board'].includes(v);
/** 模型给的 module 和 format 字面打架时以 format 的强信号为准（「流程图」被标成 design 就纠回 canvas） */
export function resolveModule(format: string | undefined, given: any, fallback: Module = 'doc'): Module {
  const byFormat = moduleOf(format, fallback);
  const strong = /流程图|泳道|思维导图|脑图|架构图|关系图|结构图|产业链图|组织图|逻辑图|地图|表格|excel|csv|测算表|对账表|代码|脚本|sql|python|线框|原型|界面|ui\b|ux\b|交互稿|高保真|低保真|视觉稿|视觉|海报|banner|ip\b|ip ?形象|形象设计|插画|头像|logo|标志|品牌|分镜|版式|排版|白板|wireframe|mockup|prototype|figma/i.test(String(format || ''));
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

/**
 * 白板（Excalidraw）元素 → 文本（评卷能读）：按画框分组，框内按从上到下、从左到右列出文字和图形，箭头写成「A → B」。
 * 图本身另存一张 PNG（交卷时上传），给人看。
 */
export function boardToText(elements: any[]): string {
  const els = (elements || []).filter(e => e && !e.isDeleted);
  if (!els.length) return '（白板是空的）';
  const byId = new Map(els.map(e => [e.id, e]));
  const frames = els.filter(e => e.type === 'frame' || e.type === 'magicframe');
  const label = (e: any): string => { if (!e) return '?'; if (e.type === 'text') return String(e.text || '').replace(/\s+/g, ' ').slice(0, 80); const t = (e.boundElements || []).map((b: any) => byId.get(b.id)).find((x: any) => x?.type === 'text'); return t ? String(t.text || '').replace(/\s+/g, ' ').slice(0, 80) : ({ rectangle: '方框', ellipse: '圆', diamond: '菱形', image: '图片', freedraw: '手绘', line: '线', arrow: '箭头', frame: '画框' } as any)[e.type] || e.type; };
  const inFrame = (e: any) => e.frameId ? byId.get(e.frameId) : null;
  const pos = (e: any) => `(${Math.round(e.x)},${Math.round(e.y)}${e.width ? ` ${Math.round(e.width)}×${Math.round(e.height)}` : ''})`;
  const items = els.filter(e => !['frame', 'magicframe'].includes(e.type) && !(e.type === 'text' && e.containerId) && e.type !== 'arrow');
  const sortRead = (a: any, b: any) => (Math.round(a.y / 40) - Math.round(b.y / 40)) || (a.x - b.x);
  const line = (e: any) => `- ${e.type === 'text' ? `文字「${label(e)}」` : `${({ rectangle: '方框', ellipse: '圆', diamond: '菱形', image: '图片', freedraw: '手绘笔画', line: '线' } as any)[e.type] || e.type}${label(e) && !['方框', '圆', '菱形', '图片', '手绘', '线'].includes(label(e)) ? `「${label(e)}」` : ''}`} ${pos(e)}`;
  const out: string[] = [];
  const counts = els.reduce((m: any, e: any) => (m[e.type] = (m[e.type] || 0) + 1, m), {});
  out.push(`白板共 ${els.length} 个元素：${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('、')}`);
  for (const f of [...frames].sort(sortRead)) { out.push(`\n### 画框「${f.name || '未命名'}」${pos(f)}`); out.push(...items.filter(e => inFrame(e)?.id === f.id).sort(sortRead).map(line)); }
  const loose = items.filter(e => !inFrame(e)).sort(sortRead);
  if (loose.length) { out.push(frames.length ? '\n### 画框外' : ''); out.push(...loose.map(line)); }
  const arrows = els.filter(e => e.type === 'arrow');
  if (arrows.length) { out.push('\n### 箭头 / 连线'); for (const a of arrows) { const s = byId.get(a.startBinding?.elementId), t = byId.get(a.endBinding?.elementId); const lt = (a.boundElements || []).map((b: any) => byId.get(b.id)).find((x: any) => x?.type === 'text'); out.push(`- ${s ? label(s) : '（空白处）'} → ${t ? label(t) : '（空白处）'}${lt ? `（${String(lt.text).slice(0, 40)}）` : ''}`); } }
  return out.filter(x => x !== '').join('\n');
}
