/**
 * 百业工厂 · AI 全程跟进（C，2026-11-06）：生成完 / 整体重写完自动评审一遍，问题落到「哪一章哪一步、怎么改」，成待办；
 * 人可以一条一条「按这条改」（走局部改的对比采纳），也可以「一键按评审改」（有问题、没锁定的章按建议重写成草稿，改完再评一遍）。
 * 规则沿用 lab-review 的 REVIEW_RULES，加一条 A1「合受众」：对照空间的生成要求看难度、术语、职业粒度。
 * 评审结果存 lab_revisions（target='review'，迁移 066；没跑就只返回不存）。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent, resolveModel } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { REVIEW_RULES } from '@/lib/agents/lab-review';
import { buildChapter } from '@/lib/agents/lab-chapters';
import { slotMinutes } from '@/lib/lab-studio';
import { hasSpec, specTextOf } from '@/lib/lab-spec';

export type Todo = { id: string; chapter_id: string | null; chapter: string; step_id: string | null; step_no: number | null; target: 'chapter' | 'step' | 'bench' | 'opening'; rule: string; problem: string; fix: string };
export type FullReview = { items: { rule: string; label: string; score: number; reason: string }[]; todos: Todo[]; summary: string; worst: number; at: string; chapters: number };

const A1 = { id: 'A1', label: '合受众', ask: '对照「用户的生成要求」：难度、术语、职业讲到的粒度、工位要求的精细程度，是不是适合要求里写的受众；没写要求就按职业探索（没入行的人能上手）来看' } as const;

const chapterText = (c: any, n: number) => {
  const steps = (c.sim?.steps || []).map((s: any, i: number) => {
    if (s.type === 'bench') { const b = s.bench || {}; return `  ${i + 1}.【虚拟工位】${b.name || ''}：${b.brief || ''}｜规则：${(b.rules || []).map((r: any) => `${r.severity === 'violation' ? '违规' : '提醒'}·${r.label}`).join('；')}｜目标：${(b.goals || []).map((g: any) => g.label).join('；')}`; }
    return `  ${i + 1}.【${s.type}】${s.scene?.who ? `${s.scene.who}：${String(s.scene.text || '').slice(0, 80)} ` : ''}${s.prompt || ''}${s.options?.length ? `（选项：${s.options.map((o: any) => o.label).join(' / ').slice(0, 160)}）` : ''}`;
  }).join('\n');
  return `第${n}章【${c.slot || '?'}】${c.title}（${c.kind}${c.locked ? '，已锁定' : ''}）${c.brief ? `\n  要交代：${c.brief}` : ''}\n  开场：${String(c.sim?.intro || '').slice(0, 160)}\n${steps}`;
};

export async function reviewSpace(spaceId: string, model = 'claude-sonnet-5-5'): Promise<FullReview> {
  const [{ data: space, error }, { data: list }] = await Promise.all([
    db.from('skill_tasks').select('id, title, profile, jd_snapshot').eq('id', spaceId).single(),
    db.from('lab_chapters').select('id, seq, slot, title, kind, brief, sim, locked, status').eq('task_id', spaceId),
  ]);
  if (error) throw error;
  const chapters = [...(list || [])].filter((c: any) => (c.sim?.steps || []).length).sort((a: any, b: any) => (slotMinutes(a.slot) ?? 9999) - (slotMinutes(b.slot) ?? 9999) || a.seq - b.seq);
  if (!chapters.length) throw new Error('还没有写好的章节，先生成再评');
  const jd: any = space.jd_snapshot || {};
  const rules = [...REVIEW_RULES, A1];
  const prompt = `你是「AI 百业」的内容评审。一个职业空间 = 一位数字职人的一整天，按时段分章，每章若干步，虚拟工位是真动手的操作台。
职业：${jd.career?.profession || jd.title || space.title}${jd.company ? `（${jd.company}）` : ''}
${hasSpec(jd.spec) ? specTextOf(jd) : '（没写生成要求：按「职业探索——没入行的人也能上手」来看）'}

${chapters.map((c, i) => chapterText(c, i + 1)).join('\n\n')}

平台规则和用户的生成要求冲突时（比如要求里说「红线只留真会出事故的」「不要求精准」），以用户要求为准：不要为了凑规则提违背要求的修改，对应规则按要求的口径打分。

做两件事：
1. 按规则打分（1–5；5 完全做到，3 勉强，1 没做到），理由一句话、具体到哪一章：
${rules.map(r => `- ${r.id} ${r.label}：${r.ask}`).join('\n')}
2. 列出最值得改的问题（最多 8 条，按重要性排；没问题就少列），每条落到具体位置：
   chapter = 第几章（数字），step = 第几步（数字，整章的问题填 0），target = step（一步的题干 / 选项）/ bench（虚拟工位）/ opening（标题和开场）/ chapter（整章要重写）
   problem = 一句话说哪里不对；fix = 一句话说怎么改（要能直接当修改要求用，比如「难度降一档：选项里去掉需要读代码才能判断的那项」）。
   已锁定的章节不要列。
返回 JSON：{ "items": [ { "rule": "A1", "score": 1-5, "reason": "" } ], "todos": [ { "chapter": 1, "step": 2, "target": "step", "rule": "A1", "problem": "", "fix": "" } ], "summary": "一句话总评" }`;
  const r = await generateContent(prompt, model, { jsonMode: true });
  await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Review · Space（跟进）', institution: '', model_id: resolveModel(model), usageMetadata: r.usageMetadata, success: true, stage: 'review' } as any).catch(() => {});
  const p = parseJsonLoose(r.text) || {};
  const items = rules.map(rule => { const x = (p.items || []).find((i: any) => i?.rule === rule.id) || {}; return { rule: rule.id, label: rule.label, score: Math.max(1, Math.min(5, Number(x.score) || 3)), reason: String(x.reason || '').slice(0, 200) }; });
  const targets = ['chapter', 'step', 'bench', 'opening'];
  const todos: Todo[] = (Array.isArray(p.todos) ? p.todos : []).slice(0, 8).map((t: any, i: number) => {
    const c = chapters[(Number(t.chapter) || 0) - 1];
    if (!c || c.locked) return null;
    const stepNo = Number(t.step) || 0, st = stepNo > 0 ? (c.sim?.steps || [])[stepNo - 1] : null;
    let target = targets.includes(t.target) ? t.target : st ? 'step' : 'chapter';
    if (st?.type === 'bench') target = 'bench';
    if ((target === 'step' || target === 'bench') && !st) target = 'chapter';
    return { id: `t${i + 1}`, chapter_id: c.id, chapter: `${c.slot || ''} ${c.title}`.trim(), step_id: st?.id || null, step_no: st ? stepNo : null, target, rule: String(t.rule || ''), problem: String(t.problem || '').slice(0, 200), fix: String(t.fix || '').slice(0, 300) } as Todo;
  }).filter(Boolean) as Todo[];
  const review: FullReview = { items, todos, summary: String(p.summary || '').slice(0, 200), worst: Math.min(...items.map(i => i.score)), at: new Date().toISOString(), chapters: chapters.length };
  await db.from('lab_revisions').insert({ task_id: spaceId, target: 'review', instruction: '自动评审', after: review, status: 'proposed', note: review.summary }).then(() => {}, () => {});
  return review;
}

export async function latestReview(spaceId: string): Promise<FullReview | null> {
  const { data, error } = await db.from('lab_revisions').select('after, created_at').eq('task_id', spaceId).eq('target', 'review').order('created_at', { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  return data[0].after as FullReview;
}

/** 一键按评审改：按章分组，有问题、没锁定的章把这几条 fix 当要求重写成草稿（顺序跑），最后再评一遍 */
export async function fixByReview(spaceId: string, todos: Todo[], model: string, progress: (phase: string, detail?: string) => Promise<void>) {
  const byCh = new Map<string, Todo[]>();
  for (const t of todos) if (t.chapter_id) byCh.set(t.chapter_id, [...(byCh.get(t.chapter_id) || []), t]);
  const { data: chs } = await db.from('lab_chapters').select('id, title, locked, status').in('id', [...byCh.keys()]);
  const todo = (chs || []).filter((c: any) => !c.locked);
  let n = 0;
  for (const c of todo) {
    const fixes = byCh.get(c.id) || [];
    await progress(`按评审改 ${n + 1} / ${todo.length}`, c.title);
    if (c.status === 'published') await db.from('lab_chapters').update({ status: 'draft' }).eq('id', c.id);
    const hint = `按评审意见修改（只改这些问题，其它保持）：${fixes.map(f => `${f.step_no ? `第 ${f.step_no} 步` : f.target === 'opening' ? '开场' : '整章'}：${f.fix}`).join('；')}`;
    await buildChapter(spaceId, c.id, model, hint.slice(0, 800), { art: true }, () => {});
    n++;
  }
  await progress('改完再评一遍');
  const again = await reviewSpace(spaceId).catch(() => null);
  return `改了 ${n} 章（都变成草稿，看过再发布）${again ? `；再评：最低 ${again.worst} 分，剩 ${again.todos.length} 条` : ''}`;
}
