/**
 * 母版 hands 的样板：试玩页 /lab/beta/bench/<key> 的入口（SAMPLES），和搬库脚本 scripts/lab-to-master.mts 的清单（TO_MASTER：旧台面名 → 配置）。
 */
import type { BenchSpec } from '@/lib/bench';

export const SAMPLES: Record<string, () => BenchSpec> = {};
export const TO_MASTER: Record<string, any> = {};
