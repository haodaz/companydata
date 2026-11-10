'use client';

/**
 * 真活候选人端双语（11-10 用户：多语言先加上英文）：题目语言 task.task.lang = 'en' 时，候选人看到的整套作答界面用英文。
 * 出任务的人那边（管理页、任务空间）仍是中文：没包 <WorkLang> 的地方默认 zh，不受影响。
 * 用法：组件里 `const L = useL();`，文案写成 `L('中文', 'English')`——中英对照写在一处，改文案不会对不上。
 */
import React, { createContext, useContext } from 'react';

export type Lang = 'zh' | 'en';
const Ctx = createContext<Lang>('zh');

export function WorkLang({ lang, children }: { lang: Lang | undefined; children: React.ReactNode }) {
  return <Ctx.Provider value={lang === 'en' ? 'en' : 'zh'}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
/** L('中文', 'English') → 按当前语言取一个 */
export function useL() {
  const lang = useContext(Ctx);
  return (zh: string, en: string) => (lang === 'en' ? en : zh);
}
/** 不在组件里（普通函数）用：传 lang 进来 */
export const pick = (lang: Lang | undefined, zh: string, en: string) => (lang === 'en' ? en : zh);
/** 过程评价的六个维度（grader 里的 SKILL_DIMS，数据里存中文）：英文界面显示英文名 */
const DIM_EN: Record<string, string> = { '问题界定': 'Problem framing', '信息核验': 'Fact-checking', 'AI 协作': 'Working with AI', '判断取舍': 'Judgement & trade-offs', '交付表达': 'Communicating the result', '风险意识': 'Risk awareness' };
export const dimL = (d: string, lang?: Lang) => (lang === 'en' && DIM_EN[d]) || d;
/** AI 使用的五个子项（grader 的 AI_USE_ITEMS，数据里存中文标题）：英文界面按 key 显示英文 */
const AI_USE_EN: Record<string, string> = { ask: 'Asking', verify: 'Verifying', select: 'Choosing', divide: 'Dividing the work', integrate: 'Integrating' };
export const aiItemL = (key: string, title: string, lang?: Lang) => (lang === 'en' && AI_USE_EN[key]) || title;
