/**
 * 职业维度补全 · 答题人模式：不调大模型接口，由一个能自己联网检索的 agent（云端 Claude 会话等）领题、作答、交卷，这里负责解析和写库。
 * 题目和写库口径和 scripts/fix-1013.mts 的 occ-fill / occ-graph / occ-context / occ-tasks 完全一样（同一套 occupation-enrich 提示词与解析）。
 *
 *   npx tsx scripts/agent-research.mts status                       还剩多少题
 *   npx tsx scripts/agent-research.mts next <step> [--n 3] [--ids 566-599,1-68]   领题：每个职业一个文件 agent-work/inbox/<step>-<职业id>.json；--ids 只领这些编号（可写范围）
 *   npx tsx scripts/agent-research.mts save <文件>                  交卷：文件里的 answers 写进库，文件挪到 agent-work/done/
 *   npx tsx scripts/agent-research.mts skip <文件> "<原因>"          这题做不了（查不到可靠资料等），记一笔挪到 agent-work/skipped/
 *   step = fill（别名 / 简介等空字段 + 分年限薪资）| graph（发展图谱 + 各国 / 中国各地薪资）| context（工作场所 + 工具设备）| tasks（典型任务 + 工位）
 *
 * 题目文件：{ step, occupation_id, name, questions: [{ task, prompt }], answers: {} }
 * 作答：按每道题 prompt 里要求的 JSON 结构，把答案填进 answers[task]（是对象，不是字符串）。查不到的字段按 prompt 要求填 null / 省略，**不许编**；
 *       能给出处的都给链接（sources / source_url）。一个职业的几道题都答完再 save。
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（有 .env.local 就从里面读）。
 */
import fs from 'node:fs';
import path from 'node:path';
if (fs.existsSync('.env.local')) for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('缺环境变量 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const E = await import('../src/lib/agents/occupation-enrich');
const { upsertOccupation, upsertSalaries, saveCareerMap, upsertRegionSalaries } = await import('../src/lib/occupation-store');
const { saveOccupationContext, saveTasksAndStations } = await import('../src/lib/entity-store');

const DIR = 'agent-work';
for (const d of ['inbox', 'done', 'skipped']) fs.mkdirSync(path.join(DIR, d), { recursive: true });
const [cmd, a1, a2] = process.argv.slice(2);
const flag = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ''; };
const STEPS = ['fill', 'graph', 'context', 'tasks'] as const;
type Step = typeof STEPS[number];

// ── 每一步还缺的职业（和 fix-1013 的挑法一样） ──
async function todoOf(step: Step): Promise<any[]> {
  if (step === 'fill') {
    const { data: occ } = await selectAll(() => db.from('occupations').select('*').eq('if_delete', false).order('id'));
    const { data: sal } = await selectAll(() => db.from('occupation_salaries').select('occupation_id').eq('if_delete', false).order('id'));
    const has = new Set(sal.map((r: any) => r.occupation_id));
    return occ.filter((o: any) => !(o.aliases || []).length || !has.has(o.id));
  }
  if (step === 'graph') {
    const { data: occ } = await selectAll(() => db.from('occupations').select('id, name, name_lang_en, intro, responsibility, career_map').eq('if_delete', false).order('id'));
    const { data: reg } = await selectAll(() => db.from('occupation_region_salaries').select('occupation_id').eq('if_delete', false).order('id'));
    const has = new Set(reg.map((r: any) => r.occupation_id));
    return occ.filter((o: any) => !o.career_map?.skills?.length || !has.has(o.id)).map((o: any) => ({ ...o, _needGraph: !o.career_map?.skills?.length, _needReg: !has.has(o.id) }));
  }
  if (step === 'context') {
    const { data: occ } = await selectAll(() => db.from('occupations').select('id, name, name_lang_en, responsibility, career_map').eq('if_delete', false).order('id'));
    const { data: ls } = await selectAll(() => db.from('entity_links').select('from_id').eq('from_type', 'occupation').eq('source', 'ai').eq('if_delete', false).order('id'));
    const done = new Set(ls.map((l: any) => l.from_id));
    return occ.filter((o: any) => !done.has(o.id));
  }
  const { data: occ } = await selectAll(() => db.from('occupations').select('id, name, responsibility, career_map').eq('if_delete', false).order('id'));
  const { data: ts } = await selectAll(() => db.from('typical_tasks').select('occupation_id, name').eq('if_delete', false).order('id'));
  const by = new Map<number, string[]>();
  for (const t of ts as any[]) by.set(t.occupation_id, [...(by.get(t.occupation_id) || []), t.name]);
  return occ.filter((o: any) => (by.get(o.id) || []).length < 6).map((o: any) => ({ ...o, _existing: by.get(o.id) || [] }));
}
const idsIn = (sub: string, step: Step) => new Set(fs.readdirSync(path.join(DIR, sub)).filter(f => f.startsWith(`${step}-`)).map(f => Number(f.slice(step.length + 1).replace(/\.json$/, ''))));
const skippedIds = (step: Step) => idsIn('skipped', step);
const inboxIds = (step: Step) => idsIn('inbox', step);

// tasks 步骤要带上这个职业已知的场所 / 物品
async function taskOpts(o: any) {
  const { data: ls } = await db.from('entity_links').select('to_type, to_id').eq('from_type', 'occupation').eq('from_id', o.id).in('to_type', ['place', 'item']);
  const ids = (t: string) => (ls || []).filter((l: any) => l.to_type === t).map((l: any) => l.to_id);
  const names = async (table: string, list: number[]) => list.length ? ((await db.from(table).select('name').in('id', list)).data || []).map((r: any) => r.name) : [];
  return { existingTasks: o._existing || [], places: await names('work_places', ids('place')), items: await names('work_items', ids('item')) };
}

