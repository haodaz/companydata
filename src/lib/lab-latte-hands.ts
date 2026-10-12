/**
 * 咖啡拉花（蒸奶 + 心形 / 郁金香 / 树叶）· 母版 E（hands）纯配置版（2026-10-12）：和代码版（surface: 'latte' = BenchRunner 的 pour / cup / coach / readout 层
 * + surfaces/LatteOverlay.tsx）画的、手势拨的、显示的一样，但全是数据。
 *   按住奶缸（轨迹头 34 以内或轨迹描边上）= 倒：流量没开就开到 35（大流量 80）；拖着走 = track（只进不退的进度 + 偏离），松开 = 断流
 *   滚轮 = 奶缸高度 0.5–8 cm（0.5 一档）；按住 Shift 或点「大流量」= 大流量（本地数 big，倒着的时候立刻把流量拨到 80 / 35）
 *   有蒸汽棒的工位（心形那台）：左边蒸汽位，按住奶缸上下拖（slide）= 进气（槽上面 15% 不进气，往下 0–80%、5% 一档），按下开汽、松开关汽、进气归零
 *   杯子是 latte-cup 插件：落点 = 拖着走时手的位置（演示时 = 轨迹头），每个落点的大小 = 当时 cup 层 level 表达式的值
 *   摄像头：camera.gesture = 'pour'，捏合 = 握住奶缸（同代码版的相对移动：增益 0.55、每帧进度走 0.6）
 * 配置不是手写死的：latteHandsConfig(bench) 从这台工位自己的场景层（pour 折线 / cup / coach / readout / pulse）和控件现算，
 * 所以库里三台（以及以后改过文案、换过轨迹的）都能用同一个函数搬。物理（vars / rules / goals / 老手脚本）原样不动。
 * 搬的时候场景层要清掉（toLatteHands 会做）：留着 pour 层的话 BenchRunner 会再挂一个自己的摄像头按钮，两套手同时拨进度。
 */
import { layerPath, type BenchLayer, type BenchSpec } from '@/lib/bench';
import type { HandsConfig, HandsGesture, HandsPiece, HandsShape } from '@/lib/masters/hands';
import { BENCH_LATTE_HEART, BENCH_LATTE_ROSETTA, BENCH_LATTE_TULIP } from '@/lib/skill-lab-seed-bench-latte';

/** 杯口直径 480 场景单位 ≈ 70 mm（偏离换算成毫米） */
const MM = 0.146;
const WAND = { x: 150, y: 300, h: 380 };
/** 高度尺：0.5–8 cm 折到 146 像素 */
const RY = (h: number) => 2 + 146 * (1 - (h - 0.5) / 7.5);
/** 尺上「融合」那一段（4–6 cm）的上沿，照抄代码版的算式 */
const FUSE_Y = 2 + 146 * (1 - (6 - 4) / 7.5) - 146 * (2 / 7.5);
const TOOL_NAME: Record<string, string> = { pitcher: '奶缸', hand: '手', brush: '毛刷', scalpel: '手术刀', needle: '持针器', torch: '焊枪' };

/** BenchRunner 场景层的盒子（百分比 → 场景坐标），和代码版 Layer 里一样的算法 */
const box = (l: BenchLayer) => { const x = l.x * 16, y = l.y * 9, w = l.w * 16, h = l.h * 9; return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 }; };

/** coach 层 → 场景里的阶段提示胶囊（宽度按字数，和代码版一样） */
function coachShapes(l: BenchLayer): HandsShape[] {
  if (!l.label) return [];
  const b = box(l), tw = l.label.length * 20 + 56;
  return [
    { kind: 'rect', when: l.on || '0', x: b.cx - tw / 2, y: b.y - 27, w: tw, h: 54, rx: 27, fill: 'rgba(10,12,26,.8)', color: l.color || 'rgba(255,255,255,.35)', width: 2 },
    { kind: 'text', when: l.on || '0', x: b.cx, y: b.y + 10, anchor: 'middle', text: l.label, color: l.color || '#fff', size: 25, weight: 700 },
  ];
}

