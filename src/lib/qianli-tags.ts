/**
 * 潜历标签的 value → 中文名（页面显示用，前后端都能引；打标逻辑在 qianli-labels.ts，只在服务端）。
 * 标签表来自数据部门《潜历-岗位-职能标签》tag.csv、《潜历-岗位-特色标签》tags.xlsx，见 src/data/qianli-prompts.ts。
 */
import { JOB_FUNCTION_TAGS, SPECIALTY_TAGS } from '@/data/qianli-prompts';

export const QIANLI_FUNCTION_NAMES: Record<string, string> = Object.fromEntries(JOB_FUNCTION_TAGS.map(t => [t.value, t.name]));
export const QIANLI_SPECIALTY_L1_NAMES: Record<string, string> = Object.fromEntries(SPECIALTY_TAGS.map(t => [t.l1_value, t.l1]));
export const QIANLI_SPECIALTY_L2_NAMES: Record<string, string> = Object.fromEntries(SPECIALTY_TAGS.map(t => [t.l2_value, t.l2]));
