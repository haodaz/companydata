/**
 * 审计师的交互故事（2026-10-11）：对一笔对不上的账——银行对账单 × 公司银行日记账 × 原始凭证。
 *   八笔正常勾对；两笔未达账项（银行已收利息 1,250，企业未收；企业已付支票 38,000，银行未兑付）要分清类型；
 *   一笔 56,000「备用金」两边都有、金额也对——但点开凭证是一张手写收据、收款方是个人账户：这才是要标疑点、扩大测试的那笔。
 *   勾错、把疑点当未达、没看凭证就下结论、把正常的标成疑点，都记。
 * 台面组件：src/components/lab/surfaces/Audit.tsx（HTML，浅色整屏，像审计底稿工具）。
 */
import type { BenchSpec, BenchAction } from '@/lib/bench';

export interface Line { id: number; date: string; memo: string; amt: number; dir: '收' | '付' }
export const BANK: Line[] = [
  { id: 1, date: '12/02', memo: '收 华远商贸 货款', amt: 128000, dir: '收' }, { id: 2, date: '12/05', memo: '付 房租 12 月', amt: 42000, dir: '付' },
  { id: 3, date: '12/09', memo: '收 恒立科技 货款', amt: 86500, dir: '收' }, { id: 4, date: '12/12', memo: '付 工资', amt: 213400, dir: '付' },
  { id: 5, date: '12/15', memo: '付 社保公积金', amt: 68900, dir: '付' }, { id: 6, date: '12/19', memo: '收 南方建材 货款', amt: 54000, dir: '收' },
  { id: 7, date: '12/22', memo: '付 税款', amt: 31250, dir: '付' }, { id: 8, date: '12/26', memo: '付 供应商 德邦 货款', amt: 97600, dir: '付' },
  { id: 9, date: '12/28', memo: '付 备用金 · 收款方：王某某（个人）', amt: 56000, dir: '付' }, { id: 10, date: '12/31', memo: '结息', amt: 1250, dir: '收' },
];
export const LEDGER: Line[] = [
  { id: 1, date: '12/02', memo: '收 华远商贸 货款', amt: 128000, dir: '收' }, { id: 2, date: '12/05', memo: '付 房租', amt: 42000, dir: '付' },
  { id: 3, date: '12/09', memo: '收 恒立科技 货款', amt: 86500, dir: '收' }, { id: 4, date: '12/12', memo: '付 12 月工资', amt: 213400, dir: '付' },
  { id: 5, date: '12/15', memo: '付 社保公积金', amt: 68900, dir: '付' }, { id: 6, date: '12/19', memo: '收 南方建材 货款', amt: 54000, dir: '收' },
  { id: 7, date: '12/22', memo: '付 增值税及附加', amt: 31250, dir: '付' }, { id: 8, date: '12/26', memo: '付 德邦 货款', amt: 97600, dir: '付' },
  { id: 9, date: '12/28', memo: '付 备用金（采购部）', amt: 56000, dir: '付' }, { id: 11, date: '12/30', memo: '付 支票 #0427 设备维修费', amt: 38000, dir: '付' },
];
/** 凭证夹：点开才知道 */
export const VOUCHERS: Record<number, string> = {
  9: '凭证 #1228-07：手写收据一张「今收到备用金 56,000 元」，签名王某某，无发票、无采购申请单、无验收单；审批栏只有采购部经理一人签字（公司规定 5 万以上需总经理审批）。',
  11: '凭证 #1230-03：支票存根 #0427，38,000 元，收款人「鑫达设备维修」，附维修合同和验收单；支票 12/30 开出，银行对账单截止 12/31 未见兑付——未达账项（企业已付、银行未付）。',
  10: '银行结息单：12/31 结息 1,250 元，企业尚未入账——未达账项（银行已收、企业未收）。',
  8: '凭证 #1226-11：德邦货款 97,600 元，附发票、入库单、付款申请，三单一致。',
};
export const MARKS = ['（选标记）', '未达：银行已收、企业未收', '未达：企业已付、银行未付', '疑点：需扩大测试 / 询问管理层', '正常'];

function expertScript(): BenchAction[] {
  const a: BenchAction[] = [];
  const push = (t: number, control: string, value: number) => a.push({ t, control, value });
  let t = 2;
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) { push(t, 'pb', id); push(t + 1, 'pl', id); push(t + 2, 'match', 1); push(t + 2, 'matched', id); t += 3; }
  push(t, 'pb', 10); push(t + 1, 'view', 1); push(t + 2, 'mark', 1); push(t + 3, 'apply', 1); push(t + 3, 'u1', 1); t += 5;
  push(t, 'pl', 11); push(t + 1, 'view', 1); push(t + 2, 'mark', 2); push(t + 3, 'apply', 1); push(t + 3, 'u2', 1); t += 5;
  push(t, 'pb', 9); push(t + 1, 'pl', 9); push(t + 2, 'view', 1); push(t + 2, 'viewed9', 1); push(t + 4, 'mark', 3); push(t + 5, 'apply', 1); push(t + 5, 'flag', 1); t += 7;
  push(t, 'words', 120);
  return a;
}

