import { supabaseAdmin as db } from '@/lib/supabase';
import { asScale, DEFAULT_SCALE, type ScaleId } from '@/lib/work/scale';

let memo: { v: ScaleId; at: number } | null = null;
/** 表没建（迁移 072 没跑）或读不到时一律按默认的全看 */
export async function getWorkScale(): Promise<ScaleId> {
  if (memo && Date.now() - memo.at < 15000) return memo.v;
  const { data, error } = await db.from('work_platform_settings').select('value').eq('key', 'scale').maybeSingle();
  const v = error ? DEFAULT_SCALE : asScale(data?.value?.id);
  memo = { v, at: Date.now() };
  return v;
}
export async function workScaleReady() { const { error } = await db.from('work_platform_settings').select('key').limit(1); return !error; }
export async function setWorkScale(id: ScaleId, by: string) {
  const { error } = await db.from('work_platform_settings').upsert({ key: 'scale', value: { id }, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  memo = { v: id, at: Date.now() };
}
