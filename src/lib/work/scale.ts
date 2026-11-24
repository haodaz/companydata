/**
 * 真活打分方式（11-10 用户）：平台级配置，管理员在「全站管理 → 评分方式」给整个平台选一种，出任务时不涉及。
 * 底座三层（回答质量 / 作答过程 / AI 使用）不管选哪种都照常算、照常存；这里只决定报告、成绩单和排序用哪部分，切回来都在。
 */
export type ScaleId = 'full' | 'ai_use' | 'fluency';
export const DEFAULT_SCALE: ScaleId = 'full';
export const SCALES: { id: ScaleId; name: string; desc: string }[] = [
  { id: 'full', name: '全看', desc: '回答质量 + 作答过程 + AI 使用与交互。排名看回答质量总分，AI 使用单独一项。' },
  { id: 'ai_use', name: 'AI 使用与交互', desc: '报告、成绩单和排名只看 AI 使用：怎么问、怎么核、怎么取舍。回答质量和过程评价不显示；交付物和作答历程照常能看。' },
  { id: 'fluency', name: 'AI 驾驭能力（7 维度 · 潜历量表）', desc: '潜历定的 7 维度、25 个可观察行为：按和 AI 的对话原话逐条取证、按锚点定 1–5 档，出总分、段位和 7 维画像。只评站内 AI 助手的对话；回答质量和过程评价不显示。选它之后新交的卷才会算这一项。' },
];
/** 只看 AI 那一类（不显示回答质量、过程评价、AI 基线） */
export const aiOnly = (scale: ScaleId | null | undefined) => scale === 'ai_use' || scale === 'fluency';
export const asScale = (v: unknown): ScaleId => (v === 'ai_use' || v === 'fluency' ? v : DEFAULT_SCALE);
/** 这个人用来显示和排序的分。AI 模式下没用 AI、或看不到 AI 使用情况的是 null，不是 0 */
export const mainScore = (s: { score?: number | null; report?: any }, scale: ScaleId | null): number | null => (scale === 'ai_use' ? s.report?.ai_use?.score ?? null : scale === 'fluency' ? s.report?.fluency?.score100 ?? null : s.score ?? null);
/** AI 使用分是空的两种情况：确实没用，或者截图读不出来这一项不评 */
export const noAiLabel = (u: any, L: (zh: string, en: string) => string) => (u?.needs_review ? L('待人工复核', 'Needs human review') : /不评|cannot be assessed/.test(u?.verdict || '') ? L('无法评价', 'Not assessable') : L('没用 AI', 'No AI used'));
