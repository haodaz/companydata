/**
 * 数据部门 2026-10-13 反馈 + 职业实体库起步（迁移 024 跑完后再跑）：
 *   npx tsx scripts/fix-1013.mts            只出报告，不写库
 *   npx tsx scripts/fix-1013.mts --apply    写库
 *   --only registered|jobsource|occ-import|occ-lab|occ-graph|occ-fill|occ-context|occ-tasks   只跑其中一步；--limit N 试跑；--model 换联网模型（默认 gemini-3.8-flash）
 *
 * ① registered：companies.registered_name 工商企业名称。企业名本身就是全称的直接用；中文企业查百度百科词条卡片
 *    （企业词条标题就是工商全称）；英文名是「…Inc. / Ltd. / AG」这类法定名的用英文名。其余等画像流水线补。
 * ② jobsource：jobs.source 按岗位链接 / 来源页的域名归到招聘渠道（北森 / Hotjob / Moka / 飞书 / 官网 / 第三方…）。
 * ③ occ-import：导入数据部门给的职业示例表（--file，默认 ~/Desktop/职业示例数据-10.xlsx），以对方为准。
 * ④ occ-lab：第一批排产 = AI 百业里已有的职业（用户 10-13 定）。从百业空间的岗位名 / 职人角色里归出规范职业名，
 *    去重后逐个联网生成职业档案（只填空），空间里的原始叫法记进别名，方便职业 ↔ 空间互相对上。
 * ⑥ occ-fill：没有别名或没有年限薪资的职业（数据部门导入的那批）跑一遍 AI 补全（只填空），别名补上才对得上岗位库。
 * ⑦ occ-context：每个职业的工作场所 + 工具设备（全集，迁移 026），建 职业 → 场所 / 物品、场所 → 物品 的关联；已经有 AI 关联的职业跳过。
 * ⑧ occ-tasks：典型任务 + 工位的全集（百业已有的任务避开），任务少于 6 个的职业补。
 * ⑤ occ-graph：没有发展图谱 / 没有分地区薪资的职业，补发展图谱（技能树 + 阶梯 + 晋升 / 转型）和分国家 / 中国各地区薪资（迁移 025）。
 */
import fs from 'node:fs';
import os from 'node:os';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { baikeCard } = await import('../src/lib/company-logo');
const { jobSourceOf, JOB_SOURCE_LABELS } = await import('../src/lib/job-fields');
const { importHeaderKey } = await import('../src/lib/occupation-fields');
const { upsertOccupation, upsertSalaries, findOccupation, saveCareerMap, upsertRegionSalaries, mergeOccupations } = await import('../src/lib/occupation-store');
const { researchOccupation, researchCareerGraph, researchRegionSalaries, researchOccupationContext, researchOccupationTasks } = await import('../src/lib/agents/occupation-enrich');
const { saveOccupationContext, saveTasksAndStations } = await import('../src/lib/entity-store');
const { generateCheap } = await import('../src/lib/llm-client');
const { parseJsonLoose } = await import('../src/lib/agents/search-llm');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (k: string) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : '';
const ONLY = arg('--only');
const LIMIT = arg('--limit') ? Number(arg('--limit')) : Infinity;
const MODEL = arg('--model') || 'gemini-3.8-flash';
const run = (k: string) => !ONLY || ONLY === k;
console.log(APPLY ? '▶ 写库' : '▶ 只出报告（加 --apply 写库）');

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x); }));
}

// ── ① 工商企业名称 ──
if (run('registered')) {
  const { data: rows, error } = await selectAll(() => db.from('companies').select('id, name, name_en, brief_name, registered_name, human_locked_fields').order('id'));
  if (error) throw error;
  const todo = rows.filter((r: any) => !r.registered_name && !(r.human_locked_fields || []).includes('registered_name')).slice(0, LIMIT);
  console.log(`\n① 没有工商企业名称的企业 ${todo.length} 家`);
  const CN_FULL = /(有限公司|有限责任公司|股份公司|集团公司|合伙企业|（有限合伙）|\(有限合伙\)|研究院|研究所|事务所)$/;
  const EN_FULL = /\b(Inc\.?|Incorporated|Corp\.?|Corporation|Co\.,? Ltd\.?|Ltd\.?|Limited|PLC|plc|LLC|L\.L\.C\.|AG|SE|S\.A\.|N\.V\.|GmbH|B\.V\.|S\.p\.A\.|K\.K\.|Holdings?)$/;
  const by: Record<string, number> = {};
  let shown = 0;
  await pool(todo, 6, async (r: any) => {
    let v: string | null = null, how = '';
    if (CN_FULL.test(r.name) || EN_FULL.test(r.name)) { v = r.name; how = '企业名即全称'; }
    else if (/[一-龥]/.test(r.name)) {
      const card = await baikeCard([r.name, r.brief_name]);
      if (card && CN_FULL.test(card.title)) { v = card.title; how = '百度百科'; }
    }
    if (!v && r.name_en && EN_FULL.test(r.name_en.trim())) { v = r.name_en.trim(); how = '英文法定名'; }
    if (!v) return;
    by[how] = (by[how] || 0) + 1;
    if (shown++ < 12) console.log(`  #${r.id} ${r.name} → ${v}（${how}）`);
    if (APPLY) await db.from('companies').update({ registered_name: v }).eq('id', r.id);
  });
  console.log(`  补上 ${Object.values(by).reduce((a, b) => a + b, 0)} 家：${JSON.stringify(by)}`);
}

