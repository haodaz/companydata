/**
 * 预检分诊台（晚高峰）· 母版 A（desktop）纯配置版（2026-10-12）：和 surfaces/Triage.tsx 画的、点的、说的一样，全是数据。
 *   左到达队列（卡片名单，按到达时间出现）· 中选中病人（主诉 / 外观 / 量体征 4 秒出数 / 问诊出病史）· 右分级 + 去向 + 确认。
 *   每个病人的分级 / 去向 / 量没量写进隐藏控件 lvN / dsN / mN（动作里带模板的控件名 + over），报警条件、等候、空床都是表达式。
 *   演示回放：脚本直接写 mN / lvN / dsN，台面读控件就对；「问过」靠 watch 盯 ask 事件补上。物理原样沿用 triageSpec。
 */
import type { BenchSpec } from '@/lib/bench';
import type { DesktopConfig } from '@/lib/masters/desktop';
import { DESTS, LEVELS, TRIAGE_PATIENTS, triageSpec } from '@/lib/lab-triage-spec';

const LV_COLOR = ['#c9cbe0', '#d6336c', '#ff8a5f', '#e0a800', '#12a150'];
const LV_SUB = ['', '随时可能死，立刻抢救', '10 分钟内必须有医生', '30 分钟内看，候诊要盯', '可以等，按号来'];
const P = TRIAGE_PATIENTS;
/** 报警：72 岁慢阻肺的王秀兰 85 秒还没分诊 */
const ALARM = 't >= 85 && lv4 == 0';
const WORRY = 'row.critical == 1 && ctl.lv[row.id] == 0 && t - row.arrive > 45';
const ARRIVED = P.map(p => `(t >= ${p.arrive} ? 1 : 0)`).join(' + ');
const RESUS_USED = P.map(p => `(ds${p.id} == 2 && lv${p.id} > 0 ? 1 : 0)`).join(' + ');

