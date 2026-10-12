/**
 * 母版 D 沙盘 / 调度：地图或俯视 / 侧视场景 + 地点 + 单位 / 个体 + 调度动作 + 按时间推送的事件。
 * 要搬的旧台面：幼儿园 kinder、潜导 dive。由 lab-masters.ts 的注册表汇总（不要改那里的注册行，只填这个文件）。
 * 约定见 lab-masters.ts 文件头：表达式都走 evalExpr；判分只看规格里的 vars / rules / goals，母版只管画什么、点了拨哪个控件、说什么。
 */
import type { MasterDef } from '@/lib/lab-masters';

export interface DispatchConfig {
  master: 'dispatch';
  // TODO：这个母版的配置字段
  [key: string]: any;
}

export const DISPATCH_DEF: MasterDef<DispatchConfig> = {
  name: 'dispatch', host: 'svg',
  /** 配置里所有表达式（存库前逐个求值，求不了就拒收） */
  exprs: () => [],
  /** 配置里会拨到的控件 id（都得在规格的 controls 里声明过；带模板的 id 展开成具体的再返回） */
  controls: () => [],
};
