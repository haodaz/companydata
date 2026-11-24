/**
 * 数据部门 11-24（陈彩瑛）：审核「已完成」的岗位，潜历特色标签（一级 / 二级）空的多——换 qwen3.7-plus 重跑。
 *   特色标签空的：重打特色标签，打出来才写（打不出来保持空，不动别的字段）
 *   职能标签空的：重打职能标签，打出来才写
 * 原文证据关照旧（qianli-evidence）；人工锁定的字段不动。结果逐条记 reports/，抽样给数据部门看。
 *   npx tsx scripts/jobs/qianli-rerun-1124.mts [--model qwen3.7-plus] [--limit N] [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { tagJobSpecialties, tagJobFunctions } = await import('@/lib/qianli-labels');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', 'qwen3.7-plus'), APPLY = process.argv.includes('--apply'), LIMIT = Number(opt('limit', '0'));
const e = (v: any) => !v || (Array.isArray(v) && !v.length);
const { data } = await selectAll(() => db.from('jobs').select('id, name, institute_or_company_name, responsibilities, overview, qianli_job_labels, qianli_job_specialty_labels, qianli_specialty_labels_reason, human_locked_fields').eq('human_review_status', 'complete').not('if_delete', 'is', true).order('id'));
let jobs = (data as any[]).filter(j => e(j.qianli_specialty_labels_reason) || e(j.qianli_job_labels)).map(j => ({ ...j, company: j.institute_or_company_name }));
if (LIMIT) jobs = jobs.slice(0, LIMIT);
console.log(`已完成岗位里要重跑的 ${jobs.length}（特色空 ${jobs.filter(j => e(j.qianli_specialty_labels_reason)).length}，职能空 ${jobs.filter(j => e(j.qianli_job_labels)).length}），模型 ${MODEL}${APPLY ? '' : '（试跑不写库）'}`);
const OUT = 'reports/1124-潜历标签重跑.json';
const log: any[] = [];
const chunks: any[][] = []; for (let i = 0; i < jobs.length; i += 10) chunks.push(jobs.slice(i, i + 10));
let n = 0, sp = 0, fn = 0;
await Promise.all([0, 1, 2].map(async () => {
  while (chunks.length) {
    const c = chunks.shift()!;
    const needS = c.filter(j => e(j.qianli_specialty_labels_reason)), needF = c.filter(j => e(j.qianli_job_labels));
    const [S, F] = await Promise.all([
      needS.length ? tagJobSpecialties(needS, MODEL).catch(() => new Map()) : new Map(),
      needF.length ? tagJobFunctions(needF, MODEL).catch(() => new Map()) : new Map(),
    ]);
    for (const j of c) {
      const lk = new Set(j.human_locked_fields || []), patch: Record<string, any> = {};
      const s: any = S.get(j.id), f: any = F.get(j.id);
      if (s?.l2?.length && !lk.has('qianli_specialty_labels_reason')) { patch.qianli_job_specialty_labels = s.l1; patch.qianli_specialty_labels_reason = s.l2; sp++; }
      if (f?.value && !lk.has('qianli_job_labels')) { patch.qianli_job_labels = [f.value]; patch.qianli_job_labels_reason = f.reason || null; fn++; }
      log.push({ id: j.id, name: j.name, company: j.company, specialty_l1: s?.l1 || null, specialty_l2: s?.l2 || null, function: f?.value || null, function_reason: f?.reason || null, written: Object.keys(patch).length > 0 });
      if (APPLY && Object.keys(patch).length) { const { error } = await db.from('jobs').update(patch).eq('id', j.id); if (error) console.log('✗', j.id, error.message); }
    }
    n += c.length;
    if (n % 200 < 10) { fs.writeFileSync(OUT, JSON.stringify(log)); console.log(`${new Date().toTimeString().slice(0, 5)} ${n}/${jobs.length}：特色补上 ${sp}，职能补上 ${fn}`); }
  }
}));
fs.writeFileSync(OUT, JSON.stringify(log));
console.log(`完成：${n} 个岗位，特色补上 ${sp}，职能补上 ${fn}`);
process.exit(0);
