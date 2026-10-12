'use client';

/**
 * 母版 A 桌面工作站（桌边 N 个程序）：顶栏 + 2–3 栏或图标坞 + 窗口；表格 / 卡片名单 / 详情 / 便签 / 选项组 / 下拉 / 按钮 / 写作框（src/lib/masters/desktop.ts 的 DesktopConfig）。
 * 挂在 BenchRunner：HTML 整屏（沉浸模式走浅色 LIGHT 版面，非沉浸盖在场景 svg 上）。
 */
import React from 'react';
import type { MasterStageProps } from '@/lib/lab-masters';
import type { DesktopConfig } from '@/lib/masters/desktop';

export function DesktopStage(_props: MasterStageProps<DesktopConfig>) {
  return null;
}
