/**
 * 实验方法层（2026-11-02）：仪器 / 试剂 ↔ 方法 ↔ 学科 / 百业科研空间。分四步，每步结果先落本地 JSON，可中断续跑：
 *   --taxonomy   按大类请 Claude 定方法清单（参考科研产品库里真实的产品名分布）→ scripts/data/research-methods.json
 *   --guides     每个方法写操作指南（典型实验、步骤、常见坑、安全、训练的本事）→ 同一个 JSON（已写过的跳过）
 *   --classify   科研产品逐批归到方法 + 补适用学科 / 应用场景（千问，20 条一批）→ scripts/data/research-product-methods.json
 *   --load       写库（要先跑迁移 058）：research_methods upsert；产品 methods / 空的学科 / 场景回填；
 *                方法的通用仪器进百业工具设备库 work_items 并挂 method→item 关联
 *   npx tsx --env-file=.env.local scripts/research-methods.mts --taxonomy|--guides|--classify|--load [--methods-only] [--limit=N]
 * 模型：方法清单和指南 Claude 优先（千问兜底）；产品分类量大用千问（公司付）。并发 3。
 */
import fs from 'fs';
import { supabaseAdmin as db } from '../src/lib/supabase';
import { askJson } from '../src/lib/work/generator';
import { withCost } from '../src/lib/token-logger';
import { upsertEntity, upsertLink } from '../src/lib/entity-store';

const DIR = 'scripts/data';
const MF = `${DIR}/research-methods.json`, PF = `${DIR}/research-product-methods.json`;
fs.mkdirSync(DIR, { recursive: true });
const readJson = (f: string, d: any) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const save = (f: string, v: any) => fs.writeFileSync(f, JSON.stringify(v, null, 1));
const arg = (k: string) => process.argv.includes(`--${k}`);
const limit = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;
const S = (v: any, n = 200) => String(v ?? '').trim().slice(0, n);

const FIELDS = [
  { field: '生命科学', hint: '细胞与分子生物学、生化、微生物、蛋白与抗体、组学、动植物实验' },
  { field: '医学与药学', hint: '临床检验、病理、药物分析、药理毒理、医学影像研究、制剂' },
  { field: '化学与材料', hint: '分析化学（色谱、质谱、光谱、电化学、热分析）、合成与制备、材料表征、电池与能源材料' },
  { field: '物理与工程', hint: '光学与激光、显微成像、真空与低温、电子测量、力学与物性测试、计量、半导体工艺' },
  { field: '地球与环境', hint: '水质与大气监测、土壤、海洋、地质勘探、气象、食品与环境安全检测' },
  { field: '计算与数据', hint: '科研计算（HPC / GPU）、实验数据处理与统计、仿真、实验室信息管理' },
];

type Method = { key: string; name: string; name_en?: string; aliases?: string[]; field: string; disciplines?: string; summary?: string; level?: string; generic_instruments?: string[];
  typical_experiments?: { name: string; goal: string }[]; steps?: { title: string; detail: string }[]; pitfalls?: { symptom: string; cause: string; check: string }[]; safety?: string; skills?: { name: string; why: string }[]; model?: string };

async function allProducts(cols: string) {
  const out: any[] = [];
  for (let f = 0; ; f += 1000) { const { data } = await db.from('research_products').select(cols).eq('if_delete', false).order('id').range(f, f + 999); if (!data?.length) break; out.push(...data); }
  return out;
}
async function pool<T>(list: T[], n: number, fn: (x: T, i: number) => Promise<void>) {
  const q = list.map((x, i) => [x, i] as const);
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const [x, i] = q.shift()!; await fn(x, i); } }));
}

