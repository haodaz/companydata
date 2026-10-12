/**
 * 母版 hands 的样板：试玩页 /lab/beta/bench/<key> 的入口（SAMPLES），和搬库脚本 scripts/lab-to-master.mts 的清单（TO_MASTER：旧台面名 → 配置）。
 *   restore / soothe              代码版（surfaces/Restore.tsx、Soothe.tsx）
 *   restore-hands / soothe-hands  母版 E 纯配置版（lab-restore-hands.ts、lab-soothe-hands.ts）
 * 两个代码台面都自己画满整屏背景，底图只在沉浸模式（?hud=1）的虚化背景里看得到；用的是库里那两章的底图。
 */
import type { BenchSpec } from '@/lib/bench';
import { restoreSpec } from '@/lib/lab-restore-spec';
import { sootheSpec } from '@/lib/lab-yuesao-spec';
import { RESTORE_HANDS, restoreHandsSpec } from '@/lib/lab-restore-hands';
import { SOOTHE_HANDS, sootheHandsSpec } from '@/lib/lab-soothe-hands';

const ART = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/';
const RESTORE_IMG = `${ART}mv38sqq1gqw5-bench.jpg`, SOOTHE_IMG = `${ART}19fd15d1-bench-baby-mv2o4xv1.jpg`;

export const SAMPLES: Record<string, () => BenchSpec> = {
  restore: () => restoreSpec(RESTORE_IMG),
  'restore-hands': () => restoreHandsSpec(RESTORE_IMG),
  soothe: () => sootheSpec(SOOTHE_IMG),
  'soothe-hands': () => sootheHandsSpec(SOOTHE_IMG),
};
export const TO_MASTER: Record<string, any> = { restore: RESTORE_HANDS, soothe: SOOTHE_HANDS };
