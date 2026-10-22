/**
 * 多值字段（数据部门 10-22 #22：原来「|」隔开的文本改成数组——jobs.fos_ids / related_career_ids / qianli_job_specialty_labels /
 * qianli_specialty_labels_reason / name_to_search）。读的时候两种都认（迁移前后、老脚本），写的时候一律写数组。
 */
export const toList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split('|') : []).map(x => String(x ?? '').trim()).filter(Boolean);

/** 写库用：去重、空数组写 null */
export const listOrNull = (v: unknown): string[] | null => { const a = [...new Set(toList(v))]; return a.length ? a : null; };
