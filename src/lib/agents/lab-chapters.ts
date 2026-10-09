/**
 * AI 百业 · 分层生成：先排「一天骨架」，再一格一格生成章节（docs/lab-studio.md 第 4 步）。
 *
 * 骨架：职业 + 已有章节 + 角色表 → 一天 6–8 格（时段、标题、类型、要交代的事）+ 这一天还缺的人物 / 场景 / 道具 + 要前后一致的事实。
 *   空格子建成草稿章节（没有步骤），缺的角色先进角色表（按规范类型名从素材库挑现成的，挑不到的等第一次出场时再画）。
 * 按格生成：给一格写故事线（4–6 步 + 写结论）和示范答案。
 *   人物 / 场景 / 道具优先用角色表里的（同一天同一张脸、同一个地方）；需要新的就新建（户外 / 办公室 / 同行 / 客户都很正常），
 *   新建的先按规范类型名找素材库，找不到才画，画完立刻归库。
 */
import { generateContent, resolveModel } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeTrace, type Sim, type SimStep, type SimTrace } from '@/lib/skill-sim';
import { slotMinutes, type StudioChapter } from '@/lib/lab-studio';
import { applyCastArt, castKind, nextCastCode, stepsUsing, type CastKind, type CastMember } from '@/lib/lab-cast';
import { drawCastAsset, findReusable, loadCast, registerAsset } from '@/lib/lab-cast-server';
import { artAvailable } from '@/lib/lab-art';
import { familyOf } from '@/lib/career-family';

export interface DayBible { facts?: string[]; outline?: { slot: string; title: string }[]; updated_at?: string }
export type Progress = (phase: string, detail?: string) => void | Promise<void>;

const DAY_RULES = `「一天」的规则（必须遵守）：
1. 按时间先后排，时段写成 HH:MM（如 08:30）。有的职业不是一天而是一周 / 一个项目周期，就写「周一上午」这类，同样按先后。
2. 内容要配得上时段：早上做晨会 / 交接 / 准备 / 巡检 / 开店；中段做核心操作、处理事情、应对突发；下午到傍晚才是收尾 / 复盘 / 交接班 / 闭店。绝不能一大早做全天复盘。
3. 前后接得上：后面的格子要接住前面发生的事（上午的客诉，傍晚复盘时要提到）。
4. 类型 kind：daily 日常、incident 突发（一天里 1–2 个就够）、assessment 考核（最多 1 个，通常在后段）。`;

const CAST_RULES = `人物 / 场景 / 道具的规则：
- 优先用角色表里已有的（同一天同一张脸、同一个地方），用编号指（P01 / S02 / T01）。
- 这一章确实需要新的人（同行、客户、别的部门）、新的地方（户外、办公室、仓库）、新的道具，就在 new_cast 里新建，用临时编号 N1、N2… 指它。新建很正常，不要硬塞进已有的。
- 新建的要给规范类型名 type_name（通用类型，给素材库跨空间复用用）。人物写成「角色·性别年龄段」：带教师傅·中年男、患者家属·青年女、术后患者·老年女、挑剔的顾客·中年女；
  地点和道具写通用名：商场公共卫生间、数控车间、灭火器、交接记录本…和外形 / 陈设描述 look（画图用：人写性别、年龄、发型、职业装束、手里拿着什么、神情；地方写陈设和氛围；道具写外观）。
- 一个人一行：两个人（患者和家属、护士长和夜班医生、两个科室的医生）一定分开写，各有各的名字和外形，不要合成一行。
- 人名要像真人（老周、小林、王姐、陈先生），不要写成一句话（「老周通过对讲机提醒你」是错的，who 只写「老周」，对讲机写进台词）。`;

function spaceText(space: any): string {
  const jd = space.jd_snapshot || {}, p = space.profile || {};
  const career = jd.career || {};
  return [
    `职业：${career.profession || jd.title || space.title}${jd.company ? `（${jd.company}）` : ''}`,
    p.role ? `数字职人（主角的师傅 / 化身）：${p.name || ''} · ${p.role}${p.tagline ? `，口头禅「${p.tagline}」` : ''}` : '',
    jd.responsibilities ? `岗位职责：${String(jd.responsibilities).slice(0, 800)}` : '',
    career.summary ? `职业概况：${String(career.summary).slice(0, 400)}` : '',
  ].filter(Boolean).join('\n');
}