/** readout 层 → 读数牌 */
function readoutShapes(l: BenchLayer): HandsShape[] {
  const b = box(l), hh = Math.min(b.h, 54), ww = Math.min(b.w, 260);
  return [
    { kind: 'rect', x: b.x, y: b.y, w: ww, h: hh, rx: 8, fill: '#0b0e1c', color: '#2a2f4d', width: 2 },
    { kind: 'text', x: b.x + ww - 10, y: b.y + hh * 0.68, anchor: 'end', mono: true, color: l.color || '#7cf5c9', size: hh * 0.55, weight: 800,
      text: l.text ? `{{${l.text}:${l.digits ?? 0}}}` : (0).toFixed(l.digits ?? 0), suffix: l.unit ? { text: ` ${l.unit}`, size: hh * 0.3, color: '#9aa0b8' } : undefined },
    ...(l.label ? [{ kind: 'text' as const, x: b.x + 10, y: b.y + hh * 0.68, mono: true, color: '#9aa0b8', size: hh * 0.3, weight: 400, text: l.label.slice(0, 6) }] : []),
  ];
}

/** pulse 层 → 两圈往外扩的脉冲 */
function pulseShapes(l: BenchLayer): HandsShape[] {
  const b = box(l), m = Math.min(b.w, b.h);
  return [0, 1].map(i => ({ kind: 'circle' as const, when: l.on || '0', x: b.cx, y: b.cy, r: m / 2, fill: 'none', color: l.color || '#12b5cb', width: 4,
    animate: [{ attr: 'r', values: `${m * 0.2};${m * 0.6}`, dur: '1.2s', begin: `${i * 0.6}s` }, { attr: 'opacity', values: '0.9;0', dur: '1.2s', begin: `${i * 0.6}s` }] }));
}

