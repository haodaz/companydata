/**
 * 母版 F 对人应对：聊天线程 + 话术按钮 + 方案 + 工单；NPC 的情绪量表（怒气 / 信任）；可单用或嵌进桌面。
 * 要搬的旧台面：客服 complaint、直播中控 live。由 lab-masters.ts 的注册表汇总（不要改那里的注册行，只填这个文件）。
 * 约定见 lab-masters.ts 文件头：表达式都走 evalExpr；判分只看规格里的 vars / rules / goals，母版只管画什么、点了拨哪个控件、说什么。
 */
import type { MasterDef } from '@/lib/lab-masters';

export interface DialogConfig {
  master: 'dialog';
  // TODO：这个母版的配置字段
  [key: string]: any;
}

export const DIALOG_DEF: MasterDef<DialogConfig> = {
  name: 'dialog', host: 'html',
  /** 配置里所有表达式（存库前逐个求值，求不了就拒收） */
  exprs: () => [],
  /** 配置里会拨到的控件 id（都得在规格的 controls 里声明过；带模板的 id 展开成具体的再返回） */
  controls: () => [],
};
