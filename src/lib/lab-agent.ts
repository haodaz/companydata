/**
 * 百业工厂 · 聊着出空间（D，2026-11-06，照真活「聊着出任务」）：AI 全包，中间边聊边改，还能替人办事（上下架、评审、邀请老师傅）。
 * 一句大白话开头 → locate 定位（粒度用 ask_user 让人点）→ 一次问一件补生成要求（给谁看 / 要多深 / 考核多难…，没说的先定默认再复述）
 * → create_space（前端发起构建、轮询进度，做完自动接一句话回来）→ 排一天 / 写章节 → 评审 → 按评审改 / 局部改（提案卡片在对话里采纳）→ 上架。
 * 工具都只动自己生成的空间（管理员全部）。跑在 lib/ws/agent 的 runTurn 上（同一套多家模型、流式、ask_user 停下等人）。
 */
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin as db } from '@/lib/supabase';
import type { AgentKit } from '@/lib/ws/agent';
import { locateAnchor } from '@/lib/lab-anchor';
import { cleanAnchor, cleanSpec, hasSpec, LEVEL_ORDER, levelText, PRESETS } from '@/lib/lab-spec';
import { startJob } from '@/lib/lab-jobs';
import { buildChapter, buildDay } from '@/lib/agents/lab-chapters';
import { reviseOpening, reviseStep, logRevision } from '@/lib/lab-revise';
import { fixByReview, latestReview, reviewBlocks, reviewSpace } from '@/lib/lab-followup';

type User = { email: string; role: string };
const MODEL = () => process.env.NEXT_PUBLIC_LAB_GEN_MODEL || 'gpt-5.6-luna';
const s = (v: any, n = 300) => (v == null ? '' : String(v)).slice(0, n);

