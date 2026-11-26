/**
 * 陈彩瑛 11-25 抽检后：按新规则（qianli-evidence 收紧「培训体系」、补「新人成长期 / 不限理工背景」等）重打 11-24 那批 5,104 个岗位的特色标签。
 * 覆盖 AI 结果（含清掉错打的），人工锁定的不动；这批岗位模型没返回的不动。改前原值备份到 reports/。
 *   npx tsx scripts/jobs/qianli-rerun-1125.mts [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { tagJobSpecialties } = await import('@/lib/qianli-labels');
const APPLY = process.argv.includes('--apply');
const ids: number[] = JSON.parse(fs.readFileSync('reports/1124-潜历标签重跑.json', 'utf8')).map((r: any) => r.id);
const jobs: any[] = [];
for (let i = 0; i < ids.length; i += 300) {
  const { data, error } = await db.from('jobs').select('id, name, institute_or_company_name, responsibilities, overview, qianli_job_specialty_labels, qianli_specialty_labels_reason, human_locked_fields').in('id', ids.slice(i, i + 300));
  if (error) throw error; jobs.push(...(data as any[]).map(j => ({ ...j, company: j.institute_or_company_name })));
}
fs.writeFileSync('reports/1125-潜历特色标签-改前备份.json', JSON.stringify(jobs.map(j => ({ id: j.id, l1: j.qianli_job_specialty_labels, l2: j.qianli_specialty_labels_reason }))));
console.log(`岗位 ${jobs.length}，已备份原值${APPLY ? '' : '（试跑不写库）'}`);
const same = (a: any, b: any) => JSON.stringify(a || []) === JSON.stringify(b || []);
const log: any[] = [];
const chunks: any[][] = []; for (let i = 0; i < jobs.length; i += 10) chunks.push(jobs.slice(i, i + 10));
let n = 0, changed = 0, fail = 0;
await Promise.all([0, 1, 2].map(async () => {
  while (chunks.length) {
    const c = chunks.shift()!;
    const S = await tagJobSpecialties(c, 'qwen3.7-plus').catch(() => { fail += c.length; return new Map(); });
    for (const j of c) {
      const s: any = S.get(j.id);
      if (!s || (j.human_locked_fields || []).includes('qianli_specialty_labels_reason')) continue;
      const l1 = s.l1.length ? s.l1 : null, l2 = s.l2.length ? s.l2 : null;
      if (same(l2, j.qianli_specialty_labels_reason) && same(l1, j.qianli_job_specialty_labels)) continue;
      changed++;
      log.push({ id: j.id, name: j.name, company: j.company, old_l1: j.qianli_job_specialty_labels, old_l2: j.qianli_specialty_labels_reason, l1, l2 });
      if (APPLY) { const { error } = await db.from('jobs').update({ qianli_job_specialty_labels: l1, qianli_specialty_labels_reason: l2 }).eq('id', j.id); if (error) console.log('✗', j.id, error.message); }
    }
    n += c.length;
    if (n % 300 < 10) { fs.writeFileSync('reports/1125-潜历特色标签重跑.json', JSON.stringify(log)); console.log(`${new Date().toTimeString().slice(0, 5)} ${n}/${jobs.length}：改了 ${changed}，失败 ${fail}`); }
  }
}));
fs.writeFileSync('reports/1125-潜历特色标签重跑.json', JSON.stringify(log));
console.log(`完成：${n} 个岗位，改了 ${changed}，模型失败 ${fail}`);
process.exit(0);
