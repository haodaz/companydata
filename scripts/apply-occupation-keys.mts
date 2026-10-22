/**
 * 按人工确认过的清单改职业 key（scripts/fix-occupation-keys.mts 出清单 → 人看过 → 写进 json → 这里改）。
 * 只改 AI 生成的（source = ai）；岗位 related_career_ids 里的旧 key 同步替换（按「|」整段换，免得 a 命中 a_b）。
 *   npx tsx scripts/apply-occupation-keys.mts reports/occupation-keys-apply-1020.json [--dry]
 */
process.loadEnvFile('.env.local');
const { toList } = await import('@/lib/list-field');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const list: { id: number; to: string; en?: string }[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const DRY = process.argv.includes('--dry');
let jobsFixed = 0;
for (const it of list) {
  const { data: o } = await db.from('occupations').select('id, name, external_id, source').eq('id', it.id).single();
  if (!o) { console.log(`✗ #${it.id} 不存在`); continue; }
  if (o.source !== 'ai') { console.log(`✗ #${it.id} ${o.name} 不是 AI 生成的，跳过（数据部门的编码不擅自改）`); continue; }
  const { data: dup } = await db.from('occupations').select('id, name').eq('external_id', it.to).neq('id', it.id);
  if (dup?.length) { console.log(`✗ #${it.id} ${o.name}：${it.to} 已被 #${dup[0].id} ${dup[0].name} 占用，跳过`); continue; }
  const { data: js } = await selectAll(() => db.from('jobs').select('id, related_career_ids').contains('related_career_ids', [o.external_id]).order('id'));
  const hit = (js as any[]).filter(j => toList(j.related_career_ids).includes(o.external_id));
  console.log(`${DRY ? '·' : '✓'} #${it.id} ${o.name}：${o.external_id} → ${it.to}（岗位 ${hit.length} 处）`);
  if (DRY) continue;
  const { error } = await db.from('occupations').update({ external_id: it.to, key: it.to, ...(it.en ? { name_lang_en: it.en } : {}) }).eq('id', it.id);
  if (error) { console.log(`  改职业失败：${error.message}`); continue; }
  for (const j of hit) { await db.from('jobs').update({ related_career_ids: toList(j.related_career_ids).map(p => p === o.external_id ? it.to : p) }).eq('id', j.id); jobsFixed++; }
}
console.log(DRY ? '（演练，没写库）' : `完成：岗位里同步换了 ${jobsFixed} 处`);
