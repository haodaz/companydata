/**
 * 完整度筛选 / 排序（数据部门周赞灵 10-26：岗位库、企业库的完整度要能筛、能排）。
 * 分档和列表里进度条的颜色一致：低（< 40，红）/ 中（40–69，黄）/ 高（≥ 70，绿）/ 没算过（空）。
 */
export const COMPLETENESS_BUCKETS = [
  { value: 'high', label: '完整度 ≥ 70' },
  { value: 'mid', label: '完整度 40–69' },
  { value: 'low', label: '完整度 < 40' },
  { value: 'none', label: '完整度未算' },
];

/** 按分档筛（supabase 查询构造器） */
export function filterCompleteness<Q extends { gte: any; lt: any; is: any }>(q: Q, comp: string): Q {
  if (comp === 'high') return q.gte('completeness_score', 70);
  if (comp === 'mid') return q.gte('completeness_score', 40).lt('completeness_score', 70);
  if (comp === 'low') return q.lt('completeness_score', 40);
  if (comp === 'none') return q.is('completeness_score', null);
  return q;
}

/** sort=comp_desc / comp_asc：完整度排在最前面（空值放最后），其余排序照旧跟在后面 */
export const completenessOrder = (sort: string) =>
  sort === 'comp_desc' || sort === 'comp_asc' ? { column: 'completeness_score', ascending: sort === 'comp_asc', nullsFirst: false } : null;
