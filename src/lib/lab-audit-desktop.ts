/**
 * 审计底稿（银行存款 12 月对账）· 母版 A（desktop）纯配置版（2026-10-12）：和 surfaces/Audit.tsx 画的、点的、说的一样，全是数据。
 *   左对账单 / 中日记账（表格，点行选中）· 顶栏「勾对 / 看凭证」· 右边凭证便签 + 标记下拉 + 底稿写作框。
 *   勾对对错、标记对错 → 隐藏控件 matched / wrong / u1 / u2 / flag / false_flag / viewed9 的写法都在动作数据里；
 *   演示回放时脚本直接拨 matched，watch 把那一行划掉。物理（vars / rules / goals / 老手脚本）原样沿用 auditSpec。
 */
import type { BenchSpec } from '@/lib/bench';
import type { DCol, DesktopConfig } from '@/lib/masters/desktop';
import { BANK, LEDGER, MARKS, VOUCHERS, auditSpec, type Line } from '@/lib/lab-audit-spec';

/** 方向换成数（表达式里比不了字符串）：收 1 / 付 -1 */
const rows = (xs: Line[]) => xs.map(x => ({ ...x, sign: x.dir === '收' ? 1 : -1 }));
const DEFAULT_VOUCHER = '凭证齐全：发票 / 合同 / 入库或验收单与付款金额一致。';

const cols = (side: 'b' | 'l'): DCol[] => [
  { text: '{{row.date}}', mono: true, size: 12.5 },
  { text: '{{row.memo}}', size: 13 },
  { text: '−{{row.amt:,}}', textWhen: [{ when: 'row.sign > 0', text: '+{{row.amt:,}}' }], mono: true, size: 13, weight: 700, align: 'right',
    color: '#171a2e', colorWhen: [{ when: 'ui.matched[row.id] == 1', color: '#8a93a6' }, { when: 'row.sign > 0', color: '#12a150' }] },
  // 打过的标记：取「：」前那半截
  { text: `{{marks[ui.marks_${side}[row.id]].short}}`, size: 11, pad: '7px 6px', nowrap: true, color: '#6b7089', colorWhen: [{ when: `ui.marks_${side}[row.id] == 3`, color: '#d6336c' }] },
];
const table = (side: 'b' | 'l', title: string, ctl: 'pb' | 'pl') => ({
  kind: 'table' as const, title, from: side === 'b' ? 'bank' : 'ledger', cols: cols(side), grow: true,
  selWhen: `${ctl} == row.id`, doneWhen: 'ui.matched[row.id] == 1',
  // 再点一下选中的行就取消
  action: { set: [{ control: ctl, value: `${ctl} == row.id ? 0 : row.id` }] },
});

