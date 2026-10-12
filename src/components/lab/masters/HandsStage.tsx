'use client';

/**
 * 母版 E 第一人称双手：中央主体 + 器械盘 + 手势原语（按住下沉 / 沿线划 / 连拍节奏 / 拖到位 / 刷覆盖 / 按住计时…）+ 主体渲染插件（src/lib/masters/hands.ts 的 HandsConfig）。
 * 挂在 BenchRunner：画在场景 svg 里（1600 × 900）。
 */
import React from 'react';
import type { MasterStageProps } from '@/lib/lab-masters';
import type { HandsConfig } from '@/lib/masters/hands';

export function HandsStage(_props: MasterStageProps<HandsConfig>) {
  return null;
}
