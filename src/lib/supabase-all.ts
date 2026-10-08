/**
 * 读全量。
 *
 * Supabase（PostgREST）每次请求最多返回 1000 行，写 .limit(50000) 不会报错，只会悄悄截在 1000。
 * 企业过了 1000 家之后，实体库的统计、画像健康看板、粘贴导入时的同名去重、画像任务里的企业列表
 * 全都只看到了前 1000 行（2026-10-08 数据部门反馈：任务里加了企业却显示为空）。
 *
 * 用法：传一个「每次都新建查询」的函数，别传建好的查询对象——这里要反复加 .range() 翻页。
 *   const { data, error } = await selectAll(() => supabaseAdmin.from('companies').select('id, name').order('id'));
 * 一定要带一个能稳定排序的 order（最好是 id），不然翻页时行会重复或漏掉。
 */
export async function selectAll<T = any>(build: () => any, pageSize = 1000, hardCap = 500_000): Promise<{ data: T[]; error: any }> {
  const out: T[] = [];
  for (let from = 0; from < hardCap; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: out, error };
    if (data?.length) out.push(...data);
    if (!data || data.length < pageSize) break;
  }
  return { data: out, error: null };
}
