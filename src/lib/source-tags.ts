/**
 * 「来源」多选（数据部门 10-16：企业库、岗位库的来源从单选改多选，迁移 031 把列改成 TEXT[]）。
 * 迁移跑之前库里还是字符串（组合写成「潜历二批，ted」），这里两种都认。
 */
export const SOURCE_ORDER = ['潜历一批', '潜历二批', 'ted'];

export function toSources(v: unknown): string[] {
  const parts = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s*[，,、|]\s*/) : [];
  const set = [...new Set(parts.map(x => String(x || '').trim()).filter(Boolean))];
  return set.sort((a, b) => (SOURCE_ORDER.indexOf(a) + 1 || 99) - (SOURCE_ORDER.indexOf(b) + 1 || 99));
}

/** 显示 / 导出用：多个来源用「|」连（和订阅平台等多选字段一致） */
export const sourcesText = (v: unknown) => toSources(v).join('|');
