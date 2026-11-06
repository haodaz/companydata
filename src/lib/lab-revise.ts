/**
 * 百业工厂 · 局部改（2026-11-06，B：分维度反馈）：人指着一处说怎么改，AI 只改这一处，出「改前 / 改后」，人采纳才生效。
 *   step     一步：场景台词、题干、选项、分类、数值范围 + 这一步的示范答案（文案、难度、内容都在这一层改）
 *   opening  这一章的标题和开场白
 *   bench    虚拟工位：太复杂不让模型直接改 JSON，按要求重新设计一台（designBench 在模拟器里跑通才收），后台跑 1–3 分钟
 * 都带上空间的生成要求（受众 / 深度 / 难度……）。提案写 lab_revisions（迁移 066；没跑时同步的照样能用，只是不留痕）。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent, resolveModel } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { spaceText } from '@/lib/agents/lab-chapters';
import { specTextOf } from '@/lib/lab-spec';
import { rebuildBench } from '@/lib/agents/skill-lab-build';
import { sanitizeSim, sanitizeTrace, type Sim, type SimStep } from '@/lib/skill-sim';


async function ask(prompt: string, model: string, task: string) {
  for (let i = 0; ; i++) {
    const r = await generateContent(prompt, model, { jsonMode: true });
    await logTokenUsage({ tool_name: 'skill-lab', task_name: task, institution: '', model_id: resolveModel(model), usageMetadata: r.usageMetadata, success: true }).catch(() => {});
    try { return parseJsonLoose(r.text); } catch (e) { if (i >= 1) throw e; }
  }
}

async function loadCtx(spaceId: string, chapterId: string) {
  const [{ data: space, error }, { data: ch, error: e2 }] = await Promise.all([
    db.from('skill_tasks').select('id, title, profile, jd_snapshot, bible').eq('id', spaceId).single(),
    db.from('lab_chapters').select('id, task_id, slot, title, kind, brief, sim, expert_trace, locked').eq('id', chapterId).eq('task_id', spaceId).single(),
  ]);
  if (error) throw error; if (e2) throw e2;
  return { space, ch };
}

/** 记一条提案（066 没跑就跳过，返回 null） */
export async function logRevision(row: { task_id: string; chapter_id?: string | null; target: string; instruction: string; before?: any; after?: any; note?: string; status?: string; created_by?: string | null }) {
  const { data, error } = await db.from('lab_revisions').insert({ ...row, status: row.status || 'proposed' }).select('id').single();
  return error ? null : (data.id as string);
}

/** 改一步：返回改后的这一步 + 这一步的示范答案。sim 传的是工作室里正在编辑的版本（可能还没保存） */
export async function reviseStep(spaceId: string, chapterId: string, stepId: string, instruction: string, model: string, live?: { sim?: Sim; expert?: Record<string, any> }) {
  const { space, ch } = await loadCtx(spaceId, chapterId);
  const sim: Sim = live?.sim || ch.sim;
  const expert = live?.expert || ch.expert_trace || {};
  const step = sim.steps.find(s => s.id === stepId);
  if (!step) throw new Error('这一步找不到了（可能刚删掉）');
  if (step.type === 'bench') throw new Error('虚拟工位走「重新设计工位」');
  const others = sim.steps.map((s, i) => `${i + 1}. [${s.type}]${s.id === stepId ? ' ←要改的这一步' : ''} ${s.prompt}`).join('\n');
  const p = await ask(`你在帮人修改职业体验空间里的一步题目。只改这一步，别的步骤不动。
${spaceText(space)}

【这一章】${ch.slot || ''} · ${ch.title}
要交代的事：${ch.brief || ''}
开场：${sim.intro || ''}
这一章的步骤：
${others}

【要改的这一步（JSON）】
${JSON.stringify(step)}
【这一步现在的示范答案】${JSON.stringify(expert[stepId] ?? null)}

【人的修改要求】${instruction}

规则：
- 按要求改，没让改的部分保持原样；id、type 不变（除非要求里明确说换题型）。
- 选项沿用原来的 id；新加的选项用新 id（如 o9）；删掉的就不要再出现。
- scene.who 沿用原来的人名，除非要求换人。
- 同时给出改后这一步的示范答案 expert（choose 填选项 id；multi / drill 填 id 数组；classify 填 {条目 id: 标签 id}；allocate 填 {条目 id: 数值}；slider 填数字；text 填一段老手会写的答案）。
- note：一句话（≤40 字）说改了什么。
只返回 JSON：{ "step": { ... }, "expert": ..., "note": "" }`, model, 'Lab · 局部改 · 一步');
  const raw = { ...(p?.step || {}), id: stepId };
  const steps = sim.steps.map(s => (s.id === stepId ? raw : s));
  const checked = sanitizeSim({ ...sim, steps });
  const clean = checked?.steps.find(s => s.id === stepId);
  if (!clean) throw new Error('AI 改出来的这一步格式不对，换个说法再试一次');
  const after: SimStep = { ...clean, ...(step.place ? { place: step.place } : {}), ...(step.props ? { props: step.props } : {}) };
  const tr = sanitizeTrace({ ...sim, steps: [after] } as Sim, { [stepId]: p?.expert });
  return { before: { step, expert: expert[stepId] ?? null }, after: { step: after, expert: tr[stepId] ?? null }, note: String(p?.note || '').slice(0, 80) };
}

