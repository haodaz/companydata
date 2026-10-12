/**
 * 母版 hands 的样板：试玩页 /lab/beta/bench/<key> 的入口（SAMPLES），和搬库脚本 scripts/lab-to-master.mts 的清单（TO_MASTER：旧台面名 → 配置）。
 *   restore / soothe              代码版（surfaces/Restore.tsx、Soothe.tsx）
 *   restore-hands / soothe-hands  母版 E 纯配置版（lab-restore-hands.ts、lab-soothe-hands.ts）
 *   latte-heart / latte-tulip / latte-rosetta              拉花代码版（种子规格 + surface: 'latte'，和库里一样）
 *   latte-heart-hands / latte-tulip-hands / latte-rosetta-hands  母版 E 纯配置版（lab-latte-hands.ts，配置从工位自己的场景层现算）
 * 两个代码台面都自己画满整屏背景，底图只在沉浸模式（?hud=1）的虚化背景里看得到；用的是库里那两章的底图。
 *
 * TO_MASTER：旧台面名 → 配置，或者 (库里那台工位) => 配置。拉花一个 surface（'latte'）对应三台不同的工位（轨迹、教练提示、有没有蒸汽棒都不一样），
 * 所以是函数：拿库里那台的规格现算（latteHandsConfig）。搬库脚本见到函数就调用它：cfg = typeof v === 'function' ? v(oldBench) : v。
 * 拉花搬的时候还要把 scene.layers 清空（不然 BenchRunner 会按 pour 层再挂一个自己的摄像头 / 落点），MIGRATE_BENCH.latte 就是整台搬（toLatteHands）。
 */
import type { BenchSpec } from '@/lib/bench';
import { restoreSpec } from '@/lib/lab-restore-spec';
import { sootheSpec } from '@/lib/lab-yuesao-spec';
import { RESTORE_HANDS, restoreHandsSpec } from '@/lib/lab-restore-hands';
import { SOOTHE_HANDS, sootheHandsSpec } from '@/lib/lab-soothe-hands';
import type { HandsConfig } from '@/lib/masters/hands';
import { LATTE_BENCHES, latteCodeSpec, latteHandsConfig, toLatteHands } from '@/lib/lab-latte-hands';

const ART = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/';
const RESTORE_IMG = `${ART}mv38sqq1gqw5-bench.jpg`, SOOTHE_IMG = `${ART}19fd15d1-bench-baby-mv2o4xv1.jpg`;

export const SAMPLES: Record<string, () => BenchSpec> = {
  restore: () => restoreSpec(RESTORE_IMG),
  'restore-hands': () => restoreHandsSpec(RESTORE_IMG),
  soothe: () => sootheSpec(SOOTHE_IMG),
  'soothe-hands': () => sootheHandsSpec(SOOTHE_IMG),
  ...Object.fromEntries(Object.entries(LATTE_BENCHES).flatMap(([k, b]) => [
    [`latte-${k}`, () => latteCodeSpec(b)],
    [`latte-${k}-hands`, () => toLatteHands(latteCodeSpec(b))],
  ])),
};
export const TO_MASTER: Record<string, HandsConfig | ((bench: BenchSpec) => HandsConfig)> = { restore: RESTORE_HANDS, soothe: SOOTHE_HANDS, latte: latteHandsConfig };
/** 需要连规格一起改的（拉花：清掉场景层）：旧台面名 → (库里那台) => 新的整台规格；没登记的就是 { ...old, surface: cfg.master, surfaceConfig: cfg } */
export const MIGRATE_BENCH: Record<string, (bench: BenchSpec) => BenchSpec> = { latte: toLatteHands };