// ── 1. 方法清单 ──
if (arg('taxonomy')) {
  const prods = await allProducts('name, category, type');
  const byCat: Record<string, string[]> = {};
  for (const p of prods) { const k = `${p.type}/${p.category || '未分类'}`; (byCat[k] ||= []).push(p.name); }
  const sample = Object.entries(byCat).sort((a, b) => b[1].length - a[1].length).map(([k, ns]) => `${k}（${ns.length} 条）：${Array.from(new Set(ns)).slice(0, 40).join('、')}`).join('\n');
  const have: Method[] = readJson(MF, []);
  for (const F of FIELDS) {
    if (have.some(m => m.field === F.field)) { console.log(`跳过 ${F.field}（已有）`); continue; }
    const { parsed: p, model } = await withCost({ tool_name: 'lab', task_name: '实验方法 · 定清单', stage: 'build' } as any, () => askJson(`你在给一个「科研实验方法」实体库定清单。这个库连接两头：一头是科研仪器 / 试剂产品库（下面是真实产品名，按类别抽样），一头是研究生 / 博士 / 博士后要学的实验手艺和学科。
现在只定「${F.field}」这一大类（参考范围：${F.hint}）。
## 产品库抽样（类型/类别（条数）：产品名）
${sample.slice(0, 14000)}
要求：
- 一个方法 = 研究生能说「我会做 XX」的一类实验手艺，粒度像「细胞培养」「高效液相色谱（HPLC）」「蛋白免疫印迹（Western blot）」「电化学阻抗谱（EIS）」「激光共聚焦显微成像」；不要太粗（「分析化学」）也不要太细（「某品牌某型号操作」）。
- 这一大类给 14–22 个，优先产品库里真有仪器 / 试剂支撑的，也要覆盖这个领域博士训练里最常用的。和别的大类重复的（比如质谱既在化学也在生命科学）只放在最主要的那一类。
- key：英文小写 + 下划线，全库唯一（如 hplc、western_blot、cell_culture）。
- disciplines：适用学科（教育部一级学科名，中文分号隔开，3–6 个）。
- level：入门 / 进阶 / 专精（入门 = 本科高年级或研一就要会；进阶 = 博士阶段；专精 = 平台工程师 / 专门方向）。
- generic_instruments：用到的通用仪器 / 关键耗材名（不带品牌型号，3–6 个，如「生物安全柜」「CO₂ 培养箱」「倒置显微镜」）。
- summary：一两句原理和用来干什么，说人话。
只返回 JSON：{ "methods": [ { "key": "", "name": "", "name_en": "", "aliases": [], "disciplines": "", "level": "", "generic_instruments": [], "summary": "" } ] }`, 'claude-opus-5-5', '实验方法 · 定清单'));
    const keys = new Set(have.map(m => m.key));
    const add = (Array.isArray(p?.methods) ? p.methods : []).map((m: any) => ({ key: S(m.key, 40).toLowerCase().replace(/[^a-z0-9_]/g, '_'), name: S(m.name, 40), name_en: S(m.name_en, 80), aliases: (m.aliases || []).map((a: any) => S(a, 40)).filter(Boolean).slice(0, 5), field: F.field, disciplines: S(m.disciplines, 120), level: S(m.level, 4), generic_instruments: (m.generic_instruments || []).map((a: any) => S(a, 30)).filter(Boolean).slice(0, 6), summary: S(m.summary, 200), model }))
      .filter((m: Method) => m.key && m.name && !keys.has(m.key));
    have.push(...add); save(MF, have);
    console.log(`${F.field}：${add.length} 个（${model}）—— ${add.map((m: Method) => m.name).join('、')}`);
  }
  console.log(`共 ${have.length} 个方法 → ${MF}`);
}