// ── ② 岗位来源 ──
if (run('jobsource')) {
  const { data: rows, error } = await selectAll(() => db.from('jobs').select('id, link, source_url, source').is('source', null).order('id'));
  if (error) throw error;
  const groups = new Map<string, number[]>();
  for (const r of rows.slice(0, LIMIT)) { const s = jobSourceOf(r.link, r.source_url); if (s) groups.set(s, [...(groups.get(s) || []), r.id]); }
  console.log(`\n② 未标来源的岗位 ${rows.length} 条：${Array.from(groups).map(([k, v]) => `${JOB_SOURCE_LABELS[k] || k} ${v.length}`).join('、')}`);
  if (APPLY) for (const [s, ids] of groups) for (let i = 0; i < ids.length; i += 500) {
    const { error } = await db.from('jobs').update({ source: s }).in('id', ids.slice(i, i + 500));
    if (error) console.warn(`  ${s} 写库失败：${error.message}`);
  }
}

// ── ③ 导入职业示例表 ──
if (run('occ-import')) {
  const file = arg('--file') || `${os.homedir()}/Desktop/职业示例数据-10.xlsx`;
  const XLSX = await import('xlsx');
  const wb = XLSX.read(fs.readFileSync(file));
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const keys = (rows[0] || []).map((h: any) => importHeaderKey(String(h)));
  const list = rows.slice(1).filter(r => r.some(c => String(c).trim()) && !/^(必填，)?字段类型/.test(String(r[0])))
    .map(r => Object.fromEntries(keys.map((k, i) => [k, r[i]]).filter(([k]) => k))).filter((o: any) => o.name);
  console.log(`\n③ ${file.split('/').pop()}：${list.length} 个职业（识别列 ${keys.filter(Boolean).length} 个）`);
  for (const o of list) {
    if (!APPLY) { console.log(`  ${o.name} · ${o.career_category} / ${o.career_mid_category} · ${o.recent_year_monthly_salary}`); continue; }
    const r = await upsertOccupation(o, { mode: 'overwrite', source: 'import' });
    console.log(`  ${o.name}：${r.created ? '新建' : `更新 ${r.changed.length} 个字段`}（#${r.id}）`);
  }
}