export function auditSpec(image: string): BenchSpec {
  return {
    name: '审计底稿 · 银行存款：12 月对账', surface: 'audit',
    brief: '年审现场。拿到被审单位 12 月的银行对账单和银行日记账：先逐笔勾对，对不上的分清是「未达账项」还是「疑点」；金额对得上的不等于没问题——凭证夹里那张手写收据才是今天的发现。勾错、不看凭证就下结论、把正常的标成疑点，都会记进底稿。',
    timeScale: 1, maxSeconds: 600,
    scene: { image, credit: '底图由通义万相生成', layers: [] },
    vars: [
      { id: 'n_matched', label: '勾对笔数', initial: 0, set: 'matched > 0 && matched != last_m ? n_matched + 1 : n_matched' },
      { id: 'last_m', initial: 0, set: 'matched' },
      { id: 'quality', label: '底稿质量', initial: 0, min: 0, max: 100, set: 'clamp(n_matched * 5 + u1 * 12 + u2 * 12 + (flag == 1 && viewed9 == 1 ? 26 : 0) + (words >= 60 ? 10 : 0) - wrong * 8 - false_flag * 12 - (flag == 1 && viewed9 == 0 ? 15 : 0), 0, 100)' },
    ],
    controls: [
      { id: 'pb', label: '选中对账单行', kind: 'knob', min: 0, max: 11, step: 1, initial: 0 },
      { id: 'pl', label: '选中日记账行', kind: 'knob', min: 0, max: 11, step: 1, initial: 0 },
      { id: 'match', label: '勾对', kind: 'button' },
      { id: 'view', label: '看凭证', kind: 'button' },
      { id: 'mark', label: '标记类型', kind: 'knob', min: 0, max: 4, step: 1, initial: 0, hint: '1 银收企未收 · 2 企付银未付 · 3 疑点 · 4 正常' },
      { id: 'apply', label: '打标记', kind: 'button' },
      { id: 'matched', label: '最近勾对的行', kind: 'knob', min: 0, max: 11, hidden: true, initial: 0 },
      { id: 'wrong', label: '勾错次数', kind: 'knob', min: 0, max: 20, hidden: true, initial: 0 },
      { id: 'u1', label: '利息未达标对了', kind: 'switch', hidden: true }, { id: 'u2', label: '支票未达标对了', kind: 'switch', hidden: true },
      { id: 'flag', label: '56,000 标了疑点', kind: 'switch', hidden: true }, { id: 'viewed9', label: '看过 56,000 的凭证', kind: 'switch', hidden: true },
      { id: 'false_flag', label: '把正常的标成疑点 / 未达', kind: 'knob', min: 0, max: 20, hidden: true, initial: 0 },
      { id: 'words', label: '底稿字数', kind: 'knob', min: 0, max: 3000, hidden: true, initial: 0 },
    ],
    gauges: [
      { id: 'g_m', label: '勾对', unit: '笔', expr: 'n_matched', min: 0, max: 8 },
      { id: 'g_w', label: '勾错', unit: '次', expr: 'wrong', min: 0, max: 10, warn: 'wrong > 1' },
      { id: 'g_f', label: '误标', unit: '次', expr: 'false_flag', min: 0, max: 10, warn: 'false_flag > 0' },
      { id: 'g_q', label: '底稿质量', unit: '分', expr: 'quality', min: 0, max: 100 },
    ],
    rules: [
      { id: 'wrong', label: '勾错了（金额或日期对不上，别硬凑）', when: 'wrong > 0', severity: 'warning', once: true },
      { id: 'false_flag', label: '把正常业务标成了未达 / 疑点（三单一致的别碰）', when: 'false_flag > 0', severity: 'warning', once: true },
      { id: 'blind_flag', label: '没看凭证就标疑点（结论要有证据）', when: 'flag == 1 && viewed9 == 0', severity: 'violation', once: true },
      { id: 'miss', label: '56,000 只勾对就放过了：金额对得上不等于没问题，看凭证', when: 'n_matched >= 8 && u1 == 1 && u2 == 1 && words > 40 && flag == 0', severity: 'violation', once: true },
    ],
    goals: [
      { id: 'match', label: '逐笔勾对：八笔正常业务对上', when: 'n_matched >= 8' },
      { id: 'u1', label: '12/31 结息 1,250：银行已收、企业未收', when: 'u1 == 1' },
      { id: 'u2', label: '支票 #0427 38,000：企业已付、银行未付', when: 'u2 == 1' },
      { id: 'flag', label: '看过凭证后把 56,000「备用金」标成疑点', when: 'flag == 1 && viewed9 == 1' },
      { id: 'paper', label: '底稿写清楚（≥ 60 字：未达账项、疑点、下一步）', when: 'words >= 60', after: 'flag' },
      { id: 'q', label: '底稿质量 ≥ 70', when: 'quality >= 70 && words >= 60', after: 'paper' },
    ],
    expertScript: expertScript(),
  };
}
