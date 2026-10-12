'use client';

/**
 * 母版 F 对人应对：聊天线程 + 话术按钮 + 方案 + 工单；NPC 的情绪量表（怒气 / 信任）；可单用或嵌进桌面（src/lib/masters/dialog.ts 的 DialogConfig）。
 * 挂在 BenchRunner：HTML 整屏（沉浸模式走浅色 LIGHT 版面，非沉浸盖在场景 svg 上）。
 */
import React from 'react';
import type { MasterStageProps } from '@/lib/lab-masters';
import type { DialogConfig } from '@/lib/masters/dialog';

export function DialogStage(_props: MasterStageProps<DialogConfig>) {
  return null;
}