// ── 2. 操作指南 ──
if (arg('guides')) {
  const ms: Method[] = readJson(MF, []);
  // 没写过的、或写得不全的（坑少于 4 个 / 步骤少于 6 步，多半是输出被截断）重写
  const todo = ms.filter(m => (m.steps?.length || 0) < 6 || (m.pitfalls?.length || 0) < 4).slice(0, limit);
  let done = 0;
  await pool(todo, 3, async m => {
    try {
      const { parsed: p } = await withCost({ tool_name: 'lab', task_name: '实验方法 · 操作指南', stage: 'build' } as any, () => askJson(`你在给研究生写一份实验方法的操作指南，会用在模拟实验台和带教里。方法：「${m.name}」（${m.name_en || ''}），${m.summary || ''}。用到：${(m.generic_instruments || []).join('、')}。
写通用、经得起老师傅检查的实验常识，不编具体品牌、型号、文献和数字指标（需要数字时写常见范围并说「以仪器说明书 / 实验室 SOP 为准」）。全部中文，说人话。
1. typical_experiments：3 个典型实验（name + goal 一句）。
2. steps：标准流程 6–10 步（title 短，detail 一两句：要点和为什么）。
3. pitfalls：新手最常踩的 5–7 个坑，每个写 symptom（看到什么现象）、cause（常见原因）、check（怎么判断 / 怎么处理）——这是模拟台面出「异常」的素材，要具体。
4. safety：安全要点一段（个人防护、危险源、废弃物）。
5. skills：练的是哪 3–4 个本事（name + why 一句，比如「判断数据可不可信」「无菌意识」）。
只返回 JSON：{ "typical_experiments": [], "steps": [], "pitfalls": [], "safety": "", "skills": [] }`, 'claude-sonnet-5-5', '实验方法 · 操作指南'));
      const arr = (x: any) => Array.isArray(x) ? x : [];
      m.typical_experiments = arr(p.typical_experiments).slice(0, 4).map((x: any) => ({ name: S(x?.name, 40), goal: S(x?.goal, 120) })).filter((x: any) => x.name);
      m.steps = arr(p.steps).slice(0, 12).map((x: any) => ({ title: S(x?.title, 30), detail: S(x?.detail, 200) })).filter((x: any) => x.title);
      m.pitfalls = arr(p.pitfalls).slice(0, 8).map((x: any) => ({ symptom: S(x?.symptom, 100), cause: S(x?.cause, 120), check: S(x?.check, 160) })).filter((x: any) => x.symptom);
      m.safety = S(p.safety, 400);
      m.skills = arr(p.skills).slice(0, 5).map((x: any) => ({ name: S(x?.name, 20), why: S(x?.why, 100) })).filter((x: any) => x.name);
      save(MF, ms);
    } catch (e: any) { console.log(`  ✗ ${m.name}：${String(e?.message).slice(0, 80)}`); }
    if (++done % 10 === 0) console.log(`指南 ${done}/${todo.length}`);
  });
  console.log(`指南完成：${ms.filter(m => m.steps?.length).length}/${ms.length}`);
}

