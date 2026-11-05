/**
 * 数据部门 11-05 #81（周赞灵）：企业岗位的 kind 只用 campus_fulltime / company_internship / social_position。
 * 存量里 PhD 直招 → 校招全职、科研实习 → 公司实习，其他不在三个里的按 job_type 推（推不出留空）。按 id 小批量改，不动表结构。
 *   npx tsx scripts/jobs/fix-kind-1105.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { companyJobKind, COMPANY_JOB_KINDS } = await import('@/lib/job-fields');
const APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('jobs').select('id, kind, job_type').not('kind', 'is', null).not('kind', 'in', `(${COMPANY_JOB_KINDS.join(',')})`).order('id'));
const plan = new Map<string, number[]>();
const cnt: Record<string, number> = {};
for (const j of data as any[]) { const to = companyJobKind(j.kind, j.job_type); const k = `${j.kind} → ${to}`; cnt[k] = (cnt[k] || 0) + 1; plan.set(String(to), [...(plan.get(String(to)) || []), j.id]); }
console.log(`要改 ${(data as any[]).length} 条`, cnt);
if (!APPLY) process.exit(0);
for (const [to, ids] of plan) for (let i = 0; i < ids.length; i += 200) {
  const { error } = await db.from('jobs').update({ kind: to === 'null' ? null : to }).in('id', ids.slice(i, i + 200));
  if (error) { console.log('✗', error.message); process.exit(1); }
}
console.log('已改');
