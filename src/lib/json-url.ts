/** 深度遍历 JSON，把字符串里命中 urlMap 的 URL 换成新的（e.g. 素材换图后改写各处引用） */

export function rewriteUrls(value: any, urlMap: Map<string, string>): any {
  if (typeof value === 'string') return urlMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map(v => rewriteUrls(v, urlMap));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = rewriteUrls(value[k], urlMap);
    return out;
  }
  return value;
}

/** JSON 里（任意层级）是否出现了这个 URL 字符串 */
export function jsonHasUrl(value: any, url: string): boolean {
  if (!value || !url) return false;
  try { return JSON.stringify(value).includes(url); } catch { return false; }
}
