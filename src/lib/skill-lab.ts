/** 技能实验室：前后端共用的类型与标签（不依赖服务端模块） */

export interface SkillCard {
  scenarios: string[];
  steps: { title: string; detail: string }[];
  rules: string[];
  good_example: string;
  bad_example: string;
  checklist: string[];
}

/** 空间核心 AI 的档案 */
export interface SpaceProfile { codename: string; tagline: string; capabilities: string[]; can_solve: string[] }

/** 专业度：吸收的专家经验越多越高（规则数 + 访谈轮数），1-5 级 */
export function expertiseLevel(skill?: { card?: SkillCard; interview?: InterviewTurn[] } | null): { level: number; label: string } {
  if (!skill?.card) return { level: 1, label: '只读过 JD，还没向任何专家学过' };
  const rules = skill.card.rules?.length || 0;
  const turns = (skill.interview || []).filter(t => t.role === 'expert').length;
  const level = Math.min(5, 2 + Math.floor((rules + turns) / 5));
  return { level, label: `已吸收 ${turns} 轮专家经验 · ${rules} 条判断规则` };
}

export interface InterviewTurn { role: 'ai' | 'expert'; content: string }

export interface RubricItem { key: string; name: string; weight: number; description: string }

export interface GradingDimension { key: string; score: number; evidence: string; comment: string }

export interface Grading { dimensions: GradingDimension[]; summary: string; gaps: string[]; suggestions: string[] }

export const SKILL_KIND: Record<string, { label: string; color: string }> = {
  hard: { label: '硬技能 · 定量', color: 'geekblue' },
  soft: { label: '软技能 · 判断', color: 'magenta' },
};

export const INVOCATION_KIND: Record<string, { label: string; color: string }> = {
  grade: { label: '评分', color: 'purple' },
  answer: { label: 'AI 作答', color: 'blue' },
  batch: { label: '批量批改', color: 'orange' },
  coach: { label: '辅导', color: 'green' },
  solve: { label: '解决问题', color: 'red' },
};

export function scoreColor(score?: number | null): string {
  if (score === null || score === undefined) return '#8a8fa3';
  return score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
}

export function scoreLevel(score?: number | null): string {
  if (score === null || score === undefined) return '未评分';
  return score >= 85 ? '可直接上手' : score >= 70 ? '基本胜任' : score >= 55 ? '需要带教' : '暂不胜任';
}

/** 技能卡渲染成给大模型的上下文 */
export function skillCardToPrompt(name: string, card: SkillCard): string {
  return [
    `【专家技能：${name}】`,
    card.steps?.length ? `做法：\n${card.steps.map((s, i) => `${i + 1}. ${s.title}——${s.detail}`).join('\n')}` : '',
    card.rules?.length ? `专家的判断规则：\n${card.rules.map(r => `- ${r}`).join('\n')}` : '',
    card.good_example ? `好的样子：${card.good_example}` : '',
    card.bad_example ? `差的样子：${card.bad_example}` : '',
    card.checklist?.length ? `交付前检查：\n${card.checklist.map(c => `- ${c}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

/** UTC 偏移 → 「UTC+8」 */
export const tzLabel = (tz?: number | null) => tz === null || tz === undefined ? '' : `UTC${tz >= 0 ? '+' : ''}${tz}`;
