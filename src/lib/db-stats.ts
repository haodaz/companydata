/**
 * 库页面顶部统计卡片：让数据库直接数（count + head，只回一个数字），不再把整张表拉回来自己数。
 * 以前每翻一页都把两万多行岗位（连职责全文）拉一遍，库越大越慢，2026-10-18 和后台批量叠在一起把线上压超时了。
 * 结果按「表 + 口径」缓存 60 秒；统计是全库口径，和列表的筛选 / 翻页无关。
 */
import { supabaseAdmin } from '@/lib/supabase';

type Apply = (q: any) => any;
const cache = new Map<string, { at: number; value: any }>();

/** 并行数一组口径：{ 名字: 加条件的函数 } → { 名字: 数量 } */
export async function countMany(table: string, items: Record<string, Apply>, base: Apply = q => q): Promise<Record<string, number>> {
  const entries = await Promise.all(Object.entries(items).map(async ([k, apply]) => {
    const { count, error } = await apply(base(supabaseAdmin.from(table).select('id', { count: 'exact', head: true })));
    if (error) throw new Error(`统计 ${table}.${k} 失败：${error.message}`);
    return [k, count || 0] as const;
  }));
  return Object.fromEntries(entries);
}

/** 60 秒缓存：同一口径一分钟内不重复数 */
export async function cachedStats<T>(key: string, fn: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}