const castText = (cast: CastMember[]) => (['person', 'place', 'prop'] as CastKind[]).map(k => {
  const list = cast.filter(m => m.kind === k && !m.is_self);
  return `${castKind(k).label}：${list.length ? list.map(m => `${m.code} ${m.name}（${m.type_name || '未定类型'}${m.note ? `；${m.note}` : ''}）`).join('；') : '（还没有）'}`;
}).join('\n');

const chapterLine = (c: StudioChapter) =>
  `- [${c.id}] ${c.slot || '未定时段'} · ${c.kind} · ${c.title}${c.brief ? `：${c.brief}` : ''}${c.sim?.intro ? `\n  开场：${String(c.sim.intro).slice(0, 160)}` : ''}`;

async function ask(prompt: string, model: string, taskName: string) {
  for (let i = 0; ; i++) {
    const r = await generateContent(prompt, model, { jsonMode: true });
    await logTokenUsage({ tool_name: 'skill-lab', task_name: taskName, institution: '', model_id: resolveModel(model), usageMetadata: r.usageMetadata, success: true }).catch(() => {});
    try { return parseJsonLoose(r.text); }
    catch (e) { if (i >= 1) throw e; }
  }
}

const str = (v: any, n: number) => String(v ?? '').trim().slice(0, n);
const KINDS = ['daily', 'incident', 'assessment'];
const CAST_K: CastKind[] = ['person', 'place', 'prop'];

/** 新角色进角色表：先按规范类型名找素材库能复用的；道具找不到就建一张道具卡归库（先不画图） */
async function addCast(taskId: string, cast: CastMember[], x: { kind: CastKind; name: string; type_name: string; note: string; look: string }, family: string): Promise<CastMember> {
  const same = cast.find(m => m.kind === x.kind && m.name === x.name);
  if (same) return same;
  let asset_id: string | null = null;
  const hit = await findReusable(castKind(x.kind).asset, x.type_name, family, cast.map(m => m.asset_id));
  if (hit) { asset_id = hit.id; await supabaseAdmin.from('lab_art_assets').update({ uses: (hit.uses || 1) + 1 }).eq('id', hit.id); }
  else if (x.kind === 'prop') asset_id = (await registerAsset({ kind: 'prop', title: x.name, type_name: x.type_name || x.name, note: x.look, family, source_task_id: taskId })).id;
  const { data, error } = await supabaseAdmin.from('lab_cast').insert({
    task_id: taskId, code: nextCastCode(cast, x.kind), kind: x.kind, name: x.name, type_name: x.type_name, note: x.note, look: x.look, asset_id,
  }).select('*, asset:lab_art_assets(*)').single();
  if (error) throw error;
  cast.push(data as CastMember);
  return data as CastMember;
}

function readNewCast(raw: any): { tmp: string; kind: CastKind; name: string; type_name: string; note: string; look: string }[] {
  return (Array.isArray(raw) ? raw : []).map((c: any, i: number) => ({
    tmp: str(c.id || c.tmp || `N${i + 1}`, 10), kind: CAST_K.includes(c.kind) ? c.kind : 'person',
    name: str(c.name, 30), type_name: str(c.type_name, 30), note: str(c.note, 120), look: str(c.look, 300),
  })).filter(c => c.name).slice(0, 8);
}

