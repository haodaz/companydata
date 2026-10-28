/**
 * 「做一道真活」的唯一入口（2026-10-24）。AI 基线（generator.runBaseline）和百业学院的学员考核（college-train.runWorkExam）都调它——
 * 真活这边加了分步推进、换了操作台、改了提示，学院自动跟着，不会一个进步了另一个落下。评卷同理只走 grader.gradeResult。
 * 想在提示里加东西（学员的笔记规则、身份口吻），走 opts，别另拼一份提示。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { STAGE_LABEL } from '@/lib/work/samples';
import type { WorkTask } from '@/lib/work/generator';

export interface SolveOpts {
  /** 答题者是谁：默认「应聘这个岗位的候选人」；学院传学员编号 */
  persona?: string;
  /** 额外要照着做的规则（学院笔记本里的工作规则） */
  rules?: string[];
  /** 字数要求 */
  words?: string;
  /** 记账 */
  task_name?: string; institution?: string; actor?: string | null;
}

/** 操作台说明：按台子不同告诉模型交付物长什么样 */
export function envNote(task: WorkTask): string {
  const e = task.env || ({ type: 'doc' } as any);
  if (e.type === 'code') return `这是代码台（${e.language || 'js'}）：先给完整代码（用 \`\`\` 包起来，导出名为 solution 的函数），再写说明。${e.starter ? `起始代码：\n${e.starter}` : ''}${e.tests?.length ? `\n自测用例：${e.tests.map((t: any) => t.name).join('、')}` : ''}`;
  if (e.type === 'sheet') return `这是表格 / 数据台：交付物里先给处理后的表（CSV 或 Markdown 表），再写口径说明。起始表：\n${e.csv || ''}`;
  if (e.type === 'design') return `这是设计台：先给参数表（${(e.params || []).map((p: any) => p.name + (p.unit ? '/' + p.unit : '')).join('、')}），每个参数给值和依据；再用文字描述草图（${e.sketch_hint || ''}）；最后设计说明。`;
  return '这是文档 / 对账台：按交付物逐个写，Markdown。';
}

/** 分步推进的题：把每一步的问题和当步给的信息都放进提示，要求按步作答 */
export function stagesNote(task: WorkTask): string {
  const st = task.task?.stages || [];
  if (!st.length) return '';
  return `\n## 推进步骤（按顺序一步一步答，每步用「## q1」这样的标题；测算写出算式）\n${st.map(s => `### ${s.id}【${STAGE_LABEL[s.type] || s.type}】${s.question}\n这一步给的信息：\n${s.reveal}`).join('\n\n')}`;
}

export function buildSolvePrompt(task: WorkTask, opts: SolveOpts = {}): string {
  const who = opts.persona || `应聘「${task.task.role}」的候选人`;
  return `你是${who}，现在做这道真活。只能用下面的材料；材料里没有的数据要明确标注假设。总共 ${opts.words || '1200–2500 字'}。
${envNote(task)}
${opts.rules?.length ? `## 你总结过的工作规则（照着做）\n${opts.rules.map(r => `- ${r}`).join('\n')}\n` : ''}## 任务书
${task.task.brief}
## 交付物
${(task.task.deliverables || []).map(d => `- ${d.id} ${d.title}（${d.format}）`).join('\n')}
## 材料
${(task.materials || []).map(m => `### ${m.id} ${m.title}\n${m.content}`).join('\n\n')}${stagesNote(task)}`;
}

/** 用指定模型做一遍；返回交付物文本（不评分，评分走 grader.gradeResult） */
export async function solveWorkTask(task: WorkTask, model: string, opts: SolveOpts = {}): Promise<{ answer: string; model: string }> {
  const prompt = buildSolvePrompt(task, opts);
  // 指定模型不可用（欠费 / 限流）就退到 Sonnet，基线和学员做题都不能空着
  let res: any, used = model;
  try { res = await generateContent(prompt, model); }
  catch (e) { if (model === 'qwen-plus') throw e; console.warn(`[work-solve] ${model} 失败，千问 Plus 兜底：${String((e as any)?.message).slice(0, 100)}`); used = 'qwen-plus'; res = await generateContent(prompt, used); }
  await logTokenUsage({ tool_name: 'work', task_name: opts.task_name || 'Solve · 做一遍', institution: opts.institution || '', model_id: used, usageMetadata: res.usageMetadata, actor: opts.actor } as any).catch(() => {});
  return { answer: res.text.trim(), model: used };
}