export const AUDIT_DESKTOP: DesktopConfig = {
  master: 'desktop', layout: 'panes', columns: 'minmax(0, 1fr) minmax(0, 1fr) 340px', gap: 12, sayTone: 'pink', sayMs: 2600,
  data: {
    bank: rows(BANK), ledger: rows(LEDGER),
    vouchers: Object.entries(VOUCHERS).map(([id, text]) => ({ id: +id, text })),
    marks: MARKS.map((m, i) => ({ id: i, label: m, short: i ? m.replace(/：.*/, '') : '' })),
    sides: [{ id: 0, label: '对账单' }, { id: 1, label: '日记账' }],
  },
  ui: { matched: {}, marks_b: {}, marks_l: {} },
  // 演示：脚本直接拨隐藏的 matched，台面跟着把那一行划掉（手动勾对时动作里也会拨它，重复记没关系）
  watch: [{ control: 'matched', do: { when: 'ev.value > 0', ui: [{ name: 'matched', at: 'ev.value', value: 1 }] } }],
  topbar: [
    { kind: 'title', text: '审计底稿 · 货币资金 · 银行存款 12 月对账' },
    { kind: 'sub', text: '被审单位：恒基实业 · 工行基本户' },
    { kind: 'spacer' },
    { kind: 'button', label: '勾对 ✓', tone: 'primary', enabled: 'pb > 0 && pl > 0', action: {
      set: [{ control: 'match' }],
      first: [
        // 同一笔（同行号）、金额、方向都对上：划掉、清选择；已经勾过的不重复记
        { when: 'pb == pl && bank[pb].amt > 0 && bank[pb].amt == ledger[pl].amt && bank[pb].sign == ledger[pl].sign',
          first: [{ when: 'ui.matched[pb] != 1', set: [{ control: 'matched', value: 'pb' }], ui: [{ name: 'matched', at: 'pb', value: 1 }] }],
          all: [{ set: [{ control: 'pb', value: 0 }, { control: 'pl', value: 0 }] }] },
        { set: [{ control: 'wrong', value: 'wrong + 1' }], say: '对不上：金额 / 日期 / 方向有一样不一致' },
      ],
    } },
    { kind: 'button', label: '看凭证', tone: 'ghost', enabled: 'pb > 0 || pl > 0', action: {
      // 优先看日记账那边的凭证；对账单 10（结息）看银行结息单
      set: [{ control: 'view' }],
      ui: [{ name: 'voucher', text: `{{sides[pl > 0 ? 1 : 0].label}} 第 {{pl > 0 ? pl : pb}} 行 · {{vouchers[pl > 0 ? pl : pb].text ?? ${DEFAULT_VOUCHER}}}` }],
      all: [{ when: 'pl == 9 || pb == 9', set: [{ control: 'viewed9' }] }],
    } },
    { kind: 'toast' },
  ],
  panes: [
    { pad: '12px 0 0', blocks: [table('b', '银行对账单（银行给的）', 'pb')] },
    { pad: '12px 0 0', blocks: [table('l', '银行日记账（企业记的）', 'pl')] },
    { pad: '12px 0 0', gap: 10, blocks: [
      { kind: 'note', text: '{{ui.voucher ?? 凭证夹：选一行，点「看凭证」。对不上的要看，对得上的也未必不用看。}}' },
      { kind: 'card', pad: 12, radius: 12, blocks: [
        { kind: 'label', text: '给选中的行打标记' },
        { kind: 'select', control: 'mark', options: MARKS.map((m, i) => ({ v: i, label: m })) },
        { kind: 'button', label: '打标记', tone: 'dark', full: true, mt: 8, enabled: 'mark > 0 && (pb > 0 || pl > 0)', action: {
          set: [{ control: 'apply' }],
          all: [
            // 标记记在哪一行：选了日记账行就记日记账那边，否则记对账单那边
            { first: [{ when: 'pl > 0', ui: [{ name: 'marks_l', at: 'pl', value: 'mark' }] }, { ui: [{ name: 'marks_b', at: 'pb', value: 'mark' }] }] },
            // 对错：结息 = 银收企未收；支票 = 企付银未付；56,000 = 疑点；其余除了「正常」都算误标
            { first: [
              { when: 'pl == 0 && pb == 10 && mark == 1', set: [{ control: 'u1' }] },
              { when: 'pl == 11 && mark == 2', set: [{ control: 'u2' }] },
              { when: '(pl == 9 || (pl == 0 && pb == 9)) && mark == 3', set: [{ control: 'flag' }] },
              { when: 'mark != 4', set: [{ control: 'false_flag', value: 'false_flag + 1' }] },
            ] },
          ],
        } },
      ] },
      { kind: 'card', pad: 12, radius: 12, grow: true, blocks: [
        { kind: 'write', control: 'words', count: 'nonspace', grow: true, label: '底稿结论 · {{words}} 字', placeholder: '未达账项：\n疑点：\n下一步程序：' },
      ] },
    ] },
  ],
};

export function auditDesktopSpec(image: string): BenchSpec {
  return { ...auditSpec(image), surface: 'desktop', surfaceConfig: AUDIT_DESKTOP };
}