/** 改这一章的标题和开场 */
export async function reviseOpening(spaceId: string, chapterId: string, instruction: string, model: string, live?: { title?: string; intro?: string }) {
  const { space, ch } = await loadCtx(spaceId, chapterId);
  const title = live?.title ?? ch.title, intro = live?.intro ?? ch.sim?.intro ?? '';
  const p = await ask(`你在帮人修改职业体验空间里一章的标题和开场白（开场白是进这一章时看到的情境）。
${spaceText(space)}
【这一章】${ch.slot || ''} · 标题「${title}」
要交代的事：${ch.brief || ''}
开场白：${intro}
步骤：${(ch.sim?.steps || []).map((s: any) => s.prompt).join(' / ')}

【人的修改要求】${instruction}
标题 ≤ 18 字；开场白 ≤ 160 字，第二人称，交代时间、地点、要干什么。没让改的保持原样。
只返回 JSON：{ "title": "", "intro": "", "note": "<一句话说改了什么>" }`, model, 'Lab · 局部改 · 开场');
  const after = { title: String(p?.title || title).trim().slice(0, 40), intro: String(p?.intro || intro).trim().slice(0, 600) };
  return { before: { title, intro }, after, note: String(p?.note || '').slice(0, 80) };
}

/**
 * 重新设计这一章的虚拟工位（后台跑）：按要求 + 生成要求重做一台，模拟器里跑通才收；结果写成提案等人采纳。
 * 提案 after = { sim: 换上新工位后的整章故事线, expert: 新工位那一步的示范轨迹, stepId }
 */
export async function rebuildChapterBench(spaceId: string, chapterId: string, instruction: string, model: string, revisionId: string) {
  const { space, ch } = await loadCtx(spaceId, chapterId);
  const old = (ch.sim?.steps || []).find((s: any) => s.type === 'bench');
  // 在原工位上改（11-06 实测：只给要求不给原工位，模型会换个场景从头设计，「降难度」反而没降）
  const base = old ? `原工位（在它上面改；要求里没说换设备 / 场景就别换）：\n${benchSummary(old).join('\n')}\n降难度 = 放宽目标的容差、少几个要同时盯的量、红线只留真会出事的；加难度反过来。` : '';
  const hint = [`人的修改要求：${instruction}`, base, specTextOf(space.jd_snapshot)].filter(Boolean).join('\n');
  const r = await rebuildBench({ id: spaceId, jd_snapshot: space.jd_snapshot || {}, title: ch.title, brief: ch.brief || ch.sim?.intro || '', sim: ch.sim }, model, hint);
  if (!r) throw new Error('这次没设计出能跑通的工位，换个说法再试');
  const nb = r.sim.steps.find(s => s.type === 'bench')!;
  // 别的步骤保留原样（rebuildBench 清洗时会丢掉 place / props）
  const steps = (ch.sim.steps as SimStep[]).filter(s => s.type !== 'bench');
  const at = r.sim.steps.findIndex(s => s.type === 'bench');
  steps.splice(Math.min(at, steps.length), 0, nb);
  const after = { sim: { ...ch.sim, steps, art: r.sim.art || ch.sim.art }, expert: r.benchTrace, stepId: nb.id, name: r.name };
  await db.from('lab_revisions').update({ status: 'proposed', after, before: { step: old || null }, note: `新工位「${r.name}」${r.note ? `（${r.note}）` : ''}`.slice(0, 200) }).eq('id', revisionId);
}

/** 工位一句话摘要：给对比看（控件、目标、红线） */
export function benchSummary(step: any): string[] {
  const b = step?.bench; if (!b) return ['（没有工位）'];
  return [
    `设备：${b.name}`,
    `控件：${(b.controls || []).filter((c: any) => !c.hidden).map((c: any) => c.label).join('、') || '—'}`,
    `目标：${(b.goals || []).map((g: any) => g.label || g.text || g.id).join('；') || '—'}`,
    `红线 / 提醒：${(b.rules || []).map((r: any) => `${r.severity === 'veto' ? '🚫否决·' : r.severity === 'violation' ? '✖' : '⚠'}${r.label || r.msg || r.id}`).join('；') || '—'}`,
  ];
}

/**
 * 对话里采纳一条提案（D）：直接写进这一章（工作室里是先放进草稿、人点保存；对话里没有编辑器，采纳 = 保存），改动照样进 lab_edits。
 * p = { chapter_id, target: 'step' | 'opening' | 'bench', step_id?, after }
 */
export async function applyRevision(spaceId: string, p: { chapter_id: string; target: string; step_id?: string; after: any }, actor: string | null) {
  const { data: ch, error } = await db.from('lab_chapters').select('*').eq('id', p.chapter_id).eq('task_id', spaceId).single();
  if (error) throw error;
  if (ch.locked) throw new Error('这一章锁定了，先在工作室里解锁');
  const sim = JSON.parse(JSON.stringify(ch.sim || {})), trace = { ...(ch.expert_trace || {}) };
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (p.target === 'opening') { patch.title = String(p.after?.title || ch.title).slice(0, 120); sim.intro = String(p.after?.intro ?? sim.intro); patch.sim = sim; }
  else if (p.target === 'step') {
    const k = (sim.steps || []).findIndex((x: any) => x.id === p.step_id);
    if (k < 0) throw new Error('这一步找不到了');
    sim.steps[k] = p.after.step; if (p.after.expert != null) trace[p.step_id!] = p.after.expert;
    patch.sim = sim; patch.expert_trace = trace;
  } else if (p.target === 'bench') {
    patch.sim = p.after.sim; if (p.after.expert) trace[p.after.stepId] = p.after.expert; patch.expert_trace = trace;
  } else throw new Error('target?');
  const { error: e2 } = await db.from('lab_chapters').update(patch).eq('id', ch.id);
  if (e2) throw e2;
  const { recordEdit } = await import('@/lib/lab-edits');
  await recordEdit({ task_id: spaceId, chapter_id: ch.id, source: 'agent', actor, before: ch, after: patch }).catch(() => {});
}
