/**
 * 工作场所库 / 工具设备库的第一批种子：AI 百业（迁移 026 跑完后再跑）。
 *   npx tsx scripts/seed-places-items.mts            只出报告
 *   npx tsx scripts/seed-places-items.mts --apply    写库
 *   --model 归一用的模型（默认便宜模型，失败退 gemini-3.8-flash）
 *
 * ① 读各百业空间角色表 lab_cast 的景（place）/ 道具（prop），加上章节里虚拟工位（lab_chapters.sim.steps[].bench）
 * ② 便宜模型按「规范类型名」归一：场所 → 规范场所名 + 类别 + 室内外；道具 → 规范物品名 + 类型（工具 / 设备 / 耗材 / 软件 / 防护 / 单据 / 证照）
 *    百业里的具体叫法（「B1 女卫生间」「3 号温室 · 午间环控接管」）进别名
 * ③ 写 work_places / work_items（只填空），配图用百业素材库的图（lab_art_assets.url）
 * ④ 空间 → 职业（职业库里名称 / 别名对上空间的岗位名或职人角色），建 职业 → 场所 / 物品 的关联，记下依据的空间
 * ⑤ 典型任务 + 工位：按职业把它在百业里的章节（= 典型任务的演出实例）和虚拟工位（= 工位的可交互实例）交给模型归纳，
 *    同一件事合成一个任务、记下演出它的空间；工位带操作对象（控件）/ 监测量（仪表）/ 百业工位类型。
 *    --only-tasks 只跑这一步。
 * 只读 /lab 的表。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { generateCheap, generateContent } = await import('../src/lib/llm-client');
const { parseJsonLoose } = await import('../src/lib/agents/search-llm');
const { findOccupation } = await import('../src/lib/occupation-store');
const { upsertEntity, upsertLink, saveTasksAndStations } = await import('../src/lib/entity-store');
const { researchOccupationTasks } = await import('../src/lib/agents/occupation-enrich');
const { PLACE_CATEGORY_LABELS, ITEM_KIND_LABELS } = await import('../src/lib/entity-fields');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ONLY_TASKS = argv.includes('--only-tasks');
const MODEL = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : 'gemini-3.8-flash';
console.log(APPLY ? '▶ 写库' : '▶ 只出报告（加 --apply 写库）');

// ── ① 读百业 ──
const { data: spaces } = await selectAll(() => db.from('skill_tasks').select('id, title, jd_snapshot, profile').order('created_at'));
const { data: cast } = await selectAll(() => db.from('lab_cast').select('task_id, kind, name, type_name, note, look, asset_id').in('kind', ['place', 'prop']).order('created_at'));
const { data: chapters } = await selectAll(() => db.from('lab_chapters').select('id, task_id, seq, title, kind, brief, sim').order('id'));
const assetIds = Array.from(new Set(cast.map((c: any) => c.asset_id).filter(Boolean)));
const assetUrl = new Map<string, string>();
for (let i = 0; i < assetIds.length; i += 200) {
  const { data } = await db.from('lab_art_assets').select('id, url').in('id', assetIds.slice(i, i + 200));
  for (const a of data || []) assetUrl.set(a.id, a.url);
}
// 虚拟工位：每个工位一条「设备」候选
// 工位名是任务名（「第一块试板」），真正的设备 / 工具在控件里（「0 喷壶 · 1 毛刷 · 2 镊子」「氧枪高度」「送丝速度」）
const benches: { task_id: string; name: string; surface: string; controls: string }[] = [];
for (const c of chapters as any[]) for (const s of Array.isArray(c.sim?.steps) ? c.sim.steps : []) {
  const b = s?.bench;
  if (!b?.surface) continue;
  const controls = (Array.isArray(b.controls) ? b.controls : []).map((x: any) => [x?.label, x?.hint].filter(Boolean).join('：')).filter(Boolean).join('；').slice(0, 300);
  benches.push({ task_id: c.task_id, name: String(b.name || b.surface), surface: String(b.surface), controls });
}
console.log(`百业空间 ${spaces.length} 个；角色表景 ${cast.filter((c: any) => c.kind === 'place').length} 条、道具 ${cast.filter((c: any) => c.kind === 'prop').length} 条；虚拟工位 ${benches.length} 个`);

// ── 空间 → 职业 ──
const spaceOcc = new Map<string, number>();
for (const s of spaces as any[]) {
  for (const n of [s.jd_snapshot?.title, s.profile?.role, s.jd_snapshot?.career?.profession].filter(Boolean)) {
    const o = await findOccupation({ name: String(n).trim() });
    if (o) { spaceOcc.set(s.id, o.id); break; }
  }
}
console.log(`空间对上职业 ${spaceOcc.size}/${spaces.length}`);

if (!ONLY_TASKS) {
// ── ② 归一 ──
type Cand = { key: string; kind: 'place' | 'prop' | 'bench'; label: string; desc: string; task_ids: Set<string>; asset?: string; surface?: string };
const cands = new Map<string, Cand>();
const add = (kind: Cand['kind'], label: string, desc: string, task: string, asset?: string, surface?: string) => {
  const key = `${kind}:${label}`;
  const c = cands.get(key) || { key, kind, label, desc, task_ids: new Set(), asset, surface };
  c.task_ids.add(task); if (!c.asset && asset) c.asset = asset;
  cands.set(key, c);
};
for (const c of cast as any[]) add(c.kind, (c.type_name || c.name).trim(), [c.name !== c.type_name ? c.name : '', c.note].filter(Boolean).join('；').slice(0, 80), c.task_id, c.asset_id ? assetUrl.get(c.asset_id) : undefined);
for (const b of benches) add('bench', b.name, `虚拟工位（${b.surface}）控件：${b.controls}`, b.task_id, undefined, b.surface);
const list = Array.from(cands.values());

async function normalize(batch: Cand[], what: 'place' | 'item') {
  const opts = what === 'place'
    ? `category 取：${Object.entries(PLACE_CATEGORY_LABELS).map(([k, v]) => `${k}=${v}`).join('; ')}；setting 取 indoor / outdoor / mixed`
    : `kind 取：${Object.entries(ITEM_KIND_LABELS).map(([k, v]) => `${k}=${v.label}`).join('; ')}；category 是细分类别（如「医疗器械」「电工仪表」「厨房设备」「办公软件」）`;
  const prompt = `下面是职业体验产品里出现的${what === 'place' ? '工作场所' : '物品（工具 / 设备 / 耗材 / 单据等，「虚拟工位」是一整套可操作的设备或控制台）'}，每条是「叫法 —— 补充说明」。
「虚拟工位」那条按控件判断它模拟的是哪台主设备 / 控制台 / 主工具（如控件是氧枪高度、底吹流量 → 「转炉操作台」；控件是 喷壶 / 毛刷 / 镊子 → 取主工具「古籍修复工具套装」），只给一个名字。
把它们归成「规范${what === 'place' ? '场所' : '物品'}名」：行业通用叫法，去掉编号、楼层、人名、具体时间（如「B1 女卫生间」→「商场公共卫生间」，「3 号温室 · 午间环控接管」→「温室环境控制系统」，「5 号床交接记录本」→「护理交接记录本」）；
同一类东西归到同一个规范名；太泛、算不上${what === 'place' ? '场所' : '物品'}的（如「人」「情绪」）给 null。
${opts}
返回 JSON：{ "items": [ { "i": 序号, "name": 规范名或 null, ${what === 'place' ? '"category": ..., "setting": ...' : '"kind": ..., "category": ...'} } ] }

${batch.map((c, i) => `${i}. ${c.label}${c.desc ? ` —— ${c.desc}` : ''}`).join('\n')}`;
  const r = await generateCheap(prompt, MODEL, { jsonMode: true });
  return (parseJsonLoose(r.text)?.items || []) as any[];
}

const groups = new Map<string, { what: 'place' | 'item'; name: string; meta: any; members: Cand[] }>();
for (const what of ['place', 'item'] as const) {
  const pool = list.filter(c => what === 'place' ? c.kind === 'place' : c.kind !== 'place');
  for (let i = 0; i < pool.length; i += 60) {
    const batch = pool.slice(i, i + 60);
    const items = await normalize(batch, what).catch(e => { console.warn(`  归一失败：${e.message}`); return []; });
    for (const it of items) {
      const c = batch[Number(it?.i)];
      const name = typeof it?.name === 'string' ? it.name.trim() : '';
      if (!c || !name) continue;
      const g = groups.get(`${what}:${name}`) || { what, name, meta: it, members: [] as Cand[] };
      g.members.push(c);
      groups.set(`${what}:${name}`, g);
    }
    process.stdout.write(`\r  ${what === 'place' ? '场所' : '物品'}归一 ${Math.min(i + 60, pool.length)}/${pool.length}`);
  }
  console.log();
}
// 全局合并：分批归一时同义词在不同批里，放到一起再合一次
for (const what of ['place', 'item'] as const) {
  const names = Array.from(groups.values()).filter(g => g.what === what).map(g => g.name);
  const prompt = `下面是一批${what === 'place' ? '工作场所' : '工具设备 / 物品'}的规范名。只找出「完全是同一种东西、只是叫法不同」的（如「交班记录本」和「护理交接记录本」、「数控车间」和「CNC 加工车间」），合并到最通用的名字。
严格：功能不同、用途不同、行业不同的绝对不合（输液泵 ≠ 扫描仪，氧气瓶 ≠ 应急氧气包，审计底稿 ≠ 收银终端）；拿不准就不合。
返回 JSON：{ "merges": [ { "keep": 保留的名字, "drop": [并进来的名字] } ] }，没有可合并的就返回空数组。

${names.join('\n')}`;
  const r = await generateContent(prompt, MODEL, { jsonMode: true }).catch(() => null);
  let merged = 0;
  for (const m of (r ? parseJsonLoose(r.text)?.merges : []) || []) {
    const keep = groups.get(`${what}:${m?.keep}`);
    if (!keep) continue;
    for (const d of Array.isArray(m.drop) ? m.drop : []) {
      const g = groups.get(`${what}:${d}`);
      if (!g || g === keep) continue;
      keep.members.push(...g.members, { key: '', kind: 'prop', label: g.name, desc: '', task_ids: new Set() });
      groups.delete(`${what}:${d}`); merged++;
      console.log(`    合并 ${d} → ${keep.name}`);
    }
  }
  console.log(`  ${what === 'place' ? '场所' : '物品'}全局合并 ${merged} 个`);
}
const places = Array.from(groups.values()).filter(g => g.what === 'place');
const items = Array.from(groups.values()).filter(g => g.what === 'item');
console.log(`归成场所 ${places.length} 个、物品 ${items.length} 个（其中可在百业体验的设备 ${items.filter(g => g.members.some(m => m.surface)).length} 个）`);
for (const g of [...places.slice(0, 8), ...items.slice(0, 12)]) console.log(`  ${g.what === 'place' ? '场所' : '物品'} ${g.name} ← ${g.members.map(m => m.label).slice(0, 4).join(' | ')}`);

// ── ③④ 写库 + 关联 ──
if (APPLY) {
  let created = 0, links = 0;
  for (const g of groups.values()) {
    const aliases = Array.from(new Set(g.members.map(m => m.label))).filter(a => a !== g.name);
    const asset = g.members.find(m => m.asset)?.asset;
    const surface = g.members.find(m => m.surface)?.surface;
    const raw = g.what === 'place'
      ? { name: g.name, aliases, category: g.meta.category, setting: g.meta.setting, image_url: asset }
      : { name: g.name, aliases, kind: surface ? 'equipment' : g.meta.kind, category: g.meta.category, image_url: asset };
    try {
      const r = await upsertEntity(g.what, raw, { mode: 'fill', source: 'lab', extra: surface ? { lab_bench: surface } : undefined });
      if (r.created) created++;
      // 职业 → 场所 / 物品：每个依据空间对上的职业一条
      const byOcc = new Map<number, string[]>();
      for (const m of g.members) for (const t of m.task_ids) { const o = spaceOcc.get(t); if (o) byOcc.set(o, [...(byOcc.get(o) || []), t]); }
      for (const [occ, tasks] of byOcc) {
        const res = await upsertLink({ from_type: 'occupation', from_id: occ, to_type: g.what, to_id: r.id, role: 'primary', source: 'lab', lab_task_ids: Array.from(new Set(tasks)), confidence: 85,
          note: g.members.map(m => m.desc).filter(Boolean)[0] || null });
        if (res === 'created') links++;
      }
    } catch (e: any) { console.warn(`  ${g.name} 失败：${e.message}`); }
  }
  console.log(`新建实体 ${created} 个、新建关联 ${links} 条`);
}

}

// ── ⑤ 典型任务 + 工位 ──
{
  const byOcc = new Map<number, string[]>();
  for (const [t, o] of spaceOcc) byOcc.set(o, [...(byOcc.get(o) || []), t]);
  const spaceTitle = new Map((spaces as any[]).map(s => [s.id, s.title]));
  console.log(`\n⑤ 典型任务 + 工位：${byOcc.size} 个职业有百业空间`);
  let nT = 0, nS = 0, nL = 0;
  const occs = Array.from(byOcc);
  const q = [...occs];
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let x = q.shift(); x; x = q.shift()) {
      const [occId, tasks] = x;
      const { data: occ } = await db.from('occupations').select('id, name, responsibility, career_map').eq('id', occId).single();
      if (!occ) continue;
      const chs: any[] = [], bns: any[] = [];
      const chRef = new Map<string, string>(), bnRef = new Map<string, any>();
      for (const c of (chapters as any[]).filter(c => tasks.includes(c.task_id))) {
        const ref = `C${chs.length + 1}`; chRef.set(ref, c.task_id);
        const steps = (Array.isArray(c.sim?.steps) ? c.sim.steps : []).map((st: any) => String(st?.prompt || '').slice(0, 50)).filter(Boolean).join(' / ');
        chs.push({ ref, space: spaceTitle.get(c.task_id), title: c.title || c.sim?.title || '', kind: c.kind, brief: c.brief || c.sim?.intro || '', steps });
        for (const st of Array.isArray(c.sim?.steps) ? c.sim.steps : []) {
          const b = st?.bench; if (!b?.controls) continue;
          const bref = `B${bns.length + 1}`;
          bnRef.set(bref, { surface: b.surface || null, task: c.task_id, image: b.scene?.image || null });
          bns.push({ ref: bref, space: spaceTitle.get(c.task_id), name: b.name || '', surface: b.surface || '',
            controls: (b.controls || []).map((k: any) => [k?.label, k?.unit, k?.hint].filter(Boolean).join(' ')).join('；'),
            gauges: (b.gauges || []).map((g: any) => [g?.label, g?.unit, g?.warn ? `警戒 ${g.warn}` : ''].filter(Boolean).join(' ')).join('；') });
        }
      }
      if (!chs.length) continue;
      try {
        const r = await researchOccupationTasks(occ, MODEL, Date.now(), { lab: { chapters: chs, benches: bns } });
        const stations = r.stations.map((st: any) => {
          const bs = (st.bench_refs || []).map((b: string) => bnRef.get(b)).filter(Boolean);
          return { ...st, lab_bench: bs.find((b: any) => b.surface)?.surface || undefined, image_url: bs.find((b: any) => b.image)?.image || undefined };
        });
        const tks = r.tasks.map((t: any) => ({ ...t, lab_task_ids: Array.from(new Set((t.lab_refs || []).map((ref: string) => chRef.get(ref)).filter(Boolean))) }));
        console.log(`  ${occ.name}：章节 ${chs.length} → 任务 ${tks.length}（${tks.map((t: any) => t.name).slice(0, 3).join('、')}…）；工位 ${bns.length} → ${stations.length}（${stations.map((s: any) => s.name).join('、')}）`);
        if (APPLY) { const w = await saveTasksAndStations(occId, { stations, tasks: tks }, 'lab', 85); nT += w.tasks; nS += w.stations; nL += w.links; }
      } catch (e: any) { console.warn(`  ${occ?.name} 失败：${e.message}`); }
    }
  }));
  if (APPLY) console.log(`  新建典型任务 ${nT}、工位 ${nS}、关联 ${nL}`);
}
