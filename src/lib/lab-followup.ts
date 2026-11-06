/**
 * 百业工厂 · AI 全程跟进（C，2026-11-06）：生成完 / 整体重写完自动评审一遍，问题落到「哪一章哪一步、怎么改」，成待办；
 * 人可以一条一条「按这条改」（走局部改的对比采纳），也可以「一键按评审改」（有问题、没锁定的章按建议重写成草稿，改完再评一遍）。
 * 规则沿用 lab-review 的 REVIEW_RULES，加一条 A1「合受众」：对照空间的生成要求看难度、术语、职业粒度。
 * 评审结果存 lab_revisions（target='review'，迁移 066；没跑就只返回不存）。
 * 收敛（11-06 实测：一键改完再评还是 8 条，评审每次从零挑毛病、改法又是整章重写）：
 *   每条待办分 must（不改会误导 / 不合受众 / 做不了 / 前后矛盾）和 nice（可以更好）；各项 ≥3 分且没有 must = 达标，可以发布；
 *   复评带上一轮的意见，先核对改到位没有，新问题只报 must；一键改只动问题所在的那一步 / 开场，整章的问题才整章重写。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent, resolveModel } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { REVIEW_RULES } from '@/lib/agents/lab-review';
import { buildChapter } from '@/lib/agents/lab-chapters';
import { applyRevision, logRevision, reviseOpening, reviseStep } from '@/lib/lab-revise';
import { slotMinutes } from '@/lib/lab-studio';
import { hasSpec, specTextOf } from '@/lib/lab-spec';

export type Todo = { id: string; chapter_id: string | null; chapter: string; step_id: string | null; step_no: number | null; target: 'chapter' | 'step' | 'bench' | 'opening'; rule: string; problem: string; fix: string; severity?: 'must' | 'nice' };
export type FullReview = { items: { rule: string; label: string; score: number; reason: string }[]; todos: Todo[]; summary: string; worst: number; at: string; chapters: number;
  /** 达标：各项 ≥3 分且没有 must；round 第几轮（复评 +1）；resolved 上一轮的意见改到位了几条 */
  pass?: boolean; round?: number; resolved?: { done: number; total: number } };
export const isMust = (t: Todo) => t.severity !== 'nice';

const A1 = { id: 'A1', label: '合受众', ask: '对照「用户的生成要求」：难度、术语、职业讲到的粒度、工位要求的精细程度，是不是适合要求里写的受众；没写要求就按职业探索（没入行的人能上手）来看' } as const;