export const TRIAGE_DESKTOP: DesktopConfig = {
  master: 'desktop', layout: 'panes', columns: '330px minmax(0, 1fr) 320px', gap: 0,
  data: {
    // 体征拆成数（血压另存收缩压，判红用）；critical 换成 1 / 0
    patients: P.map(p => ({ id: p.id, arrive: p.arrive, name: p.name, age: p.age, complaint: p.complaint, look: p.look, history: p.history, critical: p.critical ? 1 : 0,
      hr: p.vitals.hr, bp: p.vitals.bp, sbp: parseInt(p.vitals.bp, 10), spo2: p.vitals.spo2, temp: p.vitals.temp, rr: p.vitals.rr })),
    levels: LEVELS.map((label, id) => ({ id, label, color: LV_COLOR[id] })),
    dests: DESTS.map((label, id) => ({ id, label })),
  },
  ui: { asked: {}, measuring: 0 },
  // 演示：脚本按了「问诊」，就当问过眼前这位
  watch: [{ control: 'ask', do: { when: 'pick > 0', ui: [{ name: 'asked', at: 'pick', value: 1 }] } }],
  announce: [{ from: 'patients', when: 't >= row.arrive', say: '新到：{{row.name}}（{{row.complaint}}）', tone: 'violet', ms: 3500 }],
  topbar: [
    { kind: 'title', text: '急诊预检分诊 · 20:0{{t / 60:i}}:{{t % 60:i2}}' },
    { kind: 'sub', text: `到达 {{${ARRIVED}}} · 已分 {{done:0}} · 抢救室空床 {{max(0, 2 - (${RESUS_USED}))}}` },
    { kind: 'spacer' },
    { kind: 'toast' },
    { kind: 'badge', when: ALARM, tone: 'alarm', text: '⚠ 候诊区报警：王秀兰 SpO₂ 84%' },
  ],
  panes: [
    // 队列
    { pad: 14, scroll: true, border: 'right', blocks: [
      { kind: 'label', text: '到达队列 · 点一个叫号', spaced: true, mb: 8 },
      { kind: 'cards', from: 'patients', appear: 't >= row.arrive', pending: '还会有人到……', selWhen: 'pick == row.id',
        bg: '#fffdf5', bgWhen: [{ when: 'ctl.lv[row.id] > 0', color: '#fff' }, { when: WORRY, color: '#fff0f3' }],
        dot: '{{levels[ctl.lv[row.id]].color}}', title: '{{row.name}}', sub: '{{row.age}}',
        right: { text: '等 {{max(0, t - row.arrive):i}} 秒', textWhen: [{ when: 'ctl.lv[row.id] > 0', text: '{{levels[ctl.lv[row.id]].label}} · {{dests[ctl.ds[row.id]].label}}' }],
          color: '#6b7089', colorWhen: [{ when: WORRY, color: '#d6336c' }], boldWhen: WORRY },
        body: '{{row.complaint}}', alerts: [{ when: `row.id == 4 && ${ALARM}`, text: '⚠ 候诊区血氧 84%，快处理' }],
        // 叫号：选中 + 把面板上的分级 / 去向拨回这位已经分过的
        action: { set: [{ control: 'pick', value: 'row.id' }, { control: 'level', value: 'ctl.lv[row.id]' }, { control: 'dest', value: 'ctl.ds[row.id]' }] } },
    ] },
    // 病人
    { pad: 20, scroll: true, blocks: [
      { kind: 'scope', from: 'patients', at: 'pick', gap: 14,
        empty: [{ kind: 'text', text: '左边点一个病人开始。先看谁？胸痛出汗的那位等不起。', size: 15, color: '#6b7089', mt: 40 }],
        blocks: [
          { kind: 'card', blocks: [
            { kind: 'head', title: '{{row.name}}', sub: '{{row.age}}', right: '到达 {{row.arrive / 60:i}}:{{row.arrive % 60:i2}}' },
            { kind: 'line', label: '主诉：', text: '{{row.complaint}}', size: 15, mt: 8 },
            { kind: 'line', label: '一眼看上去：', text: '{{row.look}}', size: 14, color: '#2b2f4a', mt: 4 },
          ] },
          { kind: 'grid', cols: '1fr 1fr', gap: 14, blocks: [
            { kind: 'card', title: '生命体征', buttons: [{ kind: 'button', tone: 'violet', size: 'sm', label: '量生命体征（4 秒）',
                labelWhen: [{ when: 'ctl.m[row.id] == 1', text: '已测' }, { when: 'ui.measuring == row.id', text: '测量中…' }],
                doneWhen: 'ctl.m[row.id] == 1', enabled: 'ui.measuring == 0',
                // 按下去 4 秒（真实时间）后出数：写 m<id>
                action: { set: [{ control: 'measure' }], ui: [{ name: 'measuring', value: 'row.id' }],
                  after: { ms: 4000, do: { set: [{ control: 'm{{ui.measuring}}', over: 'patients', value: 1 }], ui: [{ name: 'measuring', value: 0 }] } } } }],
              blocks: [
                { kind: 'kv', when: 'ctl.m[row.id] == 1', cols: 2, mono: true, items: [
                  { label: '心率', text: '{{row.hr}}', bad: 'row.hr > 120 || row.hr < 50' },
                  { label: '血压', text: '{{row.bp}}', bad: 'row.sbp >= 70 && row.sbp < 90' },
                  { label: '血氧', text: '{{row.spo2}}%', bad: 'row.spo2 < 92' },
                  { label: '体温', text: '{{row.temp}}℃', bad: 'row.temp >= 39.5' },
                  { label: '呼吸', text: '{{row.rr}}/分', bad: 'row.rr >= 28' },
                ] },
                { kind: 'text', when: 'ctl.m[row.id] != 1', size: 13.5, color: '#9aa0b8', text: '还没量。看着轻的也要量一下。', textWhen: [{ when: 'ui.measuring == row.id', text: '袖带在充气……' }] },
              ] },
            { kind: 'card', title: '问诊', buttons: [{ kind: 'button', tone: 'teal', size: 'sm', label: '问两句', labelWhen: [{ when: 'ui.asked[row.id] == 1', text: '已问' }],
                doneWhen: 'ui.asked[row.id] == 1', action: { set: [{ control: 'ask' }], ui: [{ name: 'asked', at: 'row.id', value: 1 }] } }],
              blocks: [
                { kind: 'text', size: 14, lh: 1.7, color: '#9aa0b8', colorWhen: [{ when: 'ui.asked[row.id] == 1', color: '#171a2e' }],
                  text: '什么时候开始的、有没有基础病、吃过什么药？', textWhen: [{ when: 'ui.asked[row.id] == 1', text: '{{row.history}}' }] },
              ] },
          ] },
        ] },
    ] },
    // 分级
    { pad: 16, border: 'left', bg: '#fff', gap: 12, blocks: [
      { kind: 'label', text: '分级（四级）', spaced: true, mb: 0 },
      { kind: 'choices', control: 'level', enabled: 'pick > 0', look: 'card', options: [1, 2, 3, 4].map(l => ({ v: l, label: LEVELS[l], sub: LV_SUB[l], color: LV_COLOR[l] })) },
      { kind: 'label', text: '去向', spaced: true, mb: 0, mt: 4 },
      { kind: 'choices', control: 'dest', enabled: 'pick > 0', look: 'pill', dir: 'row', options: DESTS.map((d, i) => ({ v: i, label: d })) },
      { kind: 'button', tone: 'gradient', size: 'lg', full: true, push: true, label: '确认分诊', labelWhen: [{ when: 'ctl.lv[pick] > 0', text: '改分诊' }], enabled: 'pick > 0 && level > 0',
        action: { set: [{ control: 'confirm' }, { control: 'lv{{pick}}', over: 'patients', value: 'level' }, { control: 'ds{{pick}}', over: 'patients', value: 'dest' }] } },
    ] },
  ],
};

export function triageDesktopSpec(image: string): BenchSpec {
  return { ...triageSpec(image), surface: 'desktop', surfaceConfig: TRIAGE_DESKTOP };
}