/** 一台拉花工位（surface: 'latte' 的规格）→ 母版 E 配置。场景层里得有 pour（带 control 的轨迹层） */
export function latteHandsConfig(bench: BenchSpec): HandsConfig {
  const layers = bench.scene?.layers || [];
  const pour = layers.find(l => l.kind === 'pour' && l.control);
  if (!pour?.control) throw new Error(`${bench.name}：没有 pour 轨迹层，不是拉花工位`);
  const cup = layers.find(l => l.kind === 'cup');
  const has = (id: string) => bench.controls.some(c => c.id === id);
  const hasVar = (id: string) => bench.vars.some(v => v.id === id);
  // 代码版的缺省：没有 h 控件当 6 cm、没有奶温 / 奶泡变量当 0；没有 milk_done 变量就当奶已经打好
  const H = has('h') ? 'h' : '6', FLOW = has('flow') ? 'flow' : '0';
  const STEAM = has('steam');
  const NEED = STEAM && hasVar('milk_done') ? '(milk_done == 0)' : '(0)';
  const POURING = `!${NEED}`;
  const MILK_T = hasVar('milk_t') ? 'milk_t' : '0', FOAM = hasVar('foam') ? 'foam' : '0', AIR = has('air') ? 'air' : '0';
  const HOT = `${MILK_T} >= 60`;
  const tool = pour.icon || 'pitcher', hold = TOOL_NAME[tool] || '奶缸';
  const coaches = layers.filter(l => l.kind === 'coach' && l.label);

  const gestures: HandsGesture[] = [];
  if (STEAM) gestures.push({
    id: 'steam', when: NEED, zone: 'steam_pot', hoverCursor: 'ns-resize',
    down: { act: [{ control: 'steam', value: 1, when: 'steam == 0' }] },
    // 槽的上面 15% 是「棒尖全埋进去」= 不进气，再往下才开始进气
    slide: { axis: 'y', from: WAND.y, len: WAND.h, set: 'steam_y', out: has('air') ? { control: 'air', raw: 'min(80, max(0, (steam_y - 0.15) / 0.85 * 80))', step: 5 } : undefined },
    up: { act: [{ control: 'steam', value: 0, when: 'steam == 1' }, ...(has('air') ? [{ control: 'air', value: 0, when: 'air > 0' }] : [])] },
  });
  gestures.push({
    id: 'pour', hoverCursor: 'grab',
    down: has('flow') ? { act: [{ control: 'flow', value: 'big == 1 ? 80 : 35', when: 'flow == 0' }] } : undefined,
    track: {
      points: layerPath(pour).map(p => [p.x, p.y] as [number, number]), control: pour.control, dev: pour.deviation,
      mark: cup ? (cup.level || '0') : undefined, headAs: 'head', draw: { tool, pace: pour.pace, on: pour.on },
    },
    up: has('flow') ? { act: [{ control: 'flow', value: 0, when: 'flow > 0' }] } : undefined,
  });

  const pieces: HandsPiece[] = [];
  if (STEAM) {
    const OP = `${NEED} ? 1 : 0.35`;
    pieces.push(
      { id: 'wand', x: 0, y: 0, opacity: OP, shapes: [
        { kind: 'rect', x: WAND.x - 90, y: WAND.y - 70, w: 210, h: WAND.h + 150, rx: 18, fill: 'rgba(12,16,32,.62)', color: 'rgba(255,255,255,.22)', width: 2 },
        { kind: 'text', x: WAND.x - 74, y: WAND.y - 42, text: '蒸汽棒 · STEAM', color: '#9aa0b8', size: 13, weight: 400, mono: true, spacing: 2 },
        { kind: 'line', x: WAND.x, y: WAND.y - 20, x2: WAND.x, y2: WAND.y + WAND.h * 0.55, color: '#c9ced8', width: 10 },
        { kind: 'circle', x: WAND.x, y: WAND.y + WAND.h * 0.55, r: 9, fill: '#9aa3b1' },
      ] },
      // 奶缸：按住上下拖；缸身描边开汽时变黄、把手烫了变粉；缸里的奶泡随奶泡厚度涨
      { id: 'steam_pot', x: WAND.x, y: `${WAND.y} + ${WAND.h} * steam_y + 40`, opacity: OP, shapes: [
        { kind: 'rect', x: -46, y: -30, w: 92, h: 78, rx: 14, fill: '#dfe4ec', color: '#79818f', colorWhen: [{ when: 'steam == 1', color: '#ffd166' }], width: 'steam == 1 ? 4 : 2' },
        { kind: 'rect', when: HOT, x: 46, y: -14, w: 26, h: 40, rx: 8, fill: '#ff5fa2', color: '#ff2f7f', width: 2 },
        { kind: 'rect', when: `!(${HOT})`, x: 46, y: -14, w: 26, h: 40, rx: 8, fill: '#efbf9c', color: '#b9805e', width: 2 },
        { kind: 'rect', x: -40, y: -30, w: 80, h: `max(4, 72 - ${FOAM} * 14)`, rx: 10, fill: '#fffaf0', opacity: 0.95 },
        ...[0, 1, 2, 3].map(i => ({ kind: 'circle' as const, when: 'steam == 1', x: -20 + i * 14, y: -36, r: 4, fill: '#fff', opacity: 0.8,
          animate: [{ attr: 'cy', values: '-36;-70', dur: `${0.6 + i * 0.1}s` }, { attr: 'opacity', values: '.8;0', dur: `${0.6 + i * 0.1}s` }] })),
      ] },
      { id: 'wand_text', x: 0, y: 0, opacity: OP, shapes: [
        { kind: 'text', x: WAND.x - 74, y: WAND.y + WAND.h + 42, text: `{{${MILK_T}}}℃ · 奶泡 {{${FOAM}:1}} cm · 进气 {{${AIR}}}%`, color: '#fff', size: 15, weight: 800 },
        ...([[true, '#ff5fa2', 800], [false, '#9aa0b8', 500]] as const).map(([hot, color, weight]) => ({
          kind: 'text' as const, when: hot ? HOT : `!(${HOT})`, x: WAND.x - 74, y: WAND.y + WAND.h + 64, color, size: 12.5, weight,
          text: '按住奶缸上下拖：缸越低进气越多', textWhen: [
            { when: `!${NEED}`, text: '奶已经打好' }, { when: HOT, text: '烫手了！松开关汽' },
            { when: `steam == 1 && ${MILK_T} < 40 && ${AIR} > 0`, text: '在进气（撕纸声）…40℃ 前把缸抬高停止进气' },
            { when: `steam == 1 && ${MILK_T} < 40`, text: '打绵中，到 60℃ 再松' }, { when: 'steam == 1', text: '进气够了就把缸抬高' },
          ] })),
      ] },
    );
  }
  // 奶流（壶嘴到液面的虚线，越高越长、流量越大越粗）+ 奶缸旁的高度尺 / 流量
  pieces.push(
    { id: 'stream', when: `${POURING} && ${FLOW} > 0`, x: 'head_x', y: 'head_y', shapes: [
      { kind: 'line', x: 0, y: 0, x2: 0, y2: `10 + ${H} * 10`, color: '#fffaf0', width: `2 + ${FLOW} / 14`, dash: '6 6', opacity: 0.95, animate: [{ attr: 'stroke-dashoffset', values: '0;-24', dur: '0.4s' }] },
    ] },
    { id: 'ruler', when: POURING, x: 'head_x + 84', y: 'head_y - 90', shapes: [
      { kind: 'rect', x: 0, y: 0, w: 14, h: 150, rx: 7, fill: 'rgba(12,16,32,.6)', color: 'rgba(255,255,255,.35)', width: 1.5 },
      { kind: 'rect', x: 2, y: FUSE_Y, w: 10, h: 146 * (2 / 7.5), rx: 5, fill: 'rgba(106,92,255,.6)' },
      { kind: 'rect', x: 2, y: RY(2), w: 10, h: 146 * (1 / 7.5), rx: 5, fill: 'rgba(61,220,151,.7)' },
      { kind: 'circle', x: 7, y: `2 + 146 * (1 - (${H} - 0.5) / 7.5)`, r: 9, fill: '#ffd166', color: '#171a2e', width: 2 },
      { kind: 'text', x: 24, y: `2 + 146 * (1 - (${H} - 0.5) / 7.5) + 5`, text: `{{${H}:1}} cm`, color: '#fff', size: 15, weight: 800, shadow: true },
      { kind: 'text', x: 24, y: FUSE_Y + 14, text: '融合', color: '#b9b2ff', size: 11, weight: 400 },
      { kind: 'text', x: 24, y: RY(2) + 14, text: '出图案', color: '#3ddc97', size: 11, weight: 400 },
      { kind: 'text', x: 0, y: 178, size: 14, weight: 800, shadow: true, color: '#fff', colorWhen: [{ when: `${FLOW} > 45`, color: '#ffd166' }],
        textParts: [{ when: `${FLOW} > 0`, text: `流量 {{${FLOW}}}%` }, { when: `${FLOW} > 0 && big == 1`, text: ' · 大' }, { when: `${FLOW} <= 0`, text: '断流' }] },
    ] },
  );

  const over: HandsShape[] = [];
  for (const l of layers) {
    if (l.kind === 'pulse') over.push(...pulseShapes(l));
    else if (l.kind === 'readout') over.push(...readoutShapes(l));
    else if (l.kind === 'coach') over.push(...coachShapes(l));
  }

  // 操作说明（底部）：标题 = 第一条亮着的 coach，没有就按阶段兜底
  const hud: HandsShape[] = [
    { kind: 'rect', x: 300, y: 744, w: 1000, h: 118, rx: 16, fill: 'rgba(12,16,32,.72)', color: 'rgba(255,255,255,.2)', width: 1.5 },
    { kind: 'text', x: 326, y: 782, color: '#ffd166', size: 22, weight: 800, text: '拖着奶缸沿白线走',
      textWhen: [...coaches.map(c => ({ when: c.on || '0', text: c.label! })), { when: NEED, text: '先把奶打好' }] },
    { kind: 'text', x: 326, y: 818, color: '#e6e8f5', size: 15, weight: 400,
      text: '拖着奶缸走 = 倒，松开 = 断流 · 滚轮 = 高度 · 按住 Shift（或点右边按钮）= 大流量',
      textWhen: [{ when: NEED, text: '左边蒸汽位：按住奶缸上下拖，缸低进气多；40℃ 前抬高停止进气，60–65℃ 松开关汽。' }] },
    { kind: 'text', x: 326, y: 846, color: '#9aa0b8', size: 13, weight: 400,
      text: '融合：高位细流（4–6 cm）· 出图案：压到 1.5 cm 以内 + 大流量 · 收尾：松开 Shift 收细，提起来一刀穿过',
      textWhen: [{ when: NEED, text: '奶打好之前别倒：杯子里只有咖啡。' }] },
  ];

  const flowAct = (v: number | string) => has('flow') ? [{ control: 'flow', value: v, when: 'on_pour == 1' }] : [];
  const cb = cup && box(cup);
  return {
    master: 'hands',
    locals: { big: 0, ...(STEAM ? { steam_y: 0.35 } : {}) },
    subjects: cb ? [{ plugin: 'latte-cup', x: cb.cx, y: cb.cy, params: { r: Math.min(cb.w, cb.h) / 2 }, trail: 'pour' }] : [],
    pieces, over, hud,
    zones: STEAM ? [{ id: 'steam_pot', kind: 'rect', on: 'steam_pot', x: -46, y: -30, w: 118, h: 78 }] : [],
    gestures,
    wheel: has('h') ? [{ control: 'h', step: 0.5, min: 0.5, max: 8 }] : [],
    keys: [{ key: 'Shift', hold: 'big', action: { act: flowAct(80) }, up: { act: flowAct(35) } }],
    buttons: [{ x: 1120, y: 766, w: 150, h: 48, rx: 12, size: 16, weight: 800, when: POURING, label: '大流量', labelWhen: [{ when: 'big == 1', text: '大流量 · 开' }],
      litWhen: 'big == 1', litColor: '#ffd166', litInk: '#171a2e', action: { act: [{ control: 'big', value: 'big == 1 ? 0 : 1' }, ...flowAct('big == 1 ? 80 : 35')] } }],
    camera: { gesture: 'pour', hold, gain: 0.55, smooth: 0.6, devScale: pour.deviation ? MM : undefined, at: { x: 32, y: 140, w: 270 } },
  };
}

/** 整台搬：surface 换成 hands、配上配置、场景层清掉（底图留着）。物理不动 */
export function toLatteHands(bench: BenchSpec): BenchSpec {
  return { ...bench, surface: 'hands', surfaceConfig: latteHandsConfig(bench), scene: bench.scene ? { ...bench.scene, layers: [] } : undefined };
}

/** 代码版（库里的样子：种子规格 + surface: 'latte'） */
export const latteCodeSpec = (b: BenchSpec): BenchSpec => ({ ...b, surface: 'latte' });
export const LATTE_BENCHES = { heart: BENCH_LATTE_HEART, tulip: BENCH_LATTE_TULIP, rosetta: BENCH_LATTE_ROSETTA };
export const latteHeartHandsSpec = () => toLatteHands(latteCodeSpec(BENCH_LATTE_HEART));
export const latteTulipHandsSpec = () => toLatteHands(latteCodeSpec(BENCH_LATTE_TULIP));
export const latteRosettaHandsSpec = () => toLatteHands(latteCodeSpec(BENCH_LATTE_ROSETTA));
