/**
 * PostgREST or() 过滤里逗号 / 括号 / 引号有特殊含义；用户输入的搜索词统一走这里，
 * 生成 `col.ilike."%词%"` 形式，避免搜索词破坏过滤表达式。
 */
export function orIlike(columns: string[], search: string): string {
  const term = search.trim().replace(/[\\%_]/g, m => `\\${m}`).replace(/"/g, '\\"');
  return columns.map(c => `${c}.ilike."%${term}%"`).join(',');
}

export function pageParams(searchParams: URLSearchParams, defaultSize = 50, maxSize = 1000) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(searchParams.get('pageSize') || String(defaultSize)) || defaultSize));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}
