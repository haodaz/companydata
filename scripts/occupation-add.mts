/**
 * 按名单新建职业（职业查询同一套：联网生成画像 + 年限薪资，待审核；库里已有的跳过），建完把相关岗位重新关联一遍职业。
 *   npx tsx scripts/occupation-add.mts --model qwen-plus --names reports/occupation-adds-1018.json [--par 4]
 * 名单格式：[{ "name": "数字 IC 验证工程师", "aliases": ["芯片验证工程师"], "titles": ["数字验证工程师"] }]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { researchOccupation } = await import('@/lib/agents/occupation-enrich');
const { findOccupation, upsertOccupation, upsertSalaries } = await import('@/lib/occupation-store');
const { tagAndSave } = await import('@/lib/job-tagging');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', process.env.CHEAP_MODEL || '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const list: { name: string; aliases?: string[]; titles?: string[] }[] = JSON.parse(fs.readFileSync(opt('names'), 'utf8'));
const PAR = Number(opt('par', '4'));

let i = 0, created = 0;
const made: string[] = [];
await Promise.all(Array.from({ length: PAR }, async () => {
  while (i < list.length) {
    const it = list[i++];
    try {
      if (await findOccupation({ name: it.name })) { console.log(`- ${it.name}：库里已有，跳过`); continue; }
      const r = await researchOccupation({ name: it.name, aliases: it.aliases || [] }, MODEL, Date.now());
      const fields = { ...r.fields, name: it.name, aliases: [...new Set([...(it.aliases || []), ...(r.fields.aliases || [])])] };
      const saved = await upsertOccupation(fields, { mode: 'fill', source: 'ai', sources: r.sources });
      const sal = await upsertSalaries(saved.id, r.salaries, 'fill');
      if (saved.created) { created++; made.push(it.name); }
      console.log(`${saved.created ? '✓' : '·'} ${it.name}（#${saved.id}）：字段 ${saved.changed.length}，薪资档 ${sal}`);
    } catch (e: any) { console.log(`✗ ${it.name}：${String(e?.message || e).slice(0, 120)}`); }
  }
}));
console.log(`新建 ${created} 个职业`);

// 相关岗位重新关联职业：岗位名里含名单上的叫法的，重打一遍（标签清单缓存是旧的，重开一个进程最稳，这里直接重新读）
if (created) {
  const words = list.flatMap(x => [x.name, ...(x.aliases || []), ...(x.titles || [])]).map(w => w.replace(/\s+/g, '')).filter(w => w.length >= 3);
  const { data } = await selectAll(() => db.from('jobs').select('id, name').not('if_delete', 'is', true).order('id'));
  const ids = (data as any[]).filter(j => { const n = String(j.name).replace(/\s+/g, '').toLowerCase(); return words.some(w => n.includes(w.toLowerCase())); }).map(j => j.id);
  console.log(`重新关联职业的岗位：${ids.length} 个`);
  const n = await tagAndSave(ids, process.env.CHEAP_MODEL || MODEL);
  console.log(`已重打 ${n} 个`);
}