// 跑一遍 occupation-enrich 的函数：answers 为空时只收集题目（钩子返回空对象，函数报空也无所谓）
async function runStep(step: Step, o: any, answers: Record<string, any> | null) {
  const asked: { task: string; prompt: string }[] = [];
  E.setResearchHook(async (prompt, task) => { asked.push({ task, prompt: prompt.trim() }); return answers ? (answers[task] ?? null) : {}; });
  const out: any = {};
  try {
    if (step === 'fill') out.fill = await E.researchOccupation(o, 'agent', 0);
    if (step === 'graph') {
      if (o._needGraph) out.graph = await E.researchCareerGraph(o, 'agent', 0).catch((e: any) => { if (answers) throw e; return null; });
      if (o._needReg) out.reg = await E.researchRegionSalaries(o, 'agent', 0);
    }
    if (step === 'context') out.ctx = await E.researchOccupationContext(o, 'agent', 0);
    if (step === 'tasks') out.tasks = await E.researchOccupationTasks(o, 'agent', 0, await taskOpts(o));
  } catch (e) { if (answers) throw e; }
  finally { E.setResearchHook(null); }
  return { asked, out };
}

if (cmd === 'status') {
  for (const s of STEPS) { const t = await todoOf(s); console.log(`${s.padEnd(8)} 还缺 ${t.length} 个职业（领了没交 ${inboxIds(s).size}，跳过 ${skippedIds(s).size}）`); }
} else if (cmd === 'next') {
  const step = a1 as Step; if (!STEPS.includes(step)) throw new Error(`step 只能是 ${STEPS.join(' / ')}`);
  const n = Number(flag('--n') || 3);
  const skip = new Set([...skippedIds(step), ...inboxIds(step)]);
  const want = flag('--ids') ? new Set(flag('--ids').split(',').flatMap(r => { const [x, y] = r.split('-').map(Number); return y ? Array.from({ length: y - x + 1 }, (_, i) => x + i) : [x]; })) : null;
  const list = (await todoOf(step)).filter(o => !skip.has(o.id) && (!want || want.has(o.id))).slice(0, n);
  if (!list.length) console.log(`${step}：没有要做的了`);
  for (const o of list) {
    const { asked } = await runStep(step, o, null);
    const file = path.join(DIR, 'inbox', `${step}-${o.id}.json`);
    fs.writeFileSync(file, JSON.stringify({ step, occupation_id: o.id, name: o.name, questions: asked, answers: {} }, null, 1));
    console.log(`${file}  ${o.name}：${asked.map(q => q.task).join(' + ')}`);
  }
} else if (cmd === 'save') {
  const doc = JSON.parse(fs.readFileSync(a1, 'utf8'));
  const step = doc.step as Step;
  const tasks = (doc.questions || []).map((q: any) => q.task);
  const missing = tasks.filter((t: string) => doc.answers?.[t] == null);
  if (missing.length) throw new Error(`还没答：${missing.join('、')}（查不到可靠资料就用 skip）`);
  const o = (await todoOf(step)).find(x => x.id === doc.occupation_id);
  if (!o) { console.log(`${doc.name}：这一步已经补过了，不再写`); fs.renameSync(a1, path.join(DIR, 'done', path.basename(a1))); process.exit(0); }
  let out: any;
  try { ({ out } = await runStep(step, o, doc.answers)); }
  catch (e: any) { console.error(`✗ ${doc.name}（${step}）答案不合格：${e.message}——按题目要求补全再 save，确实查不到就 skip`); process.exit(1); }
  let msg = '';
  if (out.fill) {
    const r = out.fill;
    const saved = await upsertOccupation({ ...r.fields, name: o.name, external_id: o.external_id }, { mode: 'fill', source: 'ai', sources: r.sources });
    const n = await upsertSalaries(o.id, r.salaries, 'fill');
    msg = `补 ${saved.changed.join('、') || '无'}；薪资 ${n} 档`;
  }
  if (step === 'graph') {
    const g = out.graph && await saveCareerMap(o.id, out.graph, 'fill');
    const n = out.reg ? await upsertRegionSalaries(o.id, out.reg, 'fill') : 0;
    msg = `${out.graph ? `图谱 ${out.graph.skills.length} 技能 / ${out.graph.ladder.length} 级 / ${out.graph.next_roles.length} 进阶${g ? '' : '（已有，未覆盖）'}` : '图谱已有'}、地区薪资 ${n} 条`;
  }
  if (out.ctx) { const r = await saveOccupationContext(o.id, out.ctx); msg = `场所 ${r.places}、物品 ${r.items}、新关联 ${r.links}`; }
  if (out.tasks) { const w = await saveTasksAndStations(o.id, out.tasks, 'ai'); msg = `新任务 ${w.tasks}、新工位 ${w.stations}、新关联 ${w.links}`; }
  fs.renameSync(a1, path.join(DIR, 'done', path.basename(a1)));
  console.log(`✓ ${doc.name}（${step}）：${msg}`);
} else if (cmd === 'skip') {
  const doc = JSON.parse(fs.readFileSync(a1, 'utf8'));
  doc.skipped = { reason: a2 || '', at: new Date().toISOString() };
  fs.writeFileSync(path.join(DIR, 'skipped', path.basename(a1)), JSON.stringify(doc, null, 1));
  fs.unlinkSync(a1);
  console.log(`跳过 ${doc.name}（${doc.step}）：${a2 || ''}`);
} else {
  console.log('用法：status | next <fill|graph|context|tasks> [--n 3] | save <文件> | skip <文件> "<原因>"');
}
