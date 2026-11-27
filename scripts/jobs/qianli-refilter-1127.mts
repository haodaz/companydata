/**
 * 陈彩瑛 11-27 第二轮抽检：不再调模型，用新规则（qianli-evidence）把现有特色标签复核一遍——证据不够的去掉、规则能直接认出的补上。
 * 范围：11-24 / 11-25 那批 5,104 个岗位；人工锁定的不动；改前原值备份。
 *   npx tsx scripts/jobs/qianli-refilter-1127.mts [--ids 1,2] [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { checkSpecialty } = await import('@/lib/qianli-evidence');
const { SPECIALTY_TAGS } = await import('@/data/qianli-prompts');
const z2 = new Map(SPECIALTY_TAGS.map(t => [t.l2_value, t.l2]));
const APPLY = process.argv.includes('--apply');
const i = process.argv.indexOf('--ids');
const ids: number[] = i > 0 ? process.argv[i + 1].split(',').map(Number) : JSON.parse(fs.readFileSync('reports/1124-潜历标签重跑.json', 'utf8')).map((r: any) => r.id);
const jobs: any[] = [];
for (let k = 0; k < ids.length; k += 300) { const { data, error } = await db.from('jobs').select('id,name,responsibilities,overview,qianli_job_specialty_labels,qianli_specialty_labels_reason,human_locked_fields').in('id', ids.slice(k, k + 300)); if (error) throw error; jobs.push(...data!); }
if (i < 0) fs.writeFileSync('reports/1127-潜历特色标签-改前备份.json', JSON.stringify(jobs.map(j => ({ id: j.id, l1: j.qianli_job_specialty_labels, l2: j.qianli_specialty_labels_reason }))));
const same = (a: any, b: any) => JSON.stringify(a || []) === JSON.stringify(b || []);
const log: any[] = [];
for (const j of jobs) {
  if ((j.human_locked_fields || []).includes('qianli_specialty_labels_reason')) continue;
  const { l1, l2, dropped } = checkSpecialty(j.qianli_specialty_labels_reason || [], j);
  const L1 = l1.length ? l1 : null, L2 = l2.length ? l2 : null;
  if (same(L2, j.qianli_specialty_labels_reason) && same(L1, j.qianli_job_specialty_labels)) continue;
  log.push({ id: j.id, name: j.name, old_l2: j.qianli_specialty_labels_reason, l1: L1, l2: L2, dropped });
  if (APPLY) { const { error } = await db.from('jobs').update({ qianli_job_specialty_labels: L1, qianli_specialty_labels_reason: L2 }).eq('id', j.id); if (error) console.log('✗', j.id, error.message); }
}
if (i < 0) fs.writeFileSync('reports/1127-潜历特色标签复核.json', JSON.stringify(log));
const cnt = (f: (r: any) => boolean) => log.filter(f).length, has = (a: any, v: string) => (a || []).includes(v);
console.log(`岗位 ${jobs.length}，有变化 ${log.length}${APPLY ? '（已写库）' : '（试跑）'}`);
for (const v of ['non_stem', 'hybrid_role', 'global_bonus', 'self_learning', 'ai_ready', 'language_skills', 'liberal_arts']) console.log(`  ${z2.get(v)}：去掉 ${cnt(r => has(r.old_l2, v) && !has(r.l2, v))}，补上 ${cnt(r => !has(r.old_l2, v) && has(r.l2, v))}`);
if (i > 0) for (const r of log) console.log(r.id, r.name.slice(0, 20), (r.old_l2 || []).map((x: string) => z2.get(x)).join('；'), '→', (r.l2 || []).map((x: string) => z2.get(x)).join('；'));
process.exit(0);