// ────────────────────────────────────────────
// 1. 一天骨架
// ────────────────────────────────────────────
export async function buildDay(spaceId: string, model: string, hint: string, progress: Progress): Promise<{ added: number; cast: number }> {
  const { data: space, error } = await supabaseAdmin.from('skill_tasks').select('id, title, profile, jd_snapshot, bible').eq('id', spaceId).single();
  if (error) throw error;
  // 重排骨架：空的、没锁的草稿格子先清掉（有步骤的、锁定的、已发布的都留着）
  const { data: all } = await supabaseAdmin.from('lab_chapters').select('*').eq('task_id', spaceId).order('seq');
  const empty = (all || []).filter((c: any) => c.status === 'draft' && !c.locked && !(c.sim?.steps?.length));
  if (empty.length) await supabaseAdmin.from('lab_chapters').delete().in('id', empty.map((c: any) => c.id));
  const chapters = (all || []).filter((c: any) => !empty.includes(c)) as StudioChapter[];
  const cast = await loadCast(spaceId);
  const family = familyOf((space as any).jd_snapshot?.career?.profession, (space as any).jd_snapshot?.title);

  await progress('排一天骨架', `已有 ${chapters.length} 章 · 角色表 ${cast.length} 项`);
  const p = await ask(`
你在给一个「职业体验空间」排一天的骨架。体验者跟着时间把这个职业的一天走一遍，每一格是一章（一段 5–10 分钟的操作）。

${spaceText(space)}

已经做好的章节（放进这一天里合适的时段，不要再为它们新建格子）：
${chapters.length ? chapters.map(chapterLine).join('\n') : '（还没有）'}

角色表（这个空间已有的人 / 地方 / 道具）：
${castText(cast)}

${DAY_RULES}
${hint ? `\n管理员的要求：${hint}\n` : ''}
要求：
- 整天 6–8 格（含已有章节）。新格子只给标题和要交代的事，不出题。
- 这一天会反复出场、但角色表里还没有的人物 / 地点 / 道具，放进 new_cast（各章生成时会优先用）。人物 2–6 个，地点 2–4 个，道具 2–5 个（道具一定要有）。
${CAST_RULES}
- 要前后一致的事实 3–6 条（如「上午 9 点有一批团购顾客」「消毒液只剩半桶」）。
- 全部用中文。

返回 JSON：
{
  "existing": [ { "id": "<已有章节 id>", "slot": "<给它的时段>" } ],
  "slots": [ { "slot": "08:30", "title": "<格子标题，10 字左右>", "kind": "daily|incident|assessment", "brief": "<这一章要交代的事，1–2 句，写清和前后章节的衔接>" } ],
  "new_cast": [ { "kind": "person|place|prop", "name": "", "type_name": "", "note": "", "look": "" } ],
  "facts": [ "" ]
}`, model, 'Lab Day Skeleton');

  // 已有章节放进时段（没写时段的才填，人写过的不覆盖）
  const ids = new Set(chapters.map(c => c.id));
  for (const e of Array.isArray(p.existing) ? p.existing : []) {
    const c = chapters.find(x => x.id === e?.id);
    if (c && ids.has(c.id) && !c.slot && str(e.slot, 40)) await supabaseAdmin.from('lab_chapters').update({ slot: str(e.slot, 40) }).eq('id', c.id);
  }
  const slots = (Array.isArray(p.slots) ? p.slots : [])
    .map((x: any) => ({ slot: str(x.slot, 40), title: str(x.title, 60), kind: KINDS.includes(x.kind) ? x.kind : 'daily', brief: str(x.brief, 400) }))
    .filter((x: any) => x.slot && x.title).slice(0, 9);
  let seq = Math.max(0, ...chapters.map(c => c.seq));
  if (slots.length) {
    const { error: e2 } = await supabaseAdmin.from('lab_chapters').insert(slots.map((x: any) => ({
      task_id: spaceId, seq: ++seq, slot: x.slot, title: x.title, kind: x.kind, brief: x.brief, sim: { title: x.title, intro: '', steps: [] }, status: 'draft',
    })));
    if (e2) throw e2;
  }
  await progress('登记角色', '新的人 / 地方 / 道具先进角色表，同类型的从素材库复用');
  const before = cast.length;
  for (const x of readNewCast(p.new_cast)) await addCast(spaceId, cast, x, family);
  const bible: DayBible = {
    ...((space as any).bible || {}),
    facts: (Array.isArray(p.facts) ? p.facts : []).map((f: any) => str(f, 140)).filter(Boolean).slice(0, 8),
    outline: [...chapters.map(c => ({ slot: c.slot || '', title: c.title })), ...slots.map((x: any) => ({ slot: x.slot, title: x.title }))]
      .sort((a, b) => (slotMinutes(a.slot) ?? 9999) - (slotMinutes(b.slot) ?? 9999)),
    updated_at: new Date().toISOString(),
  };
  await supabaseAdmin.from('skill_tasks').update({ bible }).eq('id', spaceId);
  return { added: slots.length, cast: cast.length - before };
}

