/**
 * 母版 dialog 的样板：试玩页 /lab/beta/bench/<key> 的入口（SAMPLES），和搬库脚本 scripts/lab-to-master.mts 的清单（TO_MASTER：旧台面名 → 配置）。
 *   complaint / live              代码版（surfaces/Complaint.tsx、Live.tsx）
 *   complaint-dialog / live-dialog 母版 F 纯配置版（lab-complaint-dialog.ts、lab-live-dialog.ts）
 * 这两台是 HTML 整屏，没有专门的底图（沉浸模式走浅色版面，不显示底图），所以 image 给空。
 */
import type { BenchSpec } from '@/lib/bench';
import type { DialogConfig } from '@/lib/masters/dialog';
import { complaintSpec } from '@/lib/lab-complaint-spec';
import { liveSpec } from '@/lib/lab-live-spec';
import { COMPLAINT_DIALOG, complaintDialogSpec } from '@/lib/lab-complaint-dialog';
import { LIVE_DIALOG, liveDialogSpec } from '@/lib/lab-live-dialog';

export const SAMPLES: Record<string, () => BenchSpec> = {
  complaint: () => complaintSpec(''),
  'complaint-dialog': () => complaintDialogSpec(''),
  live: () => liveSpec(''),
  'live-dialog': () => liveDialogSpec(''),
};
export const TO_MASTER: Record<string, DialogConfig> = { complaint: COMPLAINT_DIALOG, live: LIVE_DIALOG };
