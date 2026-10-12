/**
 * 母版 desktop 的样板：试玩页 /lab/beta/bench/<key> 的入口（SAMPLES），和搬库脚本 scripts/lab-to-master.mts 的清单（TO_MASTER：旧台面名 → 配置）。
 *   audit / triage           代码版（surfaces/Audit.tsx、Triage.tsx）
 *   audit-desktop / triage-desktop  母版 A 纯配置版（HTML 整屏，加 ?hud=1 看沉浸版面）
 * 两个代码台面都不读底图（浅色整屏），image 给空。
 */
import type { BenchSpec } from '@/lib/bench';
import { auditSpec } from '@/lib/lab-audit-spec';
import { triageSpec } from '@/lib/lab-triage-spec';
import { AUDIT_DESKTOP, auditDesktopSpec } from '@/lib/lab-audit-desktop';
import { TRIAGE_DESKTOP, triageDesktopSpec } from '@/lib/lab-triage-desktop';

export const SAMPLES: Record<string, () => BenchSpec> = {
  audit: () => auditSpec(''),
  'audit-desktop': () => auditDesktopSpec(''),
  triage: () => triageSpec(''),
  'triage-desktop': () => triageDesktopSpec(''),
};
export const TO_MASTER: Record<string, any> = { audit: AUDIT_DESKTOP, triage: TRIAGE_DESKTOP };
