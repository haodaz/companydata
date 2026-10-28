/**
 * 白板素材库（2026-10-27；10-28 加图表 / 流程 / 图标 / 人物表情）：给产品 / UI / 视觉设计的现成组件，灰色线框风，拖出来是一组（整体移动、缩放）。
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

const poly = (x: number, y: number, pts: [number, number][], o: Sk = {}): Sk => ({ type: 'line', x, y, points: pts, ...base, ...o });
const curve = (x: number, y: number, pts: [number, number][], o: Sk = {}): Sk => poly(x, y, pts, { roundness: { type: 2 }, ...o });
const arrow = (x: number, y: number, dx: number, dy: number, o: Sk = {}): Sk => ({ type: 'arrow', x, y, points: [[0, 0], [dx, dy]], ...base, endArrowhead: 'arrow', ...o });
const star = (x: number, y: number, r: number, o: Sk = {}): Sk => poly(x, y, Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; return [r + rr * Math.cos(a), r + rr * Math.sin(a)] as [number, number]; }), o);
/** 表情脸：IP 形象做变体（开心 / 难过 / 惊讶 / 生气）用 */
const face = (x: number, y: number, mood: 'happy' | 'sad' | 'wow' | 'angry'): Sk[] => [
  circle(x, y, 90, { backgroundColor: '#fff3bf', fillStyle: 'solid', strokeColor: INK }),
  ...(mood === 'angry' ? [line(x + 22, y + 26, 16, 6, { strokeColor: INK, strokeWidth: 2 }), line(x + 68, y + 26, -16, 6, { strokeColor: INK, strokeWidth: 2 })] : []),
  circle(x + 26, y + 34, 9, { backgroundColor: INK, fillStyle: 'solid' }), circle(x + 55, y + 34, 9, { backgroundColor: INK, fillStyle: 'solid' }),
  mood === 'wow' ? circle(x + 37, y + 56, 16, { strokeWidth: 2 })
    : curve(x + 27, y + 62, mood === 'happy' ? [[0, 0], [18, 10], [36, 0]] : mood === 'sad' ? [[0, 8], [18, -2], [36, 8]] : [[0, 4], [18, 0], [36, 4]], { strokeWidth: 2 }),
];
const person = (x: number, y: number, o: Sk = {}): Sk[] => [circle(x + 15, y, 30, o), line(x + 30, y + 30, 0, 50, { strokeColor: INK, ...o }), line(x + 30, y + 42, -26, 20, { strokeColor: INK, ...o }), line(x + 30, y + 42, 26, 20, { strokeColor: INK, ...o }), line(x + 30, y + 80, -20, 36, { strokeColor: INK, ...o }), line(x + 30, y + 80, 20, 36, { strokeColor: INK, ...o })];

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
  // —— 更多界面 ——
  { name: '进度条', sk: [round(0, 0, 260, 10, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: FILL }), round(0, 0, 170, 10, { backgroundColor: INK, fillStyle: 'solid' }), text(270, -5, '65%', { fontSize: 14 })] },
  { name: '分段切换', sk: [round(0, 0, 270, 36, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: FILL }), round(3, 3, 88, 30, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: '#ffffff', label: { text: '全部', fontSize: 14 } }), text(116, 9, '进行中', { fontSize: 14, strokeColor: MUTED }), text(204, 9, '已完成', { fontSize: 14, strokeColor: MUTED })] },
  { name: '步骤条', sk: [...[0, 1, 2].flatMap(i => [circle(i * 130, 0, 28, i ? { strokeColor: LINE } : { backgroundColor: INK, fillStyle: 'solid' }), text(i * 130 - 8, 36, ['填信息', '确认', '完成'][i], { fontSize: 13, strokeColor: i ? MUTED : INK })]), line(32, 14, 94, 0), line(162, 14, 94, 0)] },
  { name: '价格卡', sk: [round(0, 0, 220, 230, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), text(18, 18, '专业版', { fontSize: 15, strokeColor: MUTED }), text(18, 44, '¥ 99 / 月', { fontSize: 28 }), text(18, 96, '✓ 功能一\n✓ 功能二\n✓ 功能三', { fontSize: 14, lineHeight: 1.6 }), round(18, 172, 184, 40, { backgroundColor: INK, fillStyle: 'solid', label: { text: '立即开通', strokeColor: '#ffffff', fontSize: 15 } })] },
  { name: '对话气泡', sk: [round(0, 0, 220, 64, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE, label: { text: '一句台词 / 一条消息', fontSize: 14 } }), poly(24, 63, [[0, 0], [-8, 16], [16, 0]], { strokeColor: LINE, backgroundColor: '#ffffff', fillStyle: 'solid' })] },
  { name: '星级评分', sk: [0, 1, 2, 3, 4].map(i => star(i * 30, 0, 12, i < 4 ? { backgroundColor: '#ffd43b', fillStyle: 'solid', strokeColor: '#e0a800' } : { strokeColor: LINE })) },
  { name: '常用图标', sk: ['⌂', '☰', '✉', '♥', '★', '⚙', '✓', '✕', '＋', '⟳'].map((g, i) => text(i * 34, 0, g, { fontSize: 24 })) },
  // —— 图表 ——
  { name: '柱状图', sk: [line(0, 0, 0, 180, { strokeColor: INK }), line(0, 180, 300, 0, { strokeColor: INK }), ...[110, 150, 80, 130].map((h, i) => rect(24 + i * 68, 180 - h, 44, h, { backgroundColor: i === 1 ? INK : '#ced4da', fillStyle: 'solid', strokeColor: i === 1 ? INK : '#ced4da' })), ...['Q1', 'Q2', 'Q3', 'Q4'].map((t, i) => text(34 + i * 68, 188, t, { fontSize: 13, strokeColor: MUTED })), text(0, -28, '图表标题', { fontSize: 15 })] },
  { name: '折线图', sk: [line(0, 0, 0, 180, { strokeColor: INK }), line(0, 180, 300, 0, { strokeColor: INK }), poly(20, 40, [[0, 100], [70, 70], [140, 90], [210, 30], [270, 10]], { strokeColor: '#6055f5', strokeWidth: 2 }), ...[[0, 100], [70, 70], [140, 90], [210, 30], [270, 10]].map(([px, py]) => circle(20 + px - 4, 40 + py - 4, 8, { backgroundColor: '#6055f5', fillStyle: 'solid', strokeColor: '#6055f5' })), text(0, -28, '趋势标题', { fontSize: 15 })] },
  { name: '指标卡', sk: [round(0, 0, 200, 110, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), text(16, 14, '本月新增用户', { fontSize: 13, strokeColor: MUTED }), text(16, 38, '12,480', { fontSize: 30 }), text(16, 80, '▲ 18% 环比', { fontSize: 13, strokeColor: '#2b8a3e' })] },
  { name: '数据表格', sk: [rect(0, 0, 360, 36, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: LINE }), ...[1, 2, 3].map(r => rect(0, r * 36, 360, 36, { strokeColor: LINE })), line(120, 0, 0, 144), line(240, 0, 0, 144), ...['列一', '列二', '列三'].map((t, i) => text(12 + i * 120, 9, t, { fontSize: 14 }))] },
  // —— 流程 / 结构 ——
  { name: '流程三步', sk: [...['第一步', '第二步', '第三步'].map((t, i) => round(i * 190, 0, 140, 56, { backgroundColor: '#ffffff', fillStyle: 'solid', label: { text: t, fontSize: 15 } })), arrow(144, 28, 42, 0), arrow(334, 28, 42, 0)] },
  { name: '判断', sk: [{ type: 'diamond', x: 0, y: 0, width: 150, height: 90, ...base, backgroundColor: '#ffffff', fillStyle: 'solid', label: { text: '是否…？', fontSize: 14 } }, arrow(150, 45, 60, 0), text(160, 22, '是', { fontSize: 13, strokeColor: MUTED }), arrow(75, 92, 0, 50), text(82, 108, '否', { fontSize: 13, strokeColor: MUTED })] },
  { name: '时间轴', sk: [line(0, 20, 420, 0, { strokeColor: INK }), ...[0, 1, 2, 3].flatMap(i => [circle(i * 130 + 4, 12, 16, { backgroundColor: i === 0 ? INK : '#ffffff', fillStyle: 'solid' }), text(i * 130 - 4, 40, ['第 1 周', '第 2 周', '第 4 周', '上线'][i], { fontSize: 13 })])] },
  { name: '标注箭头', sk: [arrow(0, 0, 80, 50, { strokeColor: '#e03131', strokeWidth: 2 }), text(-10, -26, '这里要注意', { fontSize: 14, strokeColor: '#e03131' })] },
  { name: '用户画像', sk: [round(0, 0, 280, 170, { backgroundColor: '#ffffff', fillStyle: 'solid', strokeColor: LINE }), circle(16, 16, 56, { backgroundColor: FILL, fillStyle: 'solid', strokeColor: LINE }), text(86, 20, '姓名，年龄', { fontSize: 16 }), text(86, 46, '职业 · 城市', { fontSize: 13, strokeColor: MUTED }), text(16, 88, '想要：……\n烦恼：……\n常用：……', { fontSize: 13, lineHeight: 1.6 })] },
  // —— 人物 / 表情（IP 变体）——
  { name: '小人', sk: person(0, 0) },
  { name: '表情 · 开心', sk: face(0, 0, 'happy') },
  { name: '表情 · 难过', sk: face(0, 0, 'sad') },
  { name: '表情 · 惊讶', sk: face(0, 0, 'wow') },
  { name: '表情 · 生气', sk: face(0, 0, 'angry') },
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