// 评审材料里省掉的地方打「…」（11-06：台词截到 80 字不加记号，评审当成「题干被截断」报了 must）
const cut = (v: any, n: number) => { const t = String(v || ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
const chapterText = (c: any, n: number) => {
  const steps = (c.sim?.steps || []).map((s: any, i: number) => {
    if (s.type === 'bench') { const b = s.bench || {}; return `  ${i + 1}.【虚拟工位】${b.name || ''}：${b.brief || ''}｜规则：${(b.rules || []).map((r: any) => `${r.severity === 'violation' ? '违规' : '提醒'}·${r.label}`).join('；')}｜目标：${(b.goals || []).map((g: any) => g.label).join('；')}`; }
    return `  ${i + 1}.【${s.type}】${s.scene?.who ? `${s.scene.who}：${cut(s.scene.text, 200)} ` : ''}${s.prompt || ''}${s.options?.length ? `（选项：${cut(s.options.map((o: any) => o.detail ? `${o.label}（${o.detail}）` : o.label).join(' / '), 400)}）` : ''}`;
  }).join('\n');
  return `第${n}章【${c.slot || '?'}】${c.title}（${c.kind}${c.locked ? '，已锁定' : ''}）${c.brief ? `\n  要交代：${c.brief}` : ''}\n  开场：${cut(c.sim?.intro, 240)}\n${steps}`;
};

export async function reviewSpace(spaceId: string, model = 'claude-sonnet-5-5', prev?: FullReview | null, sent?: string[]): Promise<FullReview> {
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

${prev ? `【这是复评】上一轮（第 ${prev.round || 1} 轮）的意见${sent ? '，标了「已交给 AI 改」的这轮改过，其它的这轮没动' : '已经交给 AI 改过了'}：
${prev.todos.map((t, i) => `${i + 1}. [${t.severity === 'nice' ? 'nice' : 'must'}]${sent ? (sent.includes(t.id) ? '［已交给 AI 改］' : '［这轮没动］') : ''} ${t.chapter}${t.step_no ? ` 第${t.step_no}步` : ''}：${t.problem}（要求：${t.fix}）`).join('\n')}
先核对交去改的改到位没有（resolved 填改到位的序号）。还在的问题照旧列成待办，carry 填它在上一轮的序号，severity 照上一轮的不要升级；
新发现的问题只列 must 级的，「可以更好」的不要再列——不要每轮换一批毛病。
` : ''}材料里以「…」结尾的地方是评审材料省略的，不是原文被截断，不要当问题报。
平台规则和用户的生成要求冲突时（比如要求里说「红线只留真会出事故的」「不要求精准」），以用户要求为准：不要为了凑规则提违背要求的修改，对应规则按要求的口径打分。

做两件事：
1. 按规则打分（1–5；5 完全做到，3 勉强，1 没做到），理由一句话、具体到哪一章：
${rules.map(r => `- ${r.id} ${r.label}：${r.ask}`).join('\n')}
2. 列出最值得改的问题（最多 8 条，按重要性排；没问题就少列），每条落到具体位置：
   chapter = 第几章（数字），step = 第几步（数字，整章的问题填 0），target = step（一步的题干 / 选项）/ bench（虚拟工位）/ opening（标题和开场）/ chapter（整章要重写）
   problem = 一句话说哪里不对；fix = 一句话说怎么改（要能直接当修改要求用，比如「难度降一档：选项里去掉需要读代码才能判断的那项」）。
   severity = must（不改会误导体验者 / 明显不合受众 / 做不下去 / 前后事实矛盾 / 示范答案错）或 nice（能更好，但现在也能用）。只有 must 挡发布，别把 nice 说成 must。
   已锁定的章节不要列。
返回 JSON：{ "items": [ { "rule": "A1", "score": 1-5, "reason": "" } ], "todos": [ { "chapter": 1, "step": 2, "target": "step", "rule": "A1", "severity": "must",${prev ? ' "carry": 0,' : ''} "problem": "", "fix": "" } ],${prev ? ' "resolved": [1, 3],' : ''} "summary": "一句话总评" }`;
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
    return { id: `t${i + 1}`, chapter_id: c.id, chapter: `${c.slot || ''} ${c.title}`.trim(), step_id: st?.id || null, step_no: st ? stepNo : null, target, rule: String(t.rule || ''), severity: (prev && Number(t.carry) >= 1 && prev.todos[Number(t.carry) - 1] ? (prev.todos[Number(t.carry) - 1].severity === 'nice' ? 'nice' : 'must') : t.severity === 'nice' ? 'nice' : 'must'), problem: String(t.problem || '').slice(0, 200), fix: String(t.fix || '').slice(0, 300) } as Todo;
  }).filter(Boolean) as Todo[];
  todos.sort((a, b) => Number(isMust(b)) - Number(isMust(a)));
  const worst = Math.min(...items.map(i => i.score));
  const asked = prev ? prev.todos.map((t, i) => i + 1).filter(n => !sent || sent.includes(prev.todos[n - 1].id)) : [];
  const resolved = prev ? { done: (Array.isArray(p.resolved) ? p.resolved : []).map(Number).filter((n: number) => asked.includes(n)).length, total: asked.length } : undefined;
  const review: FullReview = { items, todos, summary: String(p.summary || '').slice(0, 200), worst, at: new Date().toISOString(), chapters: chapters.length,
    pass: worst >= 3 && !todos.some(isMust), round: prev ? (prev.round || 1) + 1 : 1, ...(resolved ? { resolved } : {}) };
  await db.from('lab_revisions').insert({ task_id: spaceId, target: 'review', instruction: '自动评审', after: review, status: 'proposed', note: review.summary }).then(() => {}, () => {});
  return review;
}

export async function latestReview(spaceId: string): Promise<FullReview | null> {
  const { data, error } = await db.from('lab_revisions').select('after, created_at').eq('task_id', spaceId).eq('target', 'review').order('created_at', { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  return data[0].after as FullReview;
}

/**
 * 一键按评审改：问题在哪就改哪——一步的走 reviseStep、开场走 reviseOpening，直接写进去（人点了一键，就算采纳，改前版本进 lab_edits）；
 * 整章的问题才整章重写（同一章的其它条并进要求）；工位要在模拟器里跑通、1–3 分钟一台，不在这里批量做，留给人在工作室「重新设计」。
 * 改过的章变草稿；最后带着这一轮的意见复评。
 */
export async function fixByReview(spaceId: string, todos: Todo[], model: string, progress: (phase: string, detail?: string) => Promise<void>) {
  const prev = await latestReview(spaceId);
  const ids = [...new Set(todos.map(t => t.chapter_id).filter(Boolean))] as string[];
  const { data: chs } = await db.from('lab_chapters').select('id, title, locked, status').in('id', ids);
  const open = new Map((chs || []).filter((c: any) => !c.locked).map((c: any) => [c.id, c]));
  const work = todos.filter(t => t.chapter_id && open.has(t.chapter_id));
  const whole = new Set(work.filter(t => t.target === 'chapter').map(t => t.chapter_id!));
  const benches = work.filter(t => t.target === 'bench' && !whole.has(t.chapter_id!));
  const local = work.filter(t => (t.target === 'step' || t.target === 'opening') && !whole.has(t.chapter_id!));
  const touched = new Set<string>(); let n = 0, failed = 0; const total = whole.size + local.length;
  for (const cid of whole) {
    const c: any = open.get(cid); const fixes = work.filter(t => t.chapter_id === cid);
    await progress(`按评审改 ${++n} / ${total}`, `重写整章 · ${c.title}`);
    const hint = `按评审意见修改（只改这些问题，其它保持）：${fixes.map(f => `${f.step_no ? `第 ${f.step_no} 步` : f.target === 'opening' ? '开场' : '整章'}：${f.fix}`).join('；')}`;
    try { await buildChapter(spaceId, cid, model, hint.slice(0, 800), { art: true }, () => {}); touched.add(cid); } catch (e) { failed++; console.warn('[fix_review] 整章', c.title, (e as any)?.message); }
  }
  for (const t of local) {
    await progress(`按评审改 ${++n} / ${total}`, `${t.chapter}${t.step_no ? ` 第 ${t.step_no} 步` : ' 开场'}`);
    try {
      const r = t.target === 'opening' ? await reviseOpening(spaceId, t.chapter_id!, t.fix, model) : await reviseStep(spaceId, t.chapter_id!, t.step_id!, t.fix, model);
      await applyRevision(spaceId, { chapter_id: t.chapter_id!, target: t.target, step_id: t.step_id || undefined, after: r.after }, 'agent:fix_review');
      await logRevision({ task_id: spaceId, chapter_id: t.chapter_id, target: t.target === 'opening' ? 'opening' : `step:${t.step_id}`, instruction: t.fix, before: r.before, after: r.after, note: r.note, status: 'adopted', created_by: 'agent:fix_review' });
      touched.add(t.chapter_id!);
    } catch (e) { failed++; console.warn('[fix_review]', t.chapter, t.step_no, (e as any)?.message); }
  }
  const pub = [...touched].filter(id => (open.get(id) as any)?.status === 'published');
  if (pub.length) await db.from('lab_chapters').update({ status: 'draft' }).in('id', pub);
  await progress('改完再评一遍', '核对上一轮的意见改到位没有');
  const again = await reviewSpace(spaceId, undefined, prev, todos.map(t => t.id)).catch(() => null);
  const musts = again ? again.todos.filter(isMust).length : 0;
  return [`改了 ${n - failed} 处（${whole.size ? `整章重写 ${whole.size} 章、` : ''}单步 / 开场 ${local.length} 处${failed ? `，${failed} 处没改成` : ''}；改过的章是草稿，看过再发布）`,
    benches.length ? `工位的 ${benches.length} 条要在工作室点「✦ 改 → 重新设计」` : '',
    again ? `复评：上一轮 ${again.resolved?.done ?? '?'}/${again.resolved?.total ?? todos.length} 条改到位，${again.pass ? '达标，可以发布' : `还有 ${musts} 条必须改`}${again.todos.length - musts ? `、${again.todos.length - musts} 条可以更好` : ''}` : ''].filter(Boolean).join('；');
}
