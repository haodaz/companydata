/**
 * 整理角色表（迁移 016 回填之后跑一次；以后新生成的空间也可以再跑）。
 *   npx tsx scripts/lab-normalize-cast.mts --dry [--limit 3]     只看方案
 *   npx tsx scripts/lab-normalize-cast.mts [--space <id>]         落库
 *
 * 老数据里台词的「说话人」常写成一句话（「老周通过对讲机提醒你」「你和带教前辈老周」），回填后同一个人变成好几行；
 * 场景只有「场景」「办公室」这种临时名。便宜模型逐个空间：
 *   - 说话人归并成真人（老周 / 领班），「系统提示」「项目群聊」这类不算人物，从角色表拿掉（台词里照旧显示）
 *   - 场景按画面描述起名 + 规范类型名
 * 然后：合并角色表、重新编号、各章台词里的称呼改成规范名（立绘的键跟着改）、素材库补标题 / 类型。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { generateCheap, generateContent } = await import('../src/lib/llm-client');
const { parseJsonLoose } = await import('../src/lib/agents/search-llm');
const { logTokenUsage } = await import('../src/lib/token-logger');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(x => x.length));
const DRY = !!args.dry;
const LIMIT = parseInt(args.limit || '999');
// 默认 luna：归并人物要读懂「带教师姐张姐（压低声音对你说）」这种称呼，便宜模型会把真人当成物件
const MODEL = args.model || 'gpt-5.6-luna';

// 明显不是人的说话人：群聊、面板、看板、广播、系统、「你自己」、动作描写……只有这些才从角色表拿掉，拿不准的一律留着
const NOT_PERSON = /群聊|协同群|群\b|群（|面板|看板|广播|系统|提示|向导|操作间|对讲机$|^你$|^你自己$|^我$|眼神|全团|弹窗|旁白/;
const clip = (s: any, n: number) => String(s || '').replace(/\s+/g, ' ').slice(0, n);
const scenePrompt = (p: string) => clip(String(p || '').replace(/^半写实插画风格，正面平视的固定机位，/, '').replace(/明亮，没有人物.*$/, ''), 120);

let q = supabaseAdmin.from('skill_tasks').select('id, title, profile, jd_snapshot').order('created_at');
if (args.space) q = q.eq('id', args.space);
const { data: spaces } = await q;
let done = 0, cost = 0;

for (const t of (spaces || []).slice(0, LIMIT)) {
  const [{ data: cast }, { data: chs }] = await Promise.all([
    supabaseAdmin.from('lab_cast').select('*, asset:lab_art_assets(id, code, url, prompt, title, type_name, slot)').eq('task_id', t.id).order('code'),
    supabaseAdmin.from('lab_chapters').select('id, seq, sim').eq('task_id', t.id).order('seq'),
  ]);
  const persons = (cast || []).filter((m: any) => m.kind === 'person' && !m.is_self);
  const places = (cast || []).filter((m: any) => m.kind === 'place');
  if (!persons.length && !places.length) continue;
  const steps = (chs || []).flatMap((c: any) => (c.sim?.steps || []).map((s: any) => ({ ...s, _c: c })));
  const prof = (t as any).jd_snapshot?.career?.profession || (t as any).jd_snapshot?.title || t.title;

  const prompt = `
这是职业体验空间「${prof}」（数字职人 ${(t as any).profile?.name || ''} · ${(t as any).profile?.role || ''}）的角色表，要整理成干净的「人物」和「场景」。

一、台词里的说话人（编号、原样称呼；★ 表示有立绘；冒号后是他说的一句话示例）：
${persons.map((m: any) => `- ${m.code}「${m.name}」${m.asset?.url ? ' ★' : ''}：${clip(steps.find((s: any) => s.scene?.who === m.name)?.scene?.text, 60)}`).join('\n')}

二、场景（编号、现在的临时名、画面描述、在这里发生的事）：
${places.map((m: any) => `- ${m.code}「${m.name}」画面：${scenePrompt(m.asset?.prompt) || '（无描述）'}；事：${clip(steps.find((s: any) => s.place === m.id || m.asset?.url && (s._c.sim?.art?.scenes?.[s.id] === m.asset.url))?.prompt, 50)}`).join('\n')}

要求：
1. persons：把指同一个真人（或同一组人，如「陈先生与陈太太」= 一组「陈先生夫妇」）的说话人归成一个。
   name 用最短的真名 / 称呼（老周、领班、陈先生夫妇、张大爷的女儿）；「你和老周」「老周通过对讲机提醒你」都归到「老周」。
   type_name 是通用角色类型，给素材库复用用，2–8 个字：带教师傅、领班、同事、顾客、患者家属、主管、质检员、客户、乘客…
   note 一句：这个人是谁、和主角什么关系。
   规律：职务称呼也是人（检验员、器械护士、生产经理、出品督导 Yuki 都是人物，保留）；括号里的动作 / 方式去掉（「张姐（压低声音对你说）」→ 张姐，「李哥（语音发来）」→ 李哥）；
   「你和老周」「新娘 & 你」「对讲机 & 伴娘」归到那个人（老周 / 新娘 / 伴娘）；「林小姐的微信对话框」→ 林小姐；两个真人一起出场（「儿科医生与护士长」）可以作为一组。raw 列出归进来的说话人编号（如 ["P01","P03"]，每个编号只出现一次）。
2. not_person：不是人物的说话人（系统提示、项目群聊、广播、操作面板、看板、界面、「你」「你自己」、全团游客这种群体背景、动作描写），列出编号。拿不准就当人物。
3. places：每个场景给 name（具体的地方，如「B1 女卫生间」「3 号机床操作间」，同一空间内不重名）和 type_name（通用场景类型，给素材库复用用：商场公共卫生间、数控车间、医院病房、写字楼办公室…）。
   只有现在的临时名以「工位：」开头的（设备工位底图）才保留「工位：」前缀；其他场景的 name 不要加这个前缀。type_name 写所在的场景类型。
返回 JSON：{ "persons": [ { "name": "", "type_name": "", "note": "", "raw": ["P01"] } ], "not_person": ["P02"], "places": [ { "code": "S01", "name": "", "type_name": "" } ] }`;

  let p: any;
  try {
    const r = MODEL === 'cheap' ? await generateCheap(prompt, 'qwen-plus', { jsonMode: true }) : { ...(await generateContent(prompt, MODEL, { jsonMode: true })), model: MODEL };
    await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Lab Normalize Cast', institution: '', model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
    p = parseJsonLoose(r.text);
  } catch (e: any) { console.log(`❌ ${prof}：${e.message}`); continue; }

  if (args.debug) console.log(JSON.stringify(p.persons), JSON.stringify(p.not_person), persons.map((m: any) => m.name));
  const selfName = (cast || []).find((m: any) => m.is_self)?.name;
  const byCode = new Map(persons.map((m: any) => [m.code, m]));
  const pick = (r: any) => byCode.get(String(r).match(/P\d+/)?.[0] || '');
  const groups: { name: string; type_name: string; note: string; rows: any[] }[] = [];
  const seen = new Set<string>();
  for (const g of Array.isArray(p.persons) ? p.persons : []) {
    const name = clip(g.name, 30);
    const cand = (Array.isArray(g.raw) ? g.raw : []).map(pick).filter((m: any) => m && !seen.has(m.id));
    // 只合并「原称呼里含新名字」的（带教导师 老周 → 老周）；只有一个人的组，不像物件才允许改名
    const rows = cand.filter((m: any) => m.name.includes(name) || (cand.length === 1 && !NOT_PERSON.test(m.name)));
    if (!rows.length || !name || name === selfName) continue;
    rows.forEach((m: any) => seen.add(m.id));
    groups.push({ name, type_name: clip(g.type_name, 30), note: clip(g.note, 120), rows });
  }
  // 同名的组合并
  const merged = new Map<string, typeof groups[number]>();
  for (const g of groups) { const x = merged.get(g.name); if (x) x.rows.push(...g.rows); else merged.set(g.name, g); }
  const dropIds = new Set((Array.isArray(p.not_person) ? p.not_person : []).map(pick).filter(Boolean).map((m: any) => m.id));
  const drop = persons.filter((m: any) => !seen.has(m.id) && NOT_PERSON.test(m.name));
  void dropIds;
  const placeNames = new Map<string, { name: string; type_name: string }>();
  const usedNames = new Set<string>();
  for (const x of Array.isArray(p.places) ? p.places : []) {
    const m = places.find((y: any) => y.code === x.code); if (!m) continue;
    let name = clip(x.name, 40) || m.name; if (m.name.startsWith('工位：') && !name.startsWith('工位：')) name = m.name;
    if (!m.name.startsWith('工位：')) name = name.replace(/^工位[：:]\s*/, '');
    while (usedNames.has(name)) name += '·2';
    usedNames.add(name); placeNames.set(m.id, { name, type_name: clip(x.type_name, 30) });
  }
  const rename = new Map<string, string>(); // 原说话人 → 规范名
  for (const g of merged.values()) for (const m of g.rows) rename.set(m.name, g.name);

  console.log(`\n■ ${prof}（${(t as any).profile?.name || ''}）人物 ${persons.length} → ${merged.size}，拿掉 ${drop.length}，场景 ${placeNames.size}/${places.length}`);
  for (const g of merged.values()) console.log(`  ${g.name}［${g.type_name}］← ${g.rows.map((m: any) => m.name).join(' | ')}`);
  if (drop.length) console.log(`  不算人物：${drop.map((m: any) => m.name).join('、')}`);
  for (const [id, x] of placeNames) console.log(`  ${places.find((m: any) => m.id === id)?.code} ${places.find((m: any) => m.id === id)?.name} → ${x.name}［${x.type_name}］`);
  if (DRY) { done++; continue; }

  // ── 落库 ──
  // 1. 先把要动的人物改成临时编号 / 名字，避开唯一约束
  for (const m of [...persons, ...places]) await supabaseAdmin.from('lab_cast').update({ code: `tmp-${m.id.slice(0, 8)}`, name: `tmp-${m.id}` }).eq('id', m.id);
  // 2. 人物：每组留一行（有立绘的优先），其余删掉
  let n = 0;
  const keepers: any[] = [];
  for (const g of merged.values()) {
    const keep = g.rows.find((m: any) => m.asset_id) || g.rows[0];
    keepers.push({ keep, g });
    for (const m of g.rows) if (m.id !== keep.id) await supabaseAdmin.from('lab_cast').delete().eq('id', m.id);
  }
  for (const m of drop) await supabaseAdmin.from('lab_cast').delete().eq('id', m.id);
  // 没被归组、也没被拿掉的，原样保留
  const untouched = persons.filter((m: any) => !seen.has(m.id) && !drop.includes(m));
  const ordered = [...keepers.map(x => ({ id: x.keep.id, name: x.g.name, type_name: x.g.type_name, note: x.g.note, code0: x.keep.code, asset_id: x.keep.asset_id })), ...untouched.map((m: any) => ({ id: m.id, name: m.name, type_name: m.type_name, note: m.note, code0: m.code, asset_id: m.asset_id }))]
    .sort((a, b) => a.code0.localeCompare(b.code0));
  for (const x of ordered) {
    n++;
    await supabaseAdmin.from('lab_cast').update({ code: `P${String(n).padStart(2, '0')}`, name: x.name, type_name: x.type_name, note: x.note, updated_at: new Date().toISOString() }).eq('id', x.id);
    if (x.asset_id && x.type_name) {
      const a = (cast || []).find((m: any) => m.id === x.id)?.asset;
      const patch: any = {};
      if (!a?.title || rename.has(a.title) || a.title === a.slot) patch.title = x.type_name;
      if (!a?.type_name || a.type_name === a.slot) patch.type_name = x.type_name;
      if (Object.keys(patch).length) await supabaseAdmin.from('lab_art_assets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', x.asset_id);
    }
  }
  // 3. 场景
  for (const m of places) {
    const x = placeNames.get(m.id) || { name: m.name, type_name: m.type_name };
    await supabaseAdmin.from('lab_cast').update({ code: m.code, name: x.name, type_name: x.type_name || m.type_name, updated_at: new Date().toISOString() }).eq('id', m.id);
    if (m.asset_id && placeNames.has(m.id)) await supabaseAdmin.from('lab_art_assets').update({ title: x.name.replace(/^工位：/, ''), type_name: x.type_name, updated_at: new Date().toISOString() }).eq('id', m.asset_id);
  }
  // 4. 各章台词里的称呼、立绘的键
  for (const c of chs || []) {
    const sim = c.sim || {};
    let hit = false;
    for (const s of sim.steps || []) if (s.scene?.who && rename.has(s.scene.who) && rename.get(s.scene.who) !== s.scene.who) { s.scene.who = rename.get(s.scene.who); hit = true; }
    if (sim.art?.npcs) {
      const npcs: Record<string, string> = {};
      for (const [k, v] of Object.entries(sim.art.npcs)) { const nk = rename.get(k) || k; if (nk !== k) hit = true; if (!npcs[nk]) npcs[nk] = v as string; }
      sim.art.npcs = npcs;
    }
    if (!hit) continue;
    await supabaseAdmin.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', c.id);
    if (c.seq === 1) await supabaseAdmin.from('skill_tasks').update({ sim }).eq('id', t.id);
  }
  done++;
}
console.log(`\n=== 整理完 ${done} 个空间${DRY ? '（只看方案，没落库）' : ''}`);
