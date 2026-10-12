/**
 * 母版 B 现场 / C 分屏的样板：试玩页 /lab/beta/bench/<key> 的入口（代码版 key ↔ 母版版 key-field / key-console 成对），
 * 回归检查 scripts/lab-masters-check.mts 也从这里收。
 */
import type { BenchSpec } from '@/lib/bench';
import { switchingSpec } from '@/lib/lab-switching-spec';
import { switchingFieldSpec } from '@/lib/lab-switching-field';
import { repairSpec } from '@/lib/lab-repair-spec';
import { repairFieldSpec } from '@/lib/lab-repair-field';
import { converterSpec } from '@/lib/lab-converter-spec';
import { converterConsoleSpec } from '@/lib/lab-converter-console';
import { gardenSpec } from '@/lib/lab-garden-spec';
import { gardenFieldSpec } from '@/lib/lab-garden-field';
import { chefSpec } from '@/lib/lab-chef-spec';
import { chefFieldSpec } from '@/lib/lab-chef-field';

const ART = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/';
export const SAMPLES: Record<string, () => BenchSpec> = {
  switching: () => switchingSpec(`${ART}surface-switching.jpg`),
  'switching-field': () => switchingFieldSpec(`${ART}surface-switching.jpg`),
  repair: () => repairSpec(''),
  'repair-field': () => repairFieldSpec(''),
  converter: () => converterSpec(`${ART}surface-converter.jpg`),
  'converter-console': () => converterConsoleSpec(`${ART}surface-converter.jpg`),
  garden: () => gardenSpec(''),
  'garden-field': () => gardenFieldSpec(''),
  chef: () => chefSpec(''),
  'chef-field': () => chefFieldSpec(''),
};
