'use client';

/**
 * 母版 D 沙盘 / 调度：地图或俯视 / 侧视场景 + 地点 + 单位 / 个体 + 调度动作 + 按时间推送的事件（src/lib/masters/dispatch.ts 的 DispatchConfig）。
 * 挂在 BenchRunner：画在场景 svg 里（1600 × 900）。
 */
import React from 'react';
import type { MasterStageProps } from '@/lib/lab-masters';
import type { DispatchConfig } from '@/lib/masters/dispatch';

export function DispatchStage(_props: MasterStageProps<DispatchConfig>) {
  return null;
}
