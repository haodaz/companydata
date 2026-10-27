/**
 * 白板素材库（2026-10-27）：给产品 / UI / 视觉设计的现成组件，灰色线框风，拖出来是一组（整体移动、缩放）。
 * 用 Excalidraw 的 skeleton 写，运行时 convertToExcalidrawElements 转成元素，放进 initialData.libraryItems。
 */
type Sk = Record<string, any>;
const INK = '#1e1e1e', LINE = '#868e96', FILL = '#f1f3f5', MUTED = '#868e96';
const base = { strokeColor: INK, strokeWidth: 1, roughness: 0 };
const rect = (x: number, y: number, w: number, h: number, o: Sk = {}): Sk => ({ type: 'rectangle', x, y, width: w, height: h, ...base, ...o });
const round = (x: number, y: number, w: number, h: number, o: Sk = {}): Sk => rect(x, y, w, h, { roundness: { type: 3 }, ...o });
const circle = (x: number, y: number, d: number, o: Sk = {}): Sk => ({ type: 'ellipse', x, y, width: d, height: d, ...base, ...o });
const text = (x: number, y: number, t: string, o: Sk = {}): Sk => ({ type: 'text', x, y, text: t, fontSize: 16, fontFamily: 2, strokeColor: INK, ...o });
const line = (x: number, y: number, dx: number, dy: number, o: Sk = {}): Sk => ({ type: 'line', x, y, points: [[0, 0], [dx, dy]], ...base, strokeColor: LINE, ...o });
const imgBox = (x: number, y: number, w: number, h: number): Sk[] => [rect(x, y, w, h, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: LINE }), line(x, y, w, h), line(x + w, y, -w, h)];

export const BOARD_LIBRARY: { name: string; sk: Sk[] }[] = [
  // —— 界面组件 ——
  { name: '主按钮', sk: [round(0, 0, 140, 44, { backgroundColor: INK, fillStyle: 'solid', label: { text: '主按钮', strokeColor: '#ffffff', fontSize: 16 } })] },
  { name: '次按钮', sk: [round(0, 0, 140, 44, { backgroundColor: '#ffffff', fillStyle: 'solid', label: { text: '次按钮', fontSize: 16 } })] },
  { name: '输入框', sk: [round(0, 0, 260, 44, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), text(14, 12, '请输入…', { strokeColor: MUTED })] },
  { name: '搜索框', sk: [round(0, 0, 300, 40, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: FILL }), circle(14, 11, 14, { strokeColor: MUTED, strokeWidth: 2 }), line(26, 23, 6, 6, { strokeColor: MUTED, strokeWidth: 2 }), text(42, 10, '搜索', { strokeColor: MUTED })] },
  { name: '顶部导航栏', sk: [rect(0, 0, 375, 56, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), text(14, 14, '‹', { fontSize: 22 }), text(160, 16, '页面标题', { fontSize: 17 }), text(340, 14, '⋯', { fontSize: 20 })] },
  { name: '底部标签栏', sk: [rect(0, 0, 375, 64, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), ...['首页', '发现', '消息', '我的'].flatMap((t, i) => [circle(36 + i * 94, 10, 22, { strokeColor: i ? LINE : INK, backgroundColor: i ? 'transparent' : INK, fillStyle: 'solid' }), text(31 + i * 94, 38, t, { fontSize: 12, strokeColor: i ? MUTED : INK })])] },
  { name: '卡片', sk: [round(0, 0, 300, 190, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), ...imgBox(12, 12, 276, 100), text(14, 124, '卡片标题', { fontSize: 17 }), text(14, 152, '一行说明文字，说清这张卡片是什么', { fontSize: 13, strokeColor: MUTED })] },
  { name: '列表项', sk: [rect(0, 0, 360, 68, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), circle(14, 12, 44, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: LINE }), text(72, 14, '主标题', { fontSize: 16 }), text(72, 38, '副标题 / 补充信息', { fontSize: 13, strokeColor: MUTED }), text(336, 22, '›', { fontSize: 20, strokeColor: MUTED })] },
  { name: '图片占位', sk: imgBox(0, 0, 220, 150) },
  { name: '头像', sk: [circle(0, 0, 64, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: LINE }), circle(22, 14, 20, { strokeColor: LINE }), { type: 'ellipse', x: 14, y: 38, width: 36, height: 22, ...base, strokeColor: LINE }] },
  { name: '开关', sk: [round(0, 0, 56, 30, { backgroundColor: INK, fillStyle: 'solid' }), circle(29, 3, 24, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: '#ffffff' })] },
  { name: '复选框', sk: [rect(0, 2, 20, 20, { strokeColor: LINE }), text(30, 1, '选项文字')] },
  { name: '弹窗', sk: [round(0, 0, 300, 200, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), text(20, 20, '弹窗标题', { fontSize: 18 }), text(20, 58, '说明这一步要用户确认什么，\n以及确认之后会发生什么。', { fontSize: 14, strokeColor: MUTED }), round(20, 140, 120, 40, { label: { text: '取消', fontSize: 15 } }), round(160, 140, 120, 40, { backgroundColor: INK, fillStyle: 'solid', label: { text: '确认', strokeColor: '#ffffff', fontSize: 15 } })] },
  { name: '轻提示', sk: [round(0, 0, 220, 44, { backgroundColor: '#343a40', fillStyle: 'solid', strokeColor: '#343a40', label: { text: '已保存', strokeColor: '#ffffff', fontSize: 15 } })] },
  { name: '标签', sk: [round(0, 0, 72, 28, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: FILL, label: { text: '标签', fontSize: 13, strokeColor: INK } })] },
  // —— 视觉 / IP ——
  { name: '色板', sk: [...['#1e1e1e', '#6055f5', '#12b5cb', '#ffd43b', '#ff8787'].map((c, i) => rect(i * 56, 0, 48, 48, { backgroundColor: c, fillStyle: 'solid', strokeColor: c })), text(0, 56, '主色 · 辅色 · 点缀色（改成你的）', { fontSize: 12, strokeColor: MUTED })] },
  { name: '九宫格辅助线', sk: [rect(0, 0, 300, 300, { strokeColor: LINE, strokeStyle: 'dashed' }), line(100, 0, 0, 300, { strokeStyle: 'dashed' }), line(200, 0, 0, 300, { strokeStyle: 'dashed' }), line(0, 100, 300, 0, { strokeStyle: 'dashed' }), line(0, 200, 300, 0, { strokeStyle: 'dashed' })] },
  { name: '角色比例草稿', sk: [circle(60, 0, 80, { strokeColor: LINE, strokeStyle: 'dashed' }), { type: 'ellipse', x: 40, y: 84, width: 120, height: 150, ...base, strokeColor: LINE, strokeStyle: 'dashed' }, line(0, 80, 200, 0, { strokeStyle: 'dotted' }), text(0, 244, '头身比 1 : 2（Q 版），按需改', { fontSize: 12, strokeColor: MUTED })] },
];

/** 转成 Excalidraw 的素材库条目：每个组件的元素编成一组 */
export function buildBoardLibrary(convert: (sk: any[]) => any[]): any[] {
  const now = Date.now();
  return BOARD_LIBRARY.map((it, i) => {
    const g = `lib-${i}-${now.toString(36)}`;
    const els = convert(it.sk).map((e: any) => ({ ...e, groupIds: [g] }));
    return { id: `work-lib-${i}`, status: 'published', name: it.name, created: now, elements: els };
  });
}