export const LAB_TOOLS: Anthropic.Tool[] = [
  { name: 'ask_user', description: '需要用户决定时用：一句话的问题 + 2–4 个短选项（不带编号；用户也可以自己打字）。选粒度、确认生成要求、要不要上架、要不要按评审改，用它。', input_schema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question', 'options'] } },
  { name: 'locate', description: '把用户说的职业 / 岗位 / 「公司 + 岗位」/ 学科定位到一个东西：返回职业库候选、岗位库里的真实 JD、AI 给的三种粒度（common 常见叫法 / role 具体岗位 / niche 细分方向）。拿到后用 ask_user 让用户选一个（给高中生一般选常见叫法）。', input_schema: { type: 'object', properties: { q: { type: 'string' }, mode: { type: 'string', enum: ['career', 'discipline'] } }, required: ['q'] } },
  { name: 'create_space', description: '生成一个新空间（约 2–4 分钟，界面上会显示进度，做完会自动告诉你空间编号）。spec.form（级别）必须是用户点选或原话说出的，没说就先 ask_user 让他点。anchor 来自 locate 的结果；spec 是生成要求（都是自然语言）。调用前先用 ask_user 复述一遍「做什么 + 给谁看 + 多深 + 多难」让用户确认。', input_schema: { type: 'object', properties: {
    anchor: { type: 'object', properties: { kind: { type: 'string', enum: ['occupation', 'job', 'career', 'discipline'] }, label: { type: 'string' }, occupation_id: { type: 'number' }, job_id: { type: 'number' }, company: { type: 'string' }, from: { type: 'string', description: '用户最初的原话' } }, required: ['kind', 'label'] },
    spec: { type: 'object', properties: { preset: { type: 'string' }, form: { type: 'string', enum: ['career', 'training', 'assess', 'certify'], description: '级别：career 生涯体验（只发体验证书）/ training 模拟实践（专业学生练手艺）/ assess 职业虚拟考核（新人上岗的真实一天）/ certify 资质考核（对照国家职业技能标准，限时、有一票否决）' }, audience: { type: 'string' }, depth: { type: 'string' }, difficulty: { type: 'string' }, must: { type: 'string' }, avoid: { type: 'string' } } },
  }, required: ['anchor', 'spec'] } },
  { name: 'my_spaces', description: '列出用户生成的空间（状态、章节、作答、平均分）。用户说「我那个……空间」先用它找 space_id。', input_schema: { type: 'object', properties: { q: { type: 'string' } } } },
  { name: 'space_detail', description: '看一个空间：生成要求、每一章（时段 / 标题 / 状态 / 锁定 / 步数 / 每步题干）、最近一次 AI 评审的待办、正在跑的任务。改之前先看。', input_schema: { type: 'object', properties: { space_id: { type: 'string' } }, required: ['space_id'] } },
  { name: 'build_day', description: '排一天骨架：6–8 格（时段、标题、要交代的事），不出题。新空间生成好后一般先做这个。后台约 1 分钟。', input_schema: { type: 'object', properties: { space_id: { type: 'string' }, hint: { type: 'string' } }, required: ['space_id'] } },
  { name: 'write_chapters', description: '给章节写故事线和示范答案（按生成要求）。chapter_ids 不传 = 所有没写过、没锁定的草稿格。后台顺序跑，每章约 1 分钟。', input_schema: { type: 'object', properties: { space_id: { type: 'string' }, chapter_ids: { type: 'array', items: { type: 'string' } }, hint: { type: 'string' } }, required: ['space_id'] } },
  { name: 'revise', description: '局部改：改某一章的某一步（target=step，step_no 从 1 数）或标题和开场（target=opening）。出一份提案，对话里给用户看改前改后，他点「采纳」才写进去。工位（虚拟操作台）请让用户到工作室里「重新设计」。', input_schema: { type: 'object', properties: { space_id: { type: 'string' }, chapter_id: { type: 'string' }, target: { type: 'string', enum: ['step', 'opening'] }, step_no: { type: 'number' }, instruction: { type: 'string' } }, required: ['space_id', 'chapter_id', 'target', 'instruction'] } },
  { name: 'review', description: 'AI 评审这个空间（约半分钟）：按平台规则 + 生成要求打分，列出具体到哪一章哪一步的待改问题。', input_schema: { type: 'object', properties: { space_id: { type: 'string' } }, required: ['space_id'] } },
  { name: 'fix_by_review', description: '一键按评审改：把最近一次评审里的待办（不传 todo_ids = 全部）交给 AI，有问题、没锁定的章按建议重写成草稿，改完再评一遍。先 ask_user 确认。', input_schema: { type: 'object', properties: { space_id: { type: 'string' }, todo_ids: { type: 'array', items: { type: 'string' } } }, required: ['space_id'] } },
  { name: 'set_spec', description: '改这个空间的生成要求（只填要改的项）。改完提醒用户：已写好的章节不会自己变，要不要按新要求重写。', input_schema: { type: 'object', properties: { space_id: { type: 'string' }, audience: { type: 'string' }, depth: { type: 'string' }, difficulty: { type: 'string' }, must: { type: 'string' }, avoid: { type: 'string' } }, required: ['space_id'] } },
  { name: 'publish_chapters', description: '把章节发布（体验端能玩到）。chapter_ids 不传 = 所有写好了的草稿章。', input_schema: { type: 'object', properties: { space_id: { type: 'string' }, chapter_ids: { type: 'array', items: { type: 'string' } } }, required: ['space_id'] } },
  { name: 'set_listing', description: '上架（体验百业里能看到）/ 下架 / 退回草稿。上架前先 ask_user 确认，且至少一章已发布。', input_schema: { type: 'object', properties: { space_id: { type: 'string' }, listing: { type: 'string', enum: ['listed', 'unlisted', 'draft'] } }, required: ['space_id', 'listing'] } },
  { name: 'invite_master', description: '生成一条「请老师傅来示范」的链接（有效期内老师傅点开就能示范、纠正做法，不用登录）。', input_schema: { type: 'object', properties: { space_id: { type: 'string' } }, required: ['space_id'] } },
  { name: 'jobs', description: '看这个空间正在跑 / 刚跑完的后台任务（排骨架、写章节、按评审改）。用户问「好了没」时用。', input_schema: { type: 'object', properties: { space_id: { type: 'string' } }, required: ['space_id'] } },
  { name: 'open_panel', description: '在右边打开这个空间：tab = day 一天 / spec 生成要求 / review 评审 / plays 作答 / stats 分析 / preview 体验端预览。', input_schema: { type: 'object', properties: { space_id: { type: 'string' }, tab: { type: 'string', enum: ['day', 'spec', 'review', 'plays', 'stats', 'preview', 'cast'] } }, required: ['space_id'] } },
];

async function own(user: User, id: string) {
  const { data } = await db.from('skill_tasks').select('id, title, created_by, profile, jd_snapshot').eq('id', id).maybeSingle();
  if (!data) throw new Error('找不到这个空间');
  if (user.role !== 'admin' && data.created_by !== user.email) throw new Error('只能管理自己生成的空间');
  return data as any;
}
const nameOf = (sp: any) => (sp.profile?.name ? `${sp.profile.name} · ${sp.profile.role || ''}` : sp.jd_snapshot?.anchor?.label || sp.title);
const panel = (id: string, title: string, tab = 'day') => ({ kind: 'lab_panel', space_id: id, title, url: tab === 'preview' ? `/lab/${id}?m=test` : `/lab/studio/${id}${tab === 'day' ? '' : `?tab=${tab}`}` });

async function run(name: string, input: any, user: User): Promise<{ result: any; ui?: any; label: string }> {
  switch (name) {
    case 'locate': {
      const q = s(input.q, 60).trim(); const mode = input.mode === 'discipline' ? 'discipline' : 'career';
      const r = await locateAnchor(q, mode);
      return { label: `定位「${q}」：${r.levels.length} 种粒度 · 职业库 ${r.occupations.length} · 真实 JD ${r.jobs.length}`, result: { q, mode,
        levels: r.levels.map(l => ({ tier: l.tier, name: l.name, why: l.why, occupation_id: l.occupation?.id || null })),
        occupations: r.occupations.map(o => ({ id: o.id, name: o.name, category: o.category })), jobs: r.jobs.slice(0, 5).map((j: any) => ({ id: j.id, name: j.name, company: j.company })) } };
    }
    case 'create_space': {
      const anchor = cleanAnchor(input.anchor); if (!anchor) throw new Error('anchor 不对：要有 kind 和 label');
      const spec = cleanSpec(input.spec || {});
      // 级别必须由人定（用户：难度让人选）；模型从「职业体验」自己推出来的不算，先让他点
      if (!spec.form) throw new Error(`还没定级别：先用 ask_user 让用户在这四个里点一个：${LEVEL_ORDER.map(f => levelText(f)).join(' / ')}`);
      const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      return { label: `开始生成「${anchor.label}」的空间（约 2–4 分钟）`, ui: { kind: 'lab_build', buildId, title: anchor.label, payload: { anchor, spec, draft: true, buildId, model: MODEL() } }, result: { started: true, note: '已经开始生成，做完会自动发来空间编号；在那之前别再发起生成，也别跟用户提编号。' } };
    }
    case 'my_spaces': {
      let q = db.from('skill_tasks').select('id, title, profile, jd_snapshot, created_at').order('created_at', { ascending: false }).limit(200);
      if (user.role !== 'admin') q = q.eq('created_by', user.email);
      const { data } = await q;
      const kw = s(input.q, 30).trim();
      const rows = (data || []).map((x: any) => ({ space_id: x.id, name: nameOf(x), title: x.title, preset: x.jd_snapshot?.spec?.preset || null, created_at: x.created_at })).filter(x => !kw || `${x.name} ${x.title}`.includes(kw)).slice(0, 20);
      return { label: `找到 ${rows.length} 个空间`, result: rows };
    }
    case 'space_detail': {
      const sp = await own(user, input.space_id);
      const [{ data: chs }, review, { data: jobs }] = await Promise.all([
        db.from('lab_chapters').select('id, seq, slot, title, kind, status, locked, brief, sim').eq('task_id', sp.id).order('seq'),
        latestReview(sp.id),
        db.from('lab_jobs').select('kind, status, phase, detail, updated_at').eq('task_id', sp.id).order('updated_at', { ascending: false }).limit(3),
      ]);
      return { label: `看了「${nameOf(sp)}」`, ui: panel(sp.id, nameOf(sp)), result: {
        space_id: sp.id, name: nameOf(sp), anchor: sp.jd_snapshot?.anchor || null, spec: sp.jd_snapshot?.spec ? { ...sp.jd_snapshot.spec, refs: (sp.jd_snapshot.spec.refs || []).map((r: any) => r.name) } : null,
        chapters: (chs || []).map((c: any) => ({ chapter_id: c.id, slot: c.slot, title: c.title, kind: c.kind, status: c.status, locked: c.locked, brief: s(c.brief, 120), steps: (c.sim?.steps || []).map((x: any, i: number) => `${i + 1}.[${x.type}] ${s(x.prompt, 70)}`) })),
        review: review ? { summary: review.summary, worst: review.worst, todos: review.todos.map(t => ({ id: t.id, where: `${t.chapter}${t.step_no ? ` 第${t.step_no}步` : ''}`, problem: t.problem, fix: t.fix })) } : null,
        jobs: jobs || [] } };
    }
    case 'build_day': {
      const sp = await own(user, input.space_id);
      const job = await startJob(sp.id, null, 'build_day', async progress => { const r = await buildDay(sp.id, MODEL(), s(input.hint, 500), progress); return `新增 ${r.added} 格 · 角色表新增 ${r.cast} 项`; });
      return { label: job.already ? '骨架已经在排了' : '开始排一天骨架（约 1 分钟）', ui: { ...panel(sp.id, nameOf(sp)), job_id: job.id, job: '排一天骨架' }, result: { job_id: job.id, already: job.already } };
    }
    case 'write_chapters': {
      const sp = await own(user, input.space_id);
      const { data: chs } = await db.from('lab_chapters').select('id, title, status, locked, sim').eq('task_id', sp.id).order('seq');
      const want: string[] = Array.isArray(input.chapter_ids) ? input.chapter_ids : [];
      const todo = (chs || []).filter((c: any) => !c.locked && (want.length ? want.includes(c.id) : !(c.sim?.steps || []).length));
      if (!todo.length) return { label: '没有要写的章', result: { written: 0, note: want.length ? '这些章锁定了或不存在' : '没有空的草稿格；要重写某章就传 chapter_ids' } };
      const job = await startJob(sp.id, null, 'rewrite_all', async progress => {
        let n = 0; for (const c of todo) { await progress(`写章节 ${n + 1} / ${todo.length}`, c.title); await buildChapter(sp.id, c.id, MODEL(), s(input.hint, 500), { art: true }, () => {}); n++; }
        return `写了 ${n} 章`;
      });
      return { label: `开始写 ${todo.length} 章（每章约 1 分钟）`, ui: { ...panel(sp.id, nameOf(sp)), job_id: job.id, job: `写 ${todo.length} 章` }, result: { job_id: job.id, chapters: todo.map((c: any) => c.title) } };
    }
    case 'revise': {
      const sp = await own(user, input.space_id);
      const instruction = s(input.instruction, 500);
      if (input.target === 'opening') {
        const r = await reviseOpening(sp.id, input.chapter_id, instruction, MODEL());
        const rid = await logRevision({ task_id: sp.id, chapter_id: input.chapter_id, target: 'opening', instruction, before: r.before, after: r.after, note: r.note, created_by: user.email });
        return { label: `出了一版开场：${r.note}`, ui: { kind: 'lab_revision', space_id: sp.id, revision_id: rid, apply: { chapter_id: input.chapter_id, target: 'opening', after: r.after }, before: r.before, after: r.after, note: r.note, target: 'opening' }, result: { proposed: true, note: r.note, after: r.after } };
      }
      const { data: ch } = await db.from('lab_chapters').select('sim').eq('id', input.chapter_id).eq('task_id', sp.id).maybeSingle();
      const st = (ch?.sim?.steps || [])[(Number(input.step_no) || 1) - 1];
      if (!st) throw new Error('这一章没有这一步');
      if (st.type === 'bench') throw new Error('这一步是虚拟工位：请用户在工作室里点「✦ 改」重新设计（要在模拟器里跑通，1–3 分钟）');
      const r = await reviseStep(sp.id, input.chapter_id, st.id, instruction, MODEL());
      const rid = await logRevision({ task_id: sp.id, chapter_id: input.chapter_id, target: `step:${st.id}`, instruction, before: r.before, after: r.after, note: r.note, created_by: user.email });
      return { label: `出了一版第 ${input.step_no} 步：${r.note}`, ui: { kind: 'lab_revision', space_id: sp.id, revision_id: rid, apply: { chapter_id: input.chapter_id, target: 'step', step_id: st.id, after: r.after }, before: r.before, after: r.after, note: r.note, target: 'step' }, result: { proposed: true, note: r.note, prompt: r.after.step.prompt } };
    }
    case 'review': {
      const sp = await own(user, input.space_id);
      const r = await reviewSpace(sp.id);
      const musts = r.todos.filter(t => t.severity !== 'nice').length;
      return { label: r.pass ? `评审完：达标（最低 ${r.worst} 分）${r.todos.length ? `，${r.todos.length} 条可以更好` : ''}` : `评审完：最低 ${r.worst} 分，${musts} 条必须改${r.todos.length - musts ? `、${r.todos.length - musts} 条可以更好` : ''}`, ui: panel(sp.id, nameOf(sp), 'review'), result: { pass: !!r.pass, summary: r.summary, scores: r.items.map(i => `${i.label} ${i.score}`), todos: r.todos.map(t => ({ id: t.id, severity: t.severity || 'must', where: `${t.chapter}${t.step_no ? ` 第${t.step_no}步` : ''}`, target: t.target, problem: t.problem, fix: t.fix })) } };
    }
    case 'fix_by_review': {
      const sp = await own(user, input.space_id);
      const rv = await latestReview(sp.id); if (!rv?.todos.length) throw new Error('没有评审待办，先 review');
      const ids: string[] = Array.isArray(input.todo_ids) ? input.todo_ids : [];
      const todos = ids.length ? rv.todos.filter(t => ids.includes(t.id)) : rv.todos;
      const job = await startJob(sp.id, null, 'fix_review', progress => fixByReview(sp.id, todos, MODEL(), progress));
      return { label: `开始按评审改 ${todos.length} 条`, ui: { ...panel(sp.id, nameOf(sp)), job_id: job.id, job: `按评审改 ${todos.length} 条` }, result: { job_id: job.id } };
    }
    case 'set_spec': {
      const sp = await own(user, input.space_id);
      const cur = sp.jd_snapshot?.spec || {};
      const next = cleanSpec({ ...cur, ...Object.fromEntries(['audience', 'depth', 'difficulty', 'must', 'avoid'].filter(k => typeof input[k] === 'string').map(k => [k, input[k]])) });
      await db.from('skill_tasks').update({ jd_snapshot: { ...(sp.jd_snapshot || {}), spec: hasSpec(next) ? next : undefined } }).eq('id', sp.id);
      return { label: '改好了生成要求', ui: panel(sp.id, nameOf(sp), 'spec'), result: { spec: { ...next, refs: undefined } } };
    }
    case 'publish_chapters': {
      const sp = await own(user, input.space_id);
      const { data: chs } = await db.from('lab_chapters').select('id, title, status, sim, updated_at').eq('task_id', sp.id);
      const want: string[] = Array.isArray(input.chapter_ids) ? input.chapter_ids : [];
      const cand = (chs || []).filter((c: any) => c.status !== 'published' && (c.sim?.steps || []).length && (!want.length || want.includes(c.id)));
      const blocked = await reviewBlocks(sp.id, cand);   // 评审「必须改」挡发布
      const todo = cand.filter((c: any) => !blocked.has(c.id));
      if (todo.length) await db.from('lab_chapters').update({ status: 'published', updated_at: new Date().toISOString() }).in('id', todo.map((c: any) => c.id));
      const held = cand.filter((c: any) => blocked.has(c.id)).map((c: any) => ({ title: c.title, must: blocked.get(c.id)!.map(t => t.problem) }));
      return { label: `发布了 ${todo.length} 章${held.length ? `，${held.length} 章有必须改的没发` : ''}`, result: { published: todo.map((c: any) => c.title), ...(held.length ? { held, note: '这几章评审里还有必须改的，改完（或按评审改）再发布' } : {}) } };
    }
    case 'set_listing': {
      const sp = await own(user, input.space_id);
      if (input.listing === 'listed') { const { count } = await db.from('lab_chapters').select('id', { count: 'exact', head: true }).eq('task_id', sp.id).eq('status', 'published'); if (!count) throw new Error('还没有已发布的章节，先 publish_chapters'); }
      const { error } = await db.from('skill_tasks').update({ listing: input.listing, ...(input.listing === 'listed' ? { listed_at: new Date().toISOString() } : {}) }).eq('id', sp.id);
      if (error) throw new Error(/listing/.test(error.message) ? '上架状态还没开通（迁移 065）' : error.message);
      return { label: input.listing === 'listed' ? `「${nameOf(sp)}」已上架` : input.listing === 'unlisted' ? '已下架' : '已退回草稿', result: { ok: true } };
    }
    case 'invite_master': {
      const sp = await own(user, input.space_id);
      // 链接要带签名和站点域名：交给前端调 /api/lab/spaces/[id]/invite 生成并显示（对话里出一张卡片）
      return { label: '生成邀请老师傅的链接', ui: { kind: 'lab_invite', space_id: sp.id, title: nameOf(sp) }, result: { ok: true, note: '链接显示在对话里的卡片上，14 天内有效' } };
    }
    case 'jobs': {
      const sp = await own(user, input.space_id);
      const { data } = await db.from('lab_jobs').select('kind, status, phase, detail, error, updated_at').eq('task_id', sp.id).order('updated_at', { ascending: false }).limit(5);
      return { label: (data || []).some((j: any) => j.status === 'running') ? '还在跑' : '没有在跑的任务', result: data || [] };
    }
    case 'open_panel': {
      const sp = await own(user, input.space_id);
      return { label: '在右边打开了', ui: panel(sp.id, nameOf(sp), input.tab || 'day'), result: { opened: true } };
    }
  }
  throw new Error(`不认识的工具 ${name}`);
}

function systemPrompt(email: string) {
  return `你是「AI 百业 · 百业工厂」的助理，帮用户（${email}）生成和管理职业模拟空间：一个空间 = 一位数字职人的一整天，按时段分章，每章几步题，有的章有动手的虚拟工位。
用户只需要说清楚要什么，生成、修改、评审、上架这些活你来办；关键决定用 ask_user 让他点。

出一个新空间：
1. 用户第一句往往只说一句（「给高中生做一个程序员的生涯体验」）。从这句话里能推出来的先记下，缺的一次只问一件，别让他填表。
2. locate 定位，用 ask_user 让他在粒度里选（问题一句话，选项写名字，如「程序员（常见叫法）」「后端开发工程师」「SRE 工程师」）。给高中生 / 生涯体验默认推荐常见叫法。
3. 级别：用户原话里明说了四个级别之一（「生涯体验」「模拟实践 / 实训」「职业虚拟考核 / 上岗考核」「资质考核 / 考证」）才直接定；「职业体验」「了解一下」「给高中生做一个」这类不算说了级别，**一定先 ask_user 让他点**（这是 locate 之后的第一个问题），选项照抄这四个（由浅到深，括号里是证书）：${LEVEL_ORDER.map(f => `「${levelText(f)}」`).join('')}，按受众把最合适的放第一个。别解释每一级内部怎么排。
   生成要求：给谁看、要多深、考核多难最重要；必须有 / 不要的问一句就行。没说的按受众和级别先定默认（预设可参考：${PRESETS.map(p => `「${p.label}」`).join('')}），然后用 ask_user 复述一行确认：做什么｜级别｜给谁看｜多深｜多难｜必须有 / 不要，选项「就这样生成」「改一下」。
4. create_space。做完会自动发来一句话告诉你空间编号，接着建议：排一天骨架（build_day）→ 写各章（write_chapters）→ 评审（review）。一步一步来，每步做完说一句结果和下一步，问他要不要继续（ask_user）。
   build_day / write_chapters / fix_by_review 是后台任务：发起后说一句就停，别催别查；做完会自动发来「「…」做完了：…」，收到再接着下一步（写完章节就直接 review，不用再问）。
改：
- 用户说「第二章太难」「这一步换个场景」：先 space_detail 看清楚是哪一章哪一步，再 revise 出提案（对话里会显示改前改后，用户点采纳才写进去），别自己说「已改好」。
- 整章不满意：write_chapters 传 chapter_ids 和 hint 重写。工位（虚拟操作台）的修改请用户到工作室点「✦ 改」。
- 生成要求变了：set_spec，然后问要不要按新要求重写（write_chapters 传没锁定的章）。
- review 出来的待办分「必须改」（must，挡发布）和「可以更好」（nice）。达标（pass）= 没有必须改的，就直接建议发布，「可以更好」的提一句让他决定。没达标就问「一条条改还是一键改」：一键用 fix_by_review（默认只传 must 的 todo_ids，他要连 nice 一起改再全传）。一条条改时每条用 revise 出提案；用户点了采纳 / 不要，会自动发来一句，收到就接着下一条。
- 工位（target=bench）的问题一键改不了：直接告诉他「这条要到工作室这一章的工位上点 ✦ 改 → 重新设计」，不要说成改好了；一键改返回「没有能一键改的」时，照实说。
上架：先确认章节都写好了（publish_chapters 发布章节），ask_user 确认后 set_listing listed。
回答简短，用户看得到右边的空间；不要把工具返回的长内容原样念出来。
说话的禁忌（11-06 国内版验收说漏过「space_id=437f…」「等前端通知完成后」）：
- 不说任何编号（空间 / 章节 / 待办的 id、uuid），只说空间名和「第几章」「考核3」这种人看得懂的叫法；编号只在调用工具时用。
- 不说工具名、参数名、字段名（locate、create_space、build_day、spec、form、todo_ids 这类），不说「前端 / 后端 / 接口 / 轮询 / 后台任务」：用大白话说你在做什么（「我先排一天」「在写第 3 章」「写好了会自动告诉我」）。工具报错也换成一句人话。`;
}

export function labChatKit(user: User): AgentKit {
  return { system: systemPrompt(user.email), tools: LAB_TOOLS, run: (n, i) => run(n, i, user) as any, org: 'AI 百业', task: '百业工厂 · 聊着出空间' };
}
