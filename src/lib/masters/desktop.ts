/**
 * 母版 A 桌面工作站（桌边 N 个程序）：顶栏 + 2–3 栏或图标坞 + 窗口；表格 / 卡片名单 / 详情 / 便签 / 选项组 / 下拉 / 按钮 / 写作框。
 * 要搬的旧台面：审计 audit、分诊 triage。由 lab-masters.ts 的注册表汇总（不要改那里的注册行，只填这个文件）。
 * 约定见 lab-masters.ts 文件头：表达式都走 evalExpr；判分只看规格里的 vars / rules / goals，母版只管画什么、点了拨哪个控件、说什么。
 */
import type { MasterDef } from '@/lib/lab-masters';

export interface DesktopConfig {
  master: 'desktop';
  // TODO：这个母版的配置字段
  [key: string]: any;
}

export const DESKTOP_DEF: MasterDef<DesktopConfig> = {
  name: 'desktop', host: 'html',
  /** 配置里所有表达式（存库前逐个求值，求不了就拒收） */
  exprs: () => [],
  /** 配置里会拨到的控件 id（都得在规格的 controls 里声明过；带模板的 id 展开成具体的再返回） */
  controls: () => [],
};
