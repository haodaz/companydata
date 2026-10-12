/**
 * 电气维修（3 号风机不启动）· 母版 B（field）纯配置版（2026-10-12）：和 surfaces/Repair.tsx 一样的柜子、风机、工具和测试点，全是数据。
 * 物理沿用 repairSpec；代码版 Repair.tsx 留着当保底。
 */
import type { BenchSpec } from '@/lib/bench';
import type { FieldConfig, MasterShape } from '@/lib/lab-masters';
import { REPAIR_POINTS, REPAIR_TOOLS, repairSpec } from '@/lib/lab-repair-spec';

const OPEN = 'open == 1', SHUT = 'open == 0';
/** 测试点：拿万用表点了出读数（通电 / 断电两种），并记一笔 m_<点>（量过了） */
const probe = (k: string, x: number, y: number, w: number, h: number, title: string, inCabinet = true) => ({
  id: k, x, y, w, h, title, when: inCabinet ? OPEN : undefined,
  action: {
    needTool: 1, toolMsg: '拿万用表才能量',
    act: [{ control: `m_${k}` }],
    readout: { title: `万用表 · ${REPAIR_POINTS[k].label} · 断电测通断`, titleWhen: [{ when: 'power == 1', text: `万用表 · ${REPAIR_POINTS[k].label} · 通电测电压` }], text: REPAIR_POINTS[k].off, textWhen: [{ when: 'power == 1', text: REPAIR_POINTS[k].on }] },
  },
});
const fuse = (k: string, n: string, x: number): MasterShape[] => [
  { kind: 'rect', x, y: 200, w: 60, h: 110, fill: '#d8dde6', color: '#3b4254', when: k === 'fu2' ? `${OPEN} && fuse_ok == 1` : OPEN },
  { kind: 'rect', x: x + 18, y: 215, w: 24, h: 80, rx: 6, fill: '#f3f5f8', when: k === 'fu2' ? `${OPEN} && fuse_ok == 1` : OPEN },
  ...(k === 'fu2' ? [
    { kind: 'rect', x, y: 200, w: 60, h: 110, fill: '#6b4a4a', color: '#3b4254', when: `${OPEN} && fuse_ok == 0` },
    { kind: 'rect', x: x + 18, y: 215, w: 24, h: 80, rx: 6, fill: '#2b1f1f', when: `${OPEN} && fuse_ok == 0` },
  ] as MasterShape[] : []),
  { kind: 'text', x: x + 30, y: 330, anchor: 'middle', text: n, color: '#fff', size: 14, weight: 700, when: OPEN },
];
const blade = (r: number): MasterShape => ({ kind: 'path', x: 1180, y: 330, rotate: r, d: 'M 0 0 L 22 -120 Q 0 -140 -22 -120 Z', fill: '#8a93a6', spinWhen: 'running == 1' });