// ── 3. 产品归方法 ──
if (arg('classify')) {
  const ms: Method[] = readJson(MF, []);
  if (!ms.length) { console.error('先跑 --taxonomy'); process.exit(1); }
  const res: Record<string, { methods: string[]; disciplines: string; applications: string }> = readJson(PF, {});
  const prods = (await allProducts('id, name, type, category, labels, description')).filter(p => !res[p.id]).slice(0, limit);
  const batches: any[][] = []; for (let i = 0; i < prods.length; i += 20) batches.push(prods.slice(i, i + 20));
  const menu = ms.map(m => `${m.key}=${m.name}`).join('；');
  const keys = new Set(ms.map(m => m.key));
  let done = 0, failed = 0; const t0 = Date.now();
  await pool(batches, 3, async b => {
    try {
      const { parsed: p } = await withCost({ tool_name: 'lab', task_name: '实验方法 · 产品归类', stage: 'batch' } as any, () => askJson(`把下面的科研产品归到实验方法上，并补适用学科和应用场景。只根据产品名和描述判断，拿不准就少写，不要硬凑。
## 方法清单（key=名称）
${menu}
## 产品
${b.map(x => `#${x.id} ${x.name}（${x.type}/${x.category || '—'}）${S(x.labels, 60)} ${S(String(x.description || '').replace(/<[^>]+>/g, ''), 160)}`).join('\n')}
每个产品：methods 是 0–3 个方法 key（通用耗材如移液枪头可以挂多个最常用的；和清单都不沾边就空数组）；disciplines 是 1–4 个教育部一级学科名（中文分号隔开）；applications 是 1–3 个应用场景短语（中文分号隔开，如「细胞培养；药物筛选」）。
只返回 JSON：{ "items": [ { "id": 0, "methods": [], "disciplines": "", "applications": "" } ] }`, 'qwen3.7-plus', '实验方法 · 产品归类'));
      // 模型有时把列表叫别的名字、编号带「#」：放宽解析；一条都没对上算失败（别静默跳过）
      const list = Array.isArray(p) ? p : Array.isArray(p?.items) ? p.items : (Object.values(p || {}).find(v => Array.isArray(v)) as any[]) || [];
      let got = 0;
      for (const it of list) {
        const id = Number(String(it?.id ?? '').replace(/[^\d]/g, '')); if (!b.some(x => x.id === id)) continue; got++;
        res[id] = { methods: (Array.isArray(it.methods) ? it.methods : []).map((k: any) => String(k)).filter((k: string) => keys.has(k)).slice(0, 3), disciplines: S(it.disciplines, 80), applications: S(it.applications, 80) };
      }
      save(PF, res);
      if (!got) throw new Error(`回来的 JSON 对不上编号：${JSON.stringify(p).slice(0, 160)}`);
    } catch (e: any) { failed++; console.log(`  ✗ 一批失败：${String(e?.message).slice(0, 80)}`); }
    if (++done % 25 === 0) console.log(`[${done}/${batches.length} 批] ${Math.round((Date.now() - t0) / 60000)} 分钟`);
  });
  const vals = Object.values(res);
  console.log(`归类完成：${vals.length} 条，挂上方法的 ${vals.filter(v => v.methods.length).length}，失败 ${failed} 批`);
}

// ── 4. 写库 ──
if (arg('load')) {
  const ms: Method[] = readJson(MF, []);
  const res: Record<string, { methods: string[]; disciplines: string; applications: string }> = readJson(PF, {});
  const { error: te } = await db.from('research_methods').select('id').limit(1);
  if (te) { console.error('还没有 research_methods 表，先跑迁移 058'); process.exit(1); }
  // 产品回填：methods 直接写；学科 / 场景只填空的、不动人工锁定的
  // --methods-only：只更新方法（重写过指南时用），不重刷一万条产品
  const prods = arg('methods-only') ? [] : await allProducts('id, disciplines, applications, human_locked_fields');
  const count: Record<string, number> = {};
  let pn = 0;
  await pool(prods.filter(p => res[p.id]), 4, async p => {
    const r = res[p.id]; const lock = new Set(p.human_locked_fields || []);
    const semi = (x: string) => x.split(/[；;，,、]/).map(y => y.trim()).filter(Boolean).join('；');   // 和数据部门同口径：中文分号
    const patch: Record<string, any> = { methods: r.methods.join(',') || null };
    if (!p.disciplines && r.disciplines && !lock.has('disciplines')) patch.disciplines = semi(r.disciplines);
    if (!p.applications && r.applications && !lock.has('applications')) patch.applications = semi(r.applications);
    await db.from('research_products').update(patch).eq('id', p.id);
    for (const k of r.methods) count[k] = (count[k] || 0) + 1;
    if (++pn % 1000 === 0) console.log(`产品回填 ${pn}`);
  });
  let items = 0, links = 0;
  for (const m of ms) {
    const row = { key: m.key, name: m.name, name_en: m.name_en || null, aliases: m.aliases || [], field: m.field, disciplines: m.disciplines || null, summary: m.summary || null, level: m.level || null,
      generic_instruments: m.generic_instruments || [], typical_experiments: m.typical_experiments || [], steps: m.steps || [], pitfalls: m.pitfalls || [], safety: m.safety || null, skills: m.skills || [],
      ...(arg('methods-only') ? {} : { product_count: count[m.key] || 0 }), source: 'AI 生成（方法清单参考科研产品库；操作指南为通用实验常识，待审核）', ai_sources: { at: new Date().toISOString(), model: m.model || null }, updated_at: new Date().toISOString() };
    const { data: ex } = await db.from('research_methods').select('id, human_locked_fields').eq('key', m.key).maybeSingle();
    let id: number;
    if (ex) { const lock = new Set<string>(ex.human_locked_fields || []); const patch = Object.fromEntries(Object.entries(row).filter(([k]) => !lock.has(k))); await db.from('research_methods').update(patch).eq('id', ex.id); id = ex.id; }
    else { const { data, error } = await db.from('research_methods').insert(row).select('id').single(); if (error) { console.log(`  ✗ ${m.name}：${error.message}`); continue; } id = data.id; }
    // 通用仪器 → 百业工具设备库（只填空），挂 method→item
    for (const g of m.generic_instruments || []) {
      try {
        const r = await upsertEntity('item', { name: g, kind: 'equipment', usage: `${m.name}：${m.summary || ''}`.slice(0, 200) }, { mode: 'fill', source: `实验方法 · ${m.name}` });
        if (r.created) items++;
        if (await upsertLink({ from_type: 'method', from_id: id, to_type: 'item', to_id: r.id, role: 'primary', source: '实验方法', confidence: 70 }) === 'created') links++;
      } catch (e: any) { console.log(`  ✗ ${m.name} / ${g}：${String(e?.message).slice(0, 60)}`); }
    }
  }
  console.log(`写库完成：方法 ${ms.length}，产品回填 ${pn}，新建工具设备 ${items}，方法→设备关联 ${links}`);
}
