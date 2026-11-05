/**
 * 「来源」多选（数据部门 10-16：企业库、岗位库的来源从单选改多选，迁移 031 把列改成 TEXT[]）。
 * 迁移跑之前库里还是字符串（组合写成「潜历二批，ted」），这里两种都认。
 */
// 龙岗：数据部门 11-04（周赞灵）龙岗（产学研转化）名单 160 家，来源存的是「龙岗提供-0826」，按包含「龙岗」筛
export const SOURCE_ORDER = ['潜历一批', '潜历二批', 'ted', '龙岗'];

export function toSources(v: unknown): string[] {
  const parts = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s*[，,、|；;]\s*/) : [];
  const set = [...new Set(parts.map(x => String(x || '').trim()).filter(Boolean))];
  return set.sort((a, b) => (SOURCE_ORDER.indexOf(a) + 1 || 99) - (SOURCE_ORDER.indexOf(b) + 1 || 99));
}

/** 显示 / 导出 / 写库：多个来源用中文「；」连（数据部门 10-23 #38：来源是文本，示例「潜历一批；潜历二批」） */
export const sourcesText = (v: unknown) => toSources(v).join('；');
/** 写库用：空的写 null */
export const sourcesValue = (v: unknown) => sourcesText(v) || null;