export const REPAIR_FIELD: FieldConfig = {
  master: 'field', bg: '#1b1f2a',
  tools: REPAIR_TOOLS, toolControl: 'tool', toolsAt: { x: 880, y: 40 },
  wantTool: 'estop == 0 ? 0 : fr_reset_done < 1 ? 0 : open == 0 ? (power == 1 ? 0 : lock == 0 ? 0 : verify_done == 0 ? 2 : 3) : fuse_ok == 0 ? (m_fu2 == 1 ? 0 : 1) : 0',
  shapes: [
    { kind: 'rect', x: 0, y: 700, w: 1600, h: 200, rx: 0, fill: '#232834' },
    // 电控柜
    { kind: 'rect', x: 120, y: 120, w: 560, h: 620, rx: 10, fill: '#9aa3b1', color: '#5b6478', width: 4 },
    { kind: 'rect', x: 150, y: 150, w: 500, h: 560, rx: 6, fill: '#2b3040', color: '#5b6478', width: 3, when: OPEN },
    { kind: 'rect', x: 150, y: 150, w: 500, h: 560, rx: 6, fill: '#b9c0cc', when: SHUT },
    { kind: 'rect', x: 590, y: 400, w: 16, h: 60, rx: 6, fill: '#5b6478', when: SHUT },
    { kind: 'text', x: 400, y: 440, anchor: 'middle', text: '3# 排风机 电控柜', color: '#3b4254', size: 20, weight: 800, when: SHUT },
    { kind: 'text', x: 400, y: 470, anchor: 'middle', text: '⚠ 开门前断电挂牌验电', color: '#8a3b3b', size: 14, when: SHUT },
    // 柜内
    ...fuse('fu1', 'FU1', 200), ...fuse('fu2', 'FU2', 290), ...fuse('fu3', 'FU3', 380),
    { kind: 'text', x: 460, y: 222, text: '进线端', color: '#9aa0b8', size: 12, when: OPEN },
    { kind: 'rect', x: 460, y: 230, w: 160, h: 40, rx: 6, fill: '#3b4254', color: '#6b7089', when: OPEN },
    ...[0, 1, 2].map(i => ({ kind: 'circle', x: 485 + i * 55, y: 250, r: 9, fill: '#c9a24a', when: OPEN } as MasterShape)),
    { kind: 'rect', x: 200, y: 380, w: 150, h: 120, rx: 10, fill: '#3b3f4e', color: '#6b7089', when: OPEN },
    { kind: 'text', x: 275, y: 425, anchor: 'middle', text: 'KM1', color: '#ffd166', size: 16, weight: 800, when: OPEN },
    { kind: 'text', x: 275, y: 448, anchor: 'middle', text: '接触器（表面发黑）', color: '#c7cbe6', size: 11, when: OPEN },
    { kind: 'rect', x: 210, y: 460, w: 130, h: 10, rx: 4, fill: 'rgba(26,26,26,.7)', when: OPEN },
    { kind: 'rect', x: 380, y: 380, w: 150, h: 120, rx: 10, fill: '#3b3f4e', color: '#6b7089', colorWhen: [{ when: 'fr_trip == 1', color: '#ff5fa2' }], when: OPEN },
    { kind: 'text', x: 455, y: 420, anchor: 'middle', text: 'FR1', color: '#7cc8ff', size: 16, weight: 800, when: OPEN },
    { kind: 'text', x: 455, y: 442, anchor: 'middle', size: 12, color: '#c7cbe6', colorWhen: [{ when: 'fr_trip == 1', color: '#ff5fa2' }], text: '热继电器 · 正常', textWhen: [{ when: 'fr_trip == 1', text: '跳脱 · 按蓝钮复位' }], when: OPEN },
    { kind: 'circle', x: 455, y: 475, r: 12, fill: '#2f6fd6', color: '#fff', width: 2, when: OPEN },
    { kind: 'rect', x: 200, y: 540, w: 330, h: 60, rx: 8, fill: '#3b4254', color: '#6b7089', when: OPEN },
    { kind: 'text', x: 365, y: 565, anchor: 'middle', text: '电机接线端 U V W', color: '#9aa0b8', size: 12, when: OPEN },
    ...[0, 1, 2].map(i => ({ kind: 'circle', x: 300 + i * 65, y: 585, r: 8, fill: '#c9a24a', when: OPEN } as MasterShape)),
    { kind: 'text', x: 200, y: 640, text: '换件：', color: '#ffd166', size: 13, weight: 700, when: OPEN },
    // 总开关 + 挂牌 + 验电
    { kind: 'rect', x: 700, y: 160, w: 120, h: 160, rx: 10, fill: '#3b4254', color: '#6b7089' },
    { kind: 'text', x: 760, y: 185, anchor: 'middle', text: '总开关 QF', color: '#9aa0b8', size: 12 },
    { kind: 'rect', x: 740, y: 200, w: 40, h: 90, rx: 8, fill: '#1b1f2a' },
    { kind: 'rect', x: 744, y: 204, w: 32, h: 38, rx: 6, fill: '#ff5fa2', when: 'power == 1' },
    { kind: 'rect', x: 744, y: 248, w: 32, h: 38, rx: 6, fill: '#3ddc97', when: 'power == 0' },
    { kind: 'text', x: 760, y: 310, anchor: 'middle', size: 13, weight: 800, color: '#3ddc97', colorWhen: [{ when: 'power == 1', color: '#ff5fa2' }], text: 'OFF', textWhen: [{ when: 'power == 1', text: 'ON · 有电' }] },
    { kind: 'rect', x: 700, y: 340, w: 120, h: 70, rx: 10, fill: '#3b4254', color: '#6b7089', when: 'lock == 0' },
    { kind: 'rect', x: 700, y: 340, w: 120, h: 70, rx: 10, fill: '#c9a24a', color: '#6b7089', when: 'lock == 1' },
    { kind: 'text', x: 760, y: 370, anchor: 'middle', color: '#fff', size: 13, weight: 800, text: '挂牌上锁', textWhen: [{ when: 'lock == 1', text: '🔒 已挂牌上锁' }] },
    { kind: 'text', x: 760, y: 392, anchor: 'middle', color: '#c7cbe6', size: 11, text: '断电后点这里', textWhen: [{ when: 'lock == 1', text: '「有人检修 禁止合闸」' }] },
    { kind: 'rect', x: 700, y: 430, w: 120, h: 50, rx: 10, fill: '#3b4254', color: '#6b7089' },
    { kind: 'text', x: 760, y: 461, anchor: 'middle', text: '验电（验电笔）', color: '#fff', size: 13, weight: 800 },
    // 风机 + 面板
    { kind: 'circle', x: 1180, y: 330, r: 150, fill: '#2b3040', color: '#6b7089', width: 6 },
    ...[0, 60, 120, 180, 240, 300].map(blade),
    { kind: 'circle', x: 1180, y: 330, r: 22, fill: '#5b6478' },
    { kind: 'text', x: 1180, y: 510, anchor: 'middle', size: 16, weight: 800, color: '#9aa0b8', colorWhen: [{ when: 'running == 1', color: '#3ddc97' }], text: '停机', textWhen: [{ when: 'running == 1', text: '运转中 · {{run_s}} 秒' }] },
    { kind: 'rect', x: 1000, y: 540, w: 360, h: 150, rx: 12, fill: '#3b4254', color: '#6b7089' },
    { kind: 'circle', x: 1050, y: 590, r: 26, fill: '#ff2f4f', color: '#fff', width: 3, when: 'estop == 0' },
    { kind: 'circle', x: 1050, y: 590, r: 26, fill: '#6b2d3b', color: '#fff', width: 3, when: 'estop == 1' },
    { kind: 'text', x: 1050, y: 640, anchor: 'middle', size: 12, weight: 800, color: '#ff5fa2', colorWhen: [{ when: 'estop == 1', color: '#9aa0b8' }], text: '急停（按下状态）', textWhen: [{ when: 'estop == 1', text: '急停已复位' }] },
    { kind: 'circle', x: 1240, y: 590, r: 12, fill: '#2b3040', color: '#9aa0b8', width: 2, when: 'running == 0' },
    { kind: 'circle', x: 1240, y: 590, r: 12, fill: '#3ddc97', color: '#9aa0b8', width: 2, when: 'running == 1' },
    { kind: 'text', x: 1240, y: 625, anchor: 'middle', text: '运行', color: '#9aa0b8', size: 11 },
    { kind: 'circle', x: 1290, y: 590, r: 12, fill: '#2b3040', color: '#9aa0b8', width: 2, when: 'fr_trip == 0' },
    { kind: 'circle', x: 1290, y: 590, r: 12, fill: '#ffd166', color: '#9aa0b8', width: 2, when: 'fr_trip == 1' },
    { kind: 'text', x: 1290, y: 625, anchor: 'middle', text: '过载', color: '#9aa0b8', size: 11 },
    { kind: 'rect', x: 1120, y: 645, w: 220, h: 34, rx: 6, fill: '#0f1224' },
    { kind: 'text', x: 1230, y: 668, anchor: 'middle', text: 'E07 通讯超时 · 09/28 15:02', color: '#ff8a5f', size: 13, mono: true },
  ],
  buttons: [
    { x: 540, y: 160, w: 100, h: 34, label: '关柜门', color: '#6b7089', when: OPEN, action: { needTool: 3, toolMsg: '柜门要用螺丝刀开', act: [{ control: 'open', value: 0 }] } },
    { x: 260, y: 620, w: 130, h: 34, label: '换 FU2 熔断器', color: '#ff8a5f', when: OPEN, action: { needTool: 0, toolMsg: '用手换件', act: [{ control: 'fuse' }] } },
    { x: 400, y: 620, w: 130, h: 34, label: '换 KM1 接触器', color: '#6b7089', when: OPEN, action: { needTool: 0, toolMsg: '用手换件', act: [{ control: 'swap_km' }] } },
    { x: 1110, y: 565, w: 90, h: 50, label: '启动', color: '#12a150', action: { needTool: 0, toolMsg: '用手按', act: [{ control: 'start' }], sayWhen: [{ when: 'estop == 0', text: '没反应：急停灯还亮着' }, { when: 'fr_trip == 1', text: '没反应：热继电器跳脱指示亮着' }, { when: 'power == 0', text: '没电' }, { when: 'open == 1', text: '柜门开着，门限位不允许启动' }] } },
  ],
  hotspots: [
    { id: 'door', x: 150, y: 150, w: 500, h: 560, title: '柜门（螺丝刀）', when: SHUT, action: { needTool: 3, toolMsg: '柜门要用螺丝刀开', act: [{ control: 'open', value: 1 }] } },
    probe('fu1', 200, 200, 60, 110, 'FU1 测试点'), probe('fu2', 290, 200, 60, 110, 'FU2 测试点'), probe('fu3', 380, 200, 60, 110, 'FU3 测试点'),
    probe('in', 460, 230, 160, 40, '进线端子', false),
    probe('km', 200, 380, 150, 120, 'KM1 出线（测试点）'),
    { id: 'fr', x: 380, y: 380, w: 150, h: 120, title: 'FR1 复位', when: OPEN, action: { needTool: 0, toolMsg: '用手按复位', act: [{ control: 'fr_reset' }] } },
    probe('motor', 200, 540, 330, 60, '电机接线端（测试点）'),
    { id: 'power', x: 700, y: 160, w: 120, h: 160, title: '总开关', action: { act: [{ control: 'power', value: 'power == 1 ? 0 : 1' }] } },
    { id: 'lock', x: 700, y: 340, w: 120, h: 70, title: '挂牌上锁', action: { guards: [{ when: 'power == 1', say: '先断电，再挂牌上锁' }], act: [{ control: 'lock', value: 'lock == 1 ? 0 : 1' }] } },
    { id: 'verify', x: 700, y: 430, w: 120, h: 50, title: '验电', action: { needTool: 2, toolMsg: '拿验电笔', act: [{ control: 'verify' }], say: '验电笔不亮：确认无电', sayWhen: [{ when: 'power == 1', text: '验电笔亮：还有电！' }] } },
    { id: 'estop', x: 1020, y: 560, w: 60, h: 90, title: '急停', action: { needTool: 0, toolMsg: '用手旋开急停', guards: [{ when: 'estop == 1', say: '急停已经复位了' }], act: [{ control: 'estop', value: 1 }] } },
  ],
  steps: [
    { label: '看现场：急停被按下，旋开复位', done: 'estop == 1' }, { label: '按启动 → 几秒就跳：复位热继电器', done: 'fr_reset_done >= 1' },
    { label: '断电 → 挂牌上锁 → 验电笔验电 → 螺丝刀开柜', done: 'open == 1 && lock == 1 && power == 0 && verify_done >= 1' }, { label: '万用表量熔断器：FU2 断', done: 'm_fu2 >= 1' },
    { label: '断电换 FU2', done: 'fuse_ok >= 1' }, { label: '关门 → 拆锁 → 合闸 → 启动，转 10 秒', done: 'run_s >= 10' },
  ],
  stepsAt: { x: 120, y: 760, w: 1360, cols: 3, title: '不启动：先看 → 再量 → 再换；开柜前断电挂牌验电' },
  sayAt: { x: 880, y: 260, w: 520 }, readoutAt: { x: 880, y: 120, w: 520 },
};

export function repairFieldSpec(image: string): BenchSpec {
  return { ...repairSpec(image), surface: 'field', surfaceConfig: REPAIR_FIELD };
}