// ────────────────────────────────────────────
// 2. 按格生成一章
// ────────────────────────────────────────────
export async function buildChapter(spaceId: string, chapterId: string, model: string, hint: string, opts: { art?: boolean }, progress: Progress): Promise<{ steps: number; newCast: number; drawn: number; reused: number }> {
  const [{ data: space, error }, { data: chs, error: e2 }] = await Promise.all([
    supabaseAdmin.from('skill_tasks').select('id, title, profile, jd_snapshot, bible').eq('id', spaceId).single(),
    supabaseAdmin.from('lab_chapters').select('*').eq('task_id', spaceId).order('seq'),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  const ch = (chs || []).find((c: any) => c.id === chapterId) as StudioChapter | undefined;
  if (!ch) throw new Error('章节不存在');
  if (ch.locked) throw new Error('这一章锁定了：先解锁再重新生成');
  const cast = await loadCast(spaceId);
  const family = familyOf((space as any).jd_snapshot?.career?.profession, (space as any).jd_snapshot?.title);
  const bible: DayBible = (space as any).bible || {};
  const day = (chs || []) as StudioChapter[];
  const t = slotMinutes(ch.slot);
  const others = day.filter(c => c.id !== ch.id);
  const before = others.filter(c => (t != null && slotMinutes(c.slot) != null ? slotMinutes(c.slot)! < t : c.seq < ch.seq));
  const after = others.filter(c => !before.includes(c));
  const usedBefore = (m: CastMember) => before.some(c => stepsUsing(c.sim, m).length);

  await progress('写故事线', `${ch.slot || ''} ${ch.title}`);
  const p = await ask(`
你在给一个「职业体验空间」写其中一章。体验者扮演这个职业的新人，跟着时间把一天走下去；这一章是一段 5–10 分钟的真实工作操作。

${spaceText(space)}

角色表（编号 · 名字 · 类型；★ 表示这一天前面的章节已经出场过）：
${(['person', 'place', 'prop'] as CastKind[]).map(k => `${castKind(k).label}：${cast.filter(m => m.kind === k && !m.is_self).map(m => `${m.code} ${m.name}（${m.type_name || '—'}）${usedBefore(m) ? '★' : ''}`).join('；') || '（无）'}`).join('\n')}
要前后一致的事实：
${(bible.facts || []).map(f => `- ${f}`).join('\n') || '（无）'}

这一天里，在这一章之前已经发生的：
${before.length ? before.map(chapterLine).join('\n') : '（这是一天的第一章）'}
在这一章之后还会发生的（不要抢它们的内容）：
${after.length ? after.map(c => `- ${c.slot || ''} ${c.title}`).join('\n') : '（无）'}

【要写的这一章】时段 ${ch.slot || '未定'} · 类型 ${ch.kind} · 标题「${ch.title}」
要交代的事：${ch.brief || '（按标题发挥）'}
${hint ? `管理员的要求：${hint}\n` : ''}
${DAY_RULES}
${CAST_RULES}

写法要求：
1. 4–6 步真实工作中的决策动作，最后一步固定为 text（写结论 / 记录 / 交接留言）。让人是在「操作」而不是「答题」。
   - choose：单选一个动作 / 判断（4–5 个选项，有新人最容易选的错误项，正确项不能一眼看出）
   - multi：多选，带 max 上限，逼人取舍
   - classify：给一组条目逐个贴标签，labels 2 个
   - allocate：把一个总量（total + unit）分到几项上
   - slider：0–100 的把握程度 / 比例
2. 每步有 scene（who 说话的人编号、time、text 说了什么 / 发生了什么）推进剧情；place 写这一步在哪（场景编号）；props 写这一步用到的道具编号（没有就空）。
   scene.time 要落在本章时段附近（前后 1 小时内）。
3. 要接住前面章节发生的事（提到具体的人和事），但不要重复它们的操作。
4. 情境与数据虚构，不用真实企业的内部数据。全部用中文。
6. rubric：这一章的评分标准 4 个维度，权重合计 100；每个维度写「看什么」，要能区分会做事的人和会写套话的人，贴着这一章的内容（不要泛泛的「专业能力」）。
5. expert：这一行老师傅在每一步会怎么做（choose 填选项 id；multi 填 id 数组；classify 填 {条目 id: 标签 id}；allocate 填 {条目 id: 数值}，和等于 total；slider 填数字；text 写一段示范答案）。

返回 JSON：
{
  "new_cast": [ { "id": "N1", "kind": "person|place|prop", "name": "", "type_name": "", "note": "", "look": "" } ],
  "sim": { "title": "<本章操作台名称>", "intro": "<开场：把体验者带进 ${ch.slot || '这个时段'} 的情境，2–3 句>", "steps": [ { "id": "<英文短 id>", "type": "choose|multi|classify|allocate|slider|text", "scene": { "who": "<P01 / N1>", "time": "", "text": "" }, "place": "<S01 / N2>", "props": ["<T01>"], "prompt": "", "options": [ { "id": "", "label": "", "detail": "" } ], "max": 2, "labels": [ { "id": "", "label": "" } ], "total": 100, "unit": "" } ] },
  "expert": { "<step id>": "<见上>" },
  "rubric": [ { "key": "<英文短 key>", "name": "<维度名>", "weight": <数字>, "description": "<看什么>" } ]
}`, model, 'Lab Chapter');

  // 新角色进角色表（同类型的从素材库复用）
  await progress('登记角色', '新的人 / 地方 / 道具进角色表，同类型的从素材库复用');
  const before0 = cast.length;
  const tmp = new Map<string, CastMember>();
  for (const x of readNewCast(p.new_cast)) tmp.set(x.tmp, await addCast(spaceId, cast, x, family));
  const ref = (v: any): CastMember | null => {
    const s = str(v, 40);
    if (!s) return null;
    return tmp.get(s) || cast.find(m => m.code === s) || cast.find(m => m.name === s) || null;
  };

  const sim = cleanSim(p.sim, ch, ref);
  if (sim.steps.length < 3) throw new Error('生成的步骤太少，换个说法再试一次');
  const trace = sanitizeTrace(sim, p.expert || {});

  // 用到但还没有图的人物 / 场景：现画，画完立刻归库（一章最多画 4 张，省钱）
  let drawn = 0;
  const reused = cast.length - before0 - [...tmp.values()].filter(m => !m.asset_id).length;
  if (opts.art !== false && artAvailable()) {
    const need = cast.filter(m => !m.is_self && !m.asset_id && m.kind !== 'prop' && stepsUsing(sim, m).length).slice(0, 4);
    for (const m of need) {
      await progress('画图', `${drawn + 1}/${need.length} · ${m.code} ${m.name}`);
      try { await drawCastAsset(spaceId, m, family); drawn++; } catch (e: any) { console.warn('[lab-chapter] 画图失败', m.code, e?.message); }
    }
  }

  // 美术：封面用第一个有图的场景，没有就沿用第 1 章的封面；人物 / 场景的图由角色表套上去
  const firstPlace = sim.steps.map((s: any) => cast.find(m => m.id === s.place)).find(m => m?.asset?.url);
  const ch1Cover = (day.find(c => c.seq === 1)?.sim as any)?.art?.cover;
  const cover = firstPlace?.asset?.url || ch1Cover;
  const withArt = cover ? applyCastArt({ ...sim, art: { cover, npcs: {}, scenes: {} } }, cast) : sim;

  await progress('保存', '存成草稿，检查后再发布');
  const rubric = normalizeRubric(p.rubric);
  const { error: e3 } = await supabaseAdmin.from('lab_chapters').update({ sim: withArt, expert_trace: trace, ...(rubric ? { rubric } : {}), updated_at: new Date().toISOString() }).eq('id', chapterId);
  if (e3) throw e3;
  if (ch.seq === 1) await supabaseAdmin.from('skill_tasks').update({ sim: withArt }).eq('id', spaceId);
  return { steps: sim.steps.length, newCast: cast.length - before0, drawn, reused: Math.max(0, reused) };
}

/** 不用 sanitizeSim：它会悄悄丢步骤、截到 8 步。这里补齐结构、把角色编号换成角色表里的人名 / id，问题留给工作室的校验去标 */
function cleanSim(raw: any, ch: StudioChapter, ref: (v: any) => CastMember | null): Sim {
  const TYPES = ['choose', 'multi', 'classify', 'allocate', 'slider', 'text'];
  const used = new Set<string>();
  const steps: SimStep[] = (Array.isArray(raw?.steps) ? raw.steps : []).filter((s: any) => TYPES.includes(s?.type) && s.prompt).slice(0, 8).map((s: any, i: number) => {
    let id = String(s.id || `s${i + 1}`).replace(/[^\w-]/g, '').slice(0, 24) || `s${i + 1}`;
    while (used.has(id)) id += 'x';
    used.add(id);
    const st: SimStep = { id, type: s.type, prompt: String(s.prompt) };
    if (s.scene?.text) {
      const who = ref(s.scene.who);
      st.scene = { who: who?.kind === 'person' ? who.name : str(s.scene.who, 20) || '同事', time: s.scene.time ? String(s.scene.time) : undefined, text: String(s.scene.text) };
    }
    const place = ref(s.place);
    if (place?.kind === 'place') st.place = place.id;
    const props = (Array.isArray(s.props) ? s.props : []).map(ref).filter((m: CastMember | null) => m?.kind === 'prop').map((m: CastMember | null) => m!.id);
    if (props.length) st.props = [...new Set(props)] as string[];
    if (Array.isArray(s.options) && s.options.length) st.options = s.options.map((o: any, j: number) => ({ id: String(o.id || String.fromCharCode(97 + j)), label: String(o.label || ''), detail: o.detail ? String(o.detail) : undefined })).filter((o: any) => o.label);
    if (s.type === 'multi') st.max = Math.max(1, Math.min((st.options?.length || 3) - 1, parseInt(s.max) || 2));
    if (s.type === 'classify') st.labels = (Array.isArray(s.labels) ? s.labels : []).map((l: any, j: number) => ({ id: String(l.id || `l${j + 1}`), label: String(l.label || '') })).filter((l: any) => l.label).slice(0, 3);
    if (s.type === 'allocate') { st.total = Math.max(1, Number(s.total) || 100); st.unit = String(s.unit || ''); }
    if (s.type === 'slider') { st.min = 0; st.maxValue = 100; st.unit = String(s.unit || '%'); }
    return st;
  });
  if (steps.length && steps[steps.length - 1].type !== 'text') steps.push({ id: 'final', type: 'text', prompt: '最后，用几句话写下你的结论。' });
  return { title: String(raw?.title || ch.title), intro: String(raw?.intro || ''), steps };
}

/** 评分标准：4–5 个维度，权重归一到 100；不合格就返回 null（评分时用通用四项） */
export function normalizeRubric(raw: any): { key: string; name: string; weight: number; description: string }[] | null {
  let list = (Array.isArray(raw) ? raw : []).map((r: any, i: number) => ({
    key: String(r?.key || `d${i + 1}`).replace(/[^\w-]/g, '').slice(0, 24) || `d${i + 1}`, name: str(r?.name, 20), weight: Math.max(0, Math.round(Number(r?.weight) || 0)), description: str(r?.description, 200),
  })).filter(r => r.name && r.weight > 0).slice(0, 5);
  if (list.length < 3) return null;
  const total = list.reduce((a, r) => a + r.weight, 0);
  list = list.map(r => ({ ...r, weight: Math.round((r.weight / total) * 100) }));
  list[0].weight += 100 - list.reduce((a, r) => a + r.weight, 0);
  return list;
}

/** 给已经写好的章节补评分标准（老章节、手工写的章节） */
export async function draftRubric(ch: StudioChapter, space: any, model: string) {
  const p = await ask(`
给职业体验空间里的一章定评分标准。
${spaceText(space)}
【这一章】${ch.slot || ''} · ${ch.title}
要交代的事：${ch.brief || ''}
开场：${ch.sim?.intro || ''}
步骤：
${(ch.sim?.steps || []).map((s: any, i: number) => `${i + 1}. [${s.type}] ${s.prompt}`).join('\n')}
要求：4 个维度，权重合计 100；每个维度写「看什么」，贴着这一章的内容，能区分会做事的人和会写套话的人。全部用中文。
返回 JSON：{ "rubric": [ { "key": "<英文短 key>", "name": "<维度名>", "weight": <数字>, "description": "<看什么>" } ] }`, model, 'Lab Chapter Rubric');
  return normalizeRubric(p.rubric);
}
