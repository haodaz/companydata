/**
 * 数据部门 11-27（赞灵）：hotjob 详情链接 postType=1 / 2 打不开，换成 campus / society（实测能打开）。link 和投递入口一起改；人工锁定的不动；改前备份。
 *   npx tsx scripts/jobs/fix-hotjob-links-1127.mts [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { fixHotjobLink } = await import('@/lib/agents/ats-adapters');
const APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('jobs').select('id,link,application_website,human_locked_fields').or('link.ilike.%hotjob.cn%,application_website.ilike.%hotjob.cn%').order('id'));
const todo: any[] = [];
for (const j of data as any[]) {
  const lk = new Set(j.human_locked_fields || []), patch: any = {};
  for (const f of ['link', 'application_website']) { const v = fixHotjobLink(j[f]); if (v !== j[f] && !lk.has(f)) patch[f] = v; }
  if (Object.keys(patch).length) todo.push({ id: j.id, old: { link: j.link, application_website: j.application_website }, patch });
}
console.log(`hotjob 岗位 ${(data as any[]).length}，要改 ${todo.length}${APPLY ? '' : '（试跑）'}`, todo.slice(0, 2).map(t => t.patch.link));
fs.writeFileSync('reports/1127-hotjob链接修正-改前备份.json', JSON.stringify(todo));
if (APPLY) { let k = 0, bad = 0; await Promise.all([0, 1, 2].map(async () => { for (let t; (t = todo[k++]);) { const { error } = await db.from('jobs').update(t.patch).eq('id', t.id); if (error) bad++; } })); console.log('写入完成，失败', bad); }
process.exit(0);
