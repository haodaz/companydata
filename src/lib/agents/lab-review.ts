/**
 * AI 评审 agent（2026-10-12）：代码查不了的规则交给它——docs/lab-playbook.md 规则清单里标「评」的那几条。
 * 平台自己生职人时，生成 agent 生完一个空间先过 lab-studio 的硬校验，再过这一关；分数低的留草稿给人看。
 * 只看文字（章节、步骤、工位定义），不看图。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { slotMinutes } from '@/lib/lab-studio';

export const REVIEW_RULES = [
  { id: 'D2', label: '前后接得上', ask: '后面的章节有没有接住前面发生的事（上午的客诉傍晚复盘时提到）；各章是不是互不相干的几道题' },
  { id: 'D4', label: '有一线动手的活', ask: '指挥 / 办公 / 管理类职业，一天里有没有至少一章是到一线真动手（不是只在屏幕前下指令、选方案）；本来就是动手类职业的直接给 5 分' },
  { id: 'B4', label: '交互故事不是滑块', ask: '虚拟工位是不是这个行业自己的交互故事（手上真做的动作、真看的读数、中途出事逼出取舍），还是千篇一律的「几个滑块调到绿区」' },
  { id: 'R1', label: '红线是真实事故', ask: '工位里的违规规则（severity=violation）是不是这一行真会出的事故 / 真会被处分的错，而不是编出来凑数的' },
  { id: 'R2', label: '有中途突发', ask: '工位里有没有「第 N 分钟出事」的突发，逼人取舍；没有就是一路调参到底' },
] as const;

export interface ReviewItem { rule: string; label: string; score: number; reason: string; fix?: string }
export interface Review { items: ReviewItem[]; worst: number; summary: string }

const chapterText = (c: any) => {
  const steps = (c.sim?.steps || []).map((s: any, i: number) => {
    if (s.type === 'bench') {
      const b = s.bench || {};
      return `  ${i + 1}.【虚拟工位】${b.name || ''}：${b.brief || ''}\n     控件：${(b.controls || []).map((x: any) => x.label).join('、')}\n     规则：${(b.rules || []).map((r: any) => `${r.severity === 'violation' ? '违规' : '提醒'}·${r.label}`).join('；')}\n     目标：${(b.goals || []).map((g: any) => g.label).join('；')}${b.surface ? `\n     专属台面：${b.surface}` : ''}`;
    }
    return `  ${i + 1}.【${s.type}】${s.scene?.who ? `${s.scene.who}：${String(s.scene.text || '').slice(0, 80)} ` : ''}${s.prompt || ''}`;
  }).join('\n');
  return `【${c.slot || '?'}】${c.title}（${c.kind}）${c.brief ? `\n  ${c.brief}` : ''}\n${steps}`;
};

export async function reviewDay(space: { title: string; profession?: string }, list: any[], modelId = 'gemini-3.8-flash'): Promise<Review> {
  // 按时段排（体验端时间轴就是这么排的），不按 seq——seq 是生成先后，按它喂进去评审会以为一天顺序乱了
  const chapters = [...list].sort((a, b) => (slotMinutes(a.slot) ?? 9999) - (slotMinutes(b.slot) ?? 9999) || a.seq - b.seq);
  const prompt = `你是「AI 百业」的内容评审。一个职业空间 = 一位数字职人的一整天，按时段分章，每章若干步，其中虚拟工位是真动手的操作台。
按下面每条规则给这一天打分（1–5，5 = 完全做到，3 = 勉强，1 = 完全没做到），理由一句话、要具体到哪一章；分数 ≤ 3 时给一句怎么改。

规则：
${REVIEW_RULES.map(r => `- ${r.id} ${r.label}：${r.ask}`).join('\n')}

空间：${space.title}${space.profession ? `（${space.profession}）` : ''}
${chapters.map(chapterText).join('\n\n')}

返回 JSON：{ "items": [ { "rule": "D2", "score": 1-5, "reason": "", "fix": "" } ], "summary": "一句话总评" }`;
  const r = await generateContent(prompt, modelId, { jsonMode: true });
  await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Review · Day', institution: '', model_id: modelId, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const p = parseJsonLoose(r.text) || {};
  const items: ReviewItem[] = REVIEW_RULES.map(rule => {
    const x = (p.items || []).find((i: any) => i?.rule === rule.id) || {};
    return { rule: rule.id, label: rule.label, score: Math.max(1, Math.min(5, Number(x.score) || 3)), reason: String(x.reason || ''), fix: x.fix ? String(x.fix) : undefined };
  });
  return { items, worst: Math.min(...items.map(i => i.score)), summary: String(p.summary || '') };
}