// ── ④ 百业已有职业排产 ──
if (run('occ-lab')) {
  const { data: spaces } = await selectAll(() => db.from('skill_tasks').select('id, title, jd_snapshot, profile').order('created_at'));
  // 叫法 → 第一次出现的空间场景（「发动机试验工程师」光看名字分不出是汽车还是火箭）
  const scene = new Map<string, string>();
  for (const s of spaces as any[]) for (const x of [s.jd_snapshot?.title, s.profile?.role].filter(Boolean).map((x: string) => x.trim())) if (!scene.has(x)) scene.set(x, s.title);
  // 已经能对上职业库（名称 / 别名）的叫法不再归一：归一是模型做的，每次结果不完全一样，重跑会生出「幼儿教师 / 幼儿园教师」这种重复
  const known: string[] = [];
  for (const x of Array.from(scene.keys())) if (await findOccupation({ name: x })) known.push(x);
  for (const x of known) scene.delete(x);
  if (known.length) console.log(`  ${known.length} 种叫法已对上职业库，跳过`);
  const raw = Array.from(scene.keys());
  if (!raw.length) { console.log('  全部已建档'); }
  console.log(`\n④ 百业空间 ${spaces.length} 个，岗位名 / 职人角色 ${raw.length} 种叫法`);
  // 归一：一条叫法 → 一个规范职业名（中文、通用叫法、不带公司 / 初级 / 校招等修饰）；同一职业的多种叫法归到一起
  const prompt = `下面是一批岗位名 / 职业角色（来自职业体验产品里的虚拟职人）。把它们归成「规范职业名」：
- 规范职业名用中国就业市场通用的职业叫法（参照《职业分类大典》/ 职业百科），如「咖啡师」「焊接工艺工程师」「外科医生」「数据分析师」；
- 去掉公司名、级别（初级 / 助理 / 学徒 / 校招 / 实习）、项目名；
- 一条里写了几个职业（用「/」分隔）时，取它的主职业；明显是同一职业的不同叫法归到同一个规范名；
- 管培生 / 储备干部这类按实际从事的职能归（如「市场营销专员」）；
- 每条后面的「场景」是这个职人所在的体验任务，用来判断行业（如火箭发动机试车 → 火箭发动机试验工程师，不是汽车）。
返回 JSON：{ "items": [ { "raw": 原叫法, "occupation": 规范职业名 } ] }

${raw.map((r, i) => `${i + 1}. ${r}　（场景：${scene.get(r)}）`).join('\n')}`;
  const res = raw.length ? await generateCheap(prompt, MODEL, { jsonMode: true }) : { text: '{"items":[]}' };
  const items: { raw: string; occupation: string }[] = (parseJsonLoose(res.text)?.items || []).filter((x: any) => x?.raw && x?.occupation)
    .map((x: any) => ({ raw: String(x.raw).replace(/\s*[（(]场景：.*$/, '').trim(), occupation: String(x.occupation) }));
  const groups = new Map<string, Set<string>>();
  for (const it of items) groups.set(it.occupation.trim(), new Set([...(groups.get(it.occupation.trim()) || []), it.raw.trim()]));
  const list = Array.from(groups).slice(0, LIMIT);
  console.log(`  归成 ${groups.size} 个职业：`);
  for (const [k, v] of groups) console.log(`    ${k} ← ${Array.from(v).join(' | ')}`);
  if (APPLY) {
    let created = 0, filled = 0, failed = 0;
    const batchId = Date.now();
    await pool(list, 3, async ([name, alias]) => {
      try {
        const existing = await findOccupation({ name });
        if (existing?.intro) { console.log(`  ${name}：已建档，跳过（#${existing.id}）`); return; }
        const r = await researchOccupation(existing || { name, aliases: Array.from(alias) }, MODEL, batchId);
        const fields: Record<string, any> = { ...r.fields, name: existing?.name || name };
        fields.aliases = Array.from(new Set([...(fields.aliases || []), ...Array.from(alias).filter(a => a !== fields.name)]));
        const saved = await upsertOccupation(existing ? { ...fields, external_id: existing.external_id } : fields, { mode: 'fill', source: 'ai', sources: r.sources });
        const sal = await upsertSalaries(saved.id, r.salaries, 'fill');
        if (saved.created) created++; else filled++;
        console.log(`  ${name}：${saved.created ? '新建' : '补全'} ${saved.changed.length} 个字段、${sal} 档薪资（#${saved.id}）`);
      } catch (e: any) { failed++; console.warn(`  ${name} 失败：${e.message}`); }
    });
    console.log(`  新建 ${created}、补全已有 ${filled}、失败 ${failed}`);
  }
}

// ── ⑤ 发展图谱 + 分地区薪资 ──
if (run('occ-graph')) {
  const { data: occ } = await selectAll(() => db.from('occupations').select('id, name, name_lang_en, intro, responsibility, career_map').eq('if_delete', false).order('id'));
  const { data: reg } = await selectAll(() => db.from('occupation_region_salaries').select('occupation_id').eq('if_delete', false).order('id'));
  const hasReg = new Set(reg.map((r: any) => r.occupation_id));
  const todo = occ.filter((o: any) => !o.career_map?.skills?.length || !hasReg.has(o.id)).slice(0, LIMIT);
  console.log(`\n⑤ 缺发展图谱或分地区薪资的职业 ${todo.length} 个`);
  if (APPLY) {
    let g = 0, r = 0, failed = 0;
    const batchId = Date.now();
    await pool(todo, 3, async (o: any) => {
      try {
        const [graph, rows] = await Promise.all([
          o.career_map?.skills?.length ? null : researchCareerGraph(o, MODEL, batchId),
          hasReg.has(o.id) ? [] : researchRegionSalaries(o, MODEL, batchId),
        ]);
        if (graph && await saveCareerMap(o.id, graph, 'fill')) g++;
        const n = await upsertRegionSalaries(o.id, rows as any[], 'fill');
        if (n) r++;
        console.log(`  ${o.name}：${graph ? `图谱 ${graph.skills.length} 技能 / ${graph.ladder.length} 级 / ${graph.next_roles.length} 进阶` : '图谱已有'}、地区薪资 ${n} 条`);
      } catch (e: any) { failed++; console.warn(`  ${o.name} 失败：${e.message}`); }
    });
    console.log(`  图谱 ${g} 个、地区薪资 ${r} 个职业；失败 ${failed}`);
  }
}

// ── ⑥ 补别名 / 年限薪资 ──
if (run('occ-fill')) {
  const { data: occ } = await selectAll(() => db.from('occupations').select('*').eq('if_delete', false).order('id'));
  const { data: sal } = await selectAll(() => db.from('occupation_salaries').select('occupation_id').eq('if_delete', false).order('id'));
  const hasSal = new Set(sal.map((r: any) => r.occupation_id));
  const todo = occ.filter((o: any) => !(o.aliases || []).length || !hasSal.has(o.id)).slice(0, LIMIT);
  console.log(`\n⑥ 缺别名或年限薪资的职业 ${todo.length} 个`);
  if (APPLY) {
    const batchId = Date.now();
    await pool(todo, 3, async (o: any) => {
      try {
        const r = await researchOccupation(o, MODEL, batchId);
        const saved = await upsertOccupation({ ...r.fields, name: o.name, external_id: o.external_id }, { mode: 'fill', source: 'ai', sources: r.sources });
        const n = await upsertSalaries(o.id, r.salaries, 'fill');
        console.log(`  ${o.name}：补 ${saved.changed.join('、') || '无'}；薪资 ${n} 档`);
      } catch (e: any) { console.warn(`  ${o.name} 失败：${e.message}`); }
    });
  }
}

// ── ⑦ 工作场所 + 工具设备 ──
if (run('occ-context')) {
  const { data: occ } = await selectAll(() => db.from('occupations').select('id, name, name_lang_en, responsibility, career_map').eq('if_delete', false).order('id'));
  const { data: ls } = await selectAll(() => db.from('entity_links').select('from_id').eq('from_type', 'occupation').eq('source', 'ai').eq('if_delete', false).order('id'));
  const done = new Set(ls.map((l: any) => l.from_id));
  const todo = occ.filter((o: any) => !done.has(o.id)).slice(0, LIMIT);
  console.log(`\n⑦ 还没有场所与工具的职业 ${todo.length} 个`);
  if (APPLY) {
    const batchId = Date.now();
    await pool(todo, 3, async (o: any) => {
      try {
        const ctx = await researchOccupationContext(o, MODEL, batchId);
        const r = await saveOccupationContext(o.id, ctx);
        console.log(`  ${o.name}：场所 ${r.places}、物品 ${r.items}、新关联 ${r.links}`);
      } catch (e: any) { console.warn(`  ${o.name} 失败：${e.message}`); }
    });
  }
}

// ── ⑧ 典型任务 + 工位（全集）──
if (run('occ-tasks')) {
  const { data: occ } = await selectAll(() => db.from('occupations').select('id, name, responsibility, career_map').eq('if_delete', false).order('id'));
  const { data: ts } = await selectAll(() => db.from('typical_tasks').select('occupation_id, name').eq('if_delete', false).order('id'));
  const byOcc = new Map<number, string[]>();
  for (const t of ts as any[]) byOcc.set(t.occupation_id, [...(byOcc.get(t.occupation_id) || []), t.name]);
  const todo = occ.filter((o: any) => (byOcc.get(o.id) || []).length < 6).slice(0, LIMIT);
  console.log(`\n⑧ 典型任务少于 6 个的职业 ${todo.length} 个`);
  if (APPLY) {
    const batchId = Date.now();
    await pool(todo, 3, async (o: any) => {
      try {
        const { data: ls } = await db.from('entity_links').select('to_type, to_id').eq('from_type', 'occupation').eq('from_id', o.id).in('to_type', ['place', 'item']);
        const ids = (t: string) => (ls || []).filter((l: any) => l.to_type === t).map((l: any) => l.to_id);
        const names = async (table: string, list: number[]) => list.length ? ((await db.from(table).select('name').in('id', list)).data || []).map((r: any) => r.name) : [];
        const r = await researchOccupationTasks(o, MODEL, batchId, { existingTasks: byOcc.get(o.id) || [], places: await names('work_places', ids('place')), items: await names('work_items', ids('item')) });
        const w = await saveTasksAndStations(o.id, r, 'ai');
        console.log(`  ${o.name}：新任务 ${w.tasks}、新工位 ${w.stations}、新关联 ${w.links}`);
      } catch (e: any) { console.warn(`  ${o.name} 失败：${e.message}`); }
    });
  }
}
