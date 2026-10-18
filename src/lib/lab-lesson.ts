/**
 * 跟我学 · 教案（2026-10-18，迁移 034）。
 * 用户：「AI 教学只是把选择题预填了，考核又手忙脚乱，没有静下来一步一步学的办法」。
 * 一章一份教案：每一步「先看什么 → 老手怎么想 → 每个选项对在哪错在哪 → 老手这一步做了什么」；工位那步按老手脚本拆成一个个动作，
 * 每个动作一句「做什么、为什么」，带依据（标准条款 / 老师傅经验 / 工位规则）。
 * 材料只来自：这一章的剧情与题面、老手轨迹（expert_trace）、技能卡（真人老师傅的才算）、工位规则与目标、规则的出处（standard_links）。
 * 不许编造：没有材料支撑的地方写「这一点要问老师傅」。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage, withCost } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { describeStep, type Sim, type SimTrace } from '@/lib/skill-sim';

export interface LessonAction { i: number; say: string; basis?: string | null }
export interface LessonStep {
  look: string; think: string; master: string;
  options?: Record<string, { verdict: 'best' | 'ok' | 'wrong'; note: string }>;
  bench?: { before: string; actions: LessonAction[]; after: string };
}
export interface Lesson { steps: Record<string, LessonStep>; generated_at: string; model: string; version: 1 }

const str = (v: any, n = 400) => String(v ?? '').trim().slice(0, n);

export async function buildLesson(spaceId: string, chapterId: string | null, opts: { model?: string; force?: boolean } = {}): Promise<Lesson> {
  const model = opts.model || 'claude-opus-5-5';   // 教案用 Claude（用户 10-18：「claude 有钱，抓紧用」）
  const { data: space, error } = await supabaseAdmin.from('skill_tasks').select('id, title, profile, jd_snapshot, sim, skill:skills(name, card, source, expert_name, expert_trace)').eq('id', spaceId).single();
  if (error || !space) throw new Error(error?.message || '空间不存在');
  const skill: any = Array.isArray((space as any).skill) ? (space as any).skill[0] : (space as any).skill;
  let chapter: any = null;
  if (chapterId) {
    const { data, error: e2 } = await supabaseAdmin.from('lab_chapters').select('id, title, slot, brief, sim, expert_trace').eq('id', chapterId).single();
    if (e2 || !data) throw new Error(e2?.message || '章节不存在');
    chapter = data;
    // 缓存列（迁移 034）：没跑迁移就当没缓存，每次现算
    const { data: cached } = await supabaseAdmin.from('lab_chapters').select('lesson').eq('id', chapterId).maybeSingle().then(r => r, () => ({ data: null as any }));
    if (cached?.lesson?.version === 1 && !opts.force) return cached.lesson as Lesson;
  }
  const sim: Sim | null = chapter?.sim?.steps?.length ? chapter.sim : (space as any).sim?.steps?.length ? (space as any).sim : null;
  if (!sim) throw new Error('这一章还没有内容');
  const trace: SimTrace = (chapter?.expert_trace && Object.keys(chapter.expert_trace).length ? chapter.expert_trace : null) || skill?.expert_trace || {};
  const why: Record<string, string> = (skill?.expert_trace?._why && typeof skill.expert_trace._why === 'object') ? skill.expert_trace._why : {};
  const { data: links } = await supabaseAdmin.from('standard_links').select('chapter_id, target, basis, clause, evidence, standard:industry_standards(code, title)').eq('space_id', spaceId);
  const basisOf = new Map<string, string>();
  for (const l of links || []) {
    if (chapterId && l.chapter_id && l.chapter_id !== chapterId) continue;
    const std = Array.isArray(l.standard) ? l.standard[0] : l.standard;
    const tag = l.basis === 'standard' ? `${(std as any)?.code || (std as any)?.title || '标准'}${l.clause ? ` ${l.clause}` : ''}` : l.basis === 'expert' ? '老师傅经验' : null;
    if (tag) basisOf.set(String(l.target).split(' · ')[0], `${tag}：${str(l.evidence, 160)}`);
  }
  const role = (space as any).profile?.role || (space as any).jd_snapshot?.title || (space as any).title;
  const realSkill = skill && skill.source !== 'jd-draft' ? skill : null;

  const stepsText = sim.steps.map((s, k) => {
    const lines = [`### 第 ${k + 1} 步 id=${s.id} 题型=${s.type}`];
    if (s.scene) lines.push(`剧情：${s.scene.who}${s.scene.time ? `（${s.scene.time}）` : ''}：${str(s.scene.text, 300)}`);
    lines.push(`题面：${str(s.prompt, 300)}`);
    if (s.options?.length) lines.push('选项：' + s.options.map(o => `[${o.id}] ${o.label}${o.detail ? `（${str(o.detail, 80)}）` : ''}`).join('；'));
    if (s.labels?.length) lines.push('分类：' + s.labels.map(l => `[${l.id}] ${l.label}`).join('；'));
    if (s.type === 'bench' && s.bench) {
      const b = s.bench;
      lines.push(`工位「${b.name}」：${str(b.brief, 200)}`);
      lines.push('控件：' + b.controls.filter(c => !c.hidden).map(c => `[${c.id}] ${c.label}${c.unit ? `（${c.unit}${c.min != null ? ` ${c.min}–${c.max}` : ''}）` : ''}${c.hint ? ` 提示：${str(c.hint, 60)}` : ''}`).join('；'));
      if (b.gauges?.length) lines.push('仪表：' + b.gauges.map(g => `${g.label}（${g.unit}）`).join('、'));
      lines.push('规则：' + b.rules.map(r => `[rule:${r.id}] ${r.severity === 'violation' ? '违规' : '提醒'}「${r.label}」${basisOf.has(`rule:${r.id}`) ? ` ← 依据 ${basisOf.get(`rule:${r.id}`)}` : ''}`).join('；'));
      lines.push('目标：' + b.goals.map(g => `[goal:${g.id}] ${g.label}${basisOf.has(`goal:${g.id}`) ? ` ← 依据 ${basisOf.get(`goal:${g.id}`)}` : ''}`).join('；'));
      const script = [...(b.expertScript || [])].sort((a, c) => a.t - c.t);
      lines.push(script.length ? '老手脚本（按时间）：' + script.map((a, i) => { const c = b.controls.find(x => x.id === a.control); return `#${i} t=${a.t}s ${c?.label || a.control}${c?.kind === 'knob' ? ` → ${a.value}${c.unit || ''}` : c?.kind === 'switch' ? (a.value ? ' 开' : ' 关') : c?.kind === 'path' ? ` 走到 ${a.value}%` : ' 按下'}`; }).join('；') : '老手脚本：没有');
    } else if (trace[s.id] !== undefined) lines.push(`老手这一步的做法：${str(describeStep(s, trace[s.id]), 300)}`);
    else lines.push('老手这一步的做法：（没有记录）');
    if (why[s.id]) lines.push(`建空间时留下的追问：${str(why[s.id], 200)}`);
    return lines.join('\n');
  }).join('\n\n');

  const prompt = `你是「${role}」这个岗位的资深带教，在给一个完全没入行的新人讲解下面这一段工作，让他能静下来一步一步学会。
岗位：${role}。这一段：${chapter ? `${chapter.slot || ''} ${chapter.title}` : sim.title}。
${chapter?.brief ? `这一段要交代的事：${str(chapter.brief, 400)}` : `开场：${str(sim.intro, 400)}`}
${realSkill ? `\n真人老师傅 ${realSkill.expert_name} 的技能卡（可以引用，写作「老师傅说」）：\n规则：${(realSkill.card?.rules || []).slice(0, 12).map((r: string) => `- ${str(r, 120)}`).join('\n')}\n做法：${(realSkill.card?.steps || []).slice(0, 8).map((x: any) => `- ${str(x.title, 40)}：${str(x.detail, 120)}`).join('\n')}\n检查：${(realSkill.card?.checklist || []).slice(0, 8).map((r: string) => `- ${str(r, 100)}`).join('\n')}` : '\n（这个空间还没有真人老师傅的技能卡：只能引用题面、老手轨迹和工位规则的依据）'}

${stepsText}

写法要求（很重要）：
- 只用上面的材料。材料里没有的事实（具体数值、现场习惯、某家公司的做法）一律不写；拿不准就写「这一点要问老师傅」。
- 口语，像师傅带徒弟，不要教科书腔；每句都要落到「看什么、为什么、怎么做」。
- 每一步：look = 动手前先看什么、注意什么（1–2 句）；think = 老手是怎么判断的、为什么这么选（2–3 句，有依据就点名：「标准 xx 要求…」「老师傅说…」）；master = 老手这一步做了什么（一句）。
- 有选项的步骤（choose / multi / drill / classify）：options 里每个选项都给 verdict（best 最该选 / ok 也行 / wrong 不该选）和一句 note（为什么）。老手选了的是 best；分类题按老手的归法；没有老手记录就按题面判断并在 think 里说明「这是我的判断，待老师傅确认」。
- 工位步骤：bench.before = 上手前要看的仪表 / 准备（1–2 句）；bench.actions = 老手脚本每一个动作 #i 一条（i 对应脚本序号，一个都不要漏，顺序照脚本）：say = 「把 xx 调到 xx，因为…」（一句，口语），basis = 这一下依据哪条规则 / 标准 / 老师傅经验（照材料里「依据」原样引用；没有就 null）；bench.after = 做完后怎么确认做对了（看哪个目标 / 仪表）。
只返回 JSON：
{ "steps": { "<step id>": { "look": "", "think": "", "master": "", "options": { "<option id>": { "verdict": "best|ok|wrong", "note": "" } }, "bench": { "before": "", "actions": [ { "i": 0, "say": "", "basis": null } ], "after": "" } } } }`;

  const lesson = await withCost({ space_id: spaceId, chapter_id: chapterId, stage: 'use' }, async () => {
    const res = await generateContent(prompt, model, { jsonMode: true });
    await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Lesson · 跟我学', institution: role, model_id: model, usageMetadata: res.usageMetadata, stage: 'use', space_id: spaceId, chapter_id: chapterId } as any).catch(() => {});
    const p = parseJsonLoose(res.text);
    const out: Lesson = { steps: {}, generated_at: new Date().toISOString(), model, version: 1 };
    for (const s of sim.steps) {
      const x = p?.steps?.[s.id] || {};
      const st: LessonStep = { look: str(x.look, 300), think: str(x.think, 500), master: str(x.master, 200) };
      if (s.options?.length && x.options && typeof x.options === 'object') {
        st.options = {};
        for (const o of s.options) { const v = x.options[o.id]; if (v) st.options[o.id] = { verdict: ['best', 'ok', 'wrong'].includes(v.verdict) ? v.verdict : 'ok', note: str(v.note, 160) }; }
        // 老手选过的一定是 best（材料优先于模型的发挥）
        const tv = trace[s.id];
        const chosen: string[] = s.type === 'choose' ? [tv].filter(Boolean) : Array.isArray(tv) ? tv : [];
        for (const id of chosen) if (st.options[id]) st.options[id].verdict = 'best';
      }
      if (s.type === 'bench' && s.bench) {
        const script = [...(s.bench.expertScript || [])].sort((a, c) => a.t - c.t);
        const given = new Map<number, any>((Array.isArray(x.bench?.actions) ? x.bench.actions : []).map((a: any) => [parseInt(a.i), a]));
        st.bench = {
          before: str(x.bench?.before, 300),
          actions: script.map((a, i) => { const c = s.bench!.controls.find(k => k.id === a.control); const g = given.get(i); return { i, say: str(g?.say, 200) || `把「${c?.label || a.control}」${c?.kind === 'knob' ? `调到 ${a.value}${c.unit || ''}` : c?.kind === 'switch' ? (a.value ? '打开' : '关掉') : c?.kind === 'path' ? `走到 ${a.value}%` : '按下'}`, basis: g?.basis ? str(g.basis, 160) : null }; }),
          after: str(x.bench?.after, 300),
        };
      }
      out.steps[s.id] = st;
    }
    return out;
  });
  if (chapterId) await supabaseAdmin.from('lab_chapters').update({ lesson, lesson_at: lesson.generated_at }).eq('id', chapterId).then(r => { if (r.error && !/lesson/.test(r.error.message)) console.warn('[lesson] 缓存失败', r.error.message); });
  return lesson;
}
