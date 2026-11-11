'use client';

import { useEffect, useState } from 'react';
import { asScale, type ScaleId } from '@/lib/work/scale';

let cached: Promise<ScaleId> | null = null;
const load = () => (cached ||= fetch('/api/work/scale', { cache: 'no-store' }).then(r => r.json()).then(j => asScale(j.scale)).catch(() => asScale(null)));
/** 全站管理改完调一下，本页后面读到新的 */
export const forgetWorkScale = () => { cached = null; };
/** null = 还在读。报告和成绩单等读到再画，免得「只看 AI」时先闪一下总分 */
export function useWorkScale(): ScaleId | null {
  const [v, set] = useState<ScaleId | null>(null);
  useEffect(() => { let on = true; load().then(x => { if (on) set(x); }); return () => { on = false; }; }, []);
  return v;
}
