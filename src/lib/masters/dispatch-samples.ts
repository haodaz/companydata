/**
 * 母版 dispatch 的样板：试玩页 /lab/beta/bench/<key> 的入口（SAMPLES），和搬库脚本 scripts/lab-to-master.mts 的清单（TO_MASTER：旧台面名 → 配置）。
 *   kinder / dive 是代码版（surfaces/Kinder.tsx、Dive.tsx），-dispatch 是母版 D 纯配置版，物理和老手脚本同一份。
 *   两个台面库里都没有专门的底图（幼儿园整屏画出来；潜导没图时画一片礁），这里给空串。
 */
import type { BenchSpec } from '@/lib/bench';
import { kinderSpec } from '@/lib/lab-kinder-spec';
import { diveSpec } from '@/lib/lab-dive-spec';
import { KINDER_DISPATCH, kinderDispatchSpec } from '@/lib/lab-kinder-dispatch';
import { DIVE_DISPATCH, diveDispatchSpec } from '@/lib/lab-dive-dispatch';

export const SAMPLES: Record<string, () => BenchSpec> = {
  kinder: () => kinderSpec(''),
  'kinder-dispatch': () => kinderDispatchSpec(''),
  dive: () => diveSpec(''),
  'dive-dispatch': () => diveDispatchSpec(''),
};
export const TO_MASTER: Record<string, any> = { kinder: KINDER_DISPATCH, dive: DIVE_DISPATCH };
