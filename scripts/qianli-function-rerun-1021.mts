/**
 * 潜历职能标签按陈彩瑛 10-21 规则全量重打（规则在 src/lib/qianli-labels.ts tagJobFunctions）：
 *   没 JD 的凭岗位名、记「仅凭岗位名称判断」；匹配度低 / 对不上的留空并记原因（qianli_job_labels_reason）；不拿「管理」兜底；
 *   「岗位名称 + 岗位职责」完全相同的只问一次、标签一致。人工锁定的不动。
 *   npx tsx scripts/qianli-function-rerun-1021.mts --model qwen-plus [--limit N] [--par 3] [--dry]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { tagJobFunctions, sameJobKey } = await import('@/lib/qianli-labels');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const LIMIT = Number(opt('limit', '0')), PAR = Number(opt('par', '3')), DRY = process.argv.includes('--dry');

const { data } = await selectAll(() => db.from('jobs').select('id, name, responsibilities, overview, summary_cn, institute_or_company_name, qianli_job_labels, human_locked_fields')
  .not('if_delete', 'is', true).order('id'));
const jobs = (data as any[]).filter(j => !(j.human_locked_fields || []).includes('qianli_job_labels')).map(j => ({ ...j, company: j.institute_or_company_name }));
const groups = new Map<string, any[]>();
for (const j of jobs) { const k = sameJobKey(j); (groups.get(k) || groups.set(k, []).get(k)!).push(j); }
let reps = [...groups.values()].map(g => g[0]);
if (LIMIT) reps = reps.slice(0, LIMIT);
console.log(`岗位 ${jobs.length}，同名同职责合并后 ${groups.size} 组，这次问 ${reps.length} 组，模型 ${MODEL}，并发 ${PAR}${DRY ? '（试跑不写库）' : ''}`);

const batches: any[][] = [];
for (let i = 0; i < reps.length; i += 10) batches.push(reps.slice(i, i + 10));
const stat = { labeled: 0, titleOnly: 0, empty: 0, changed: 0, written: 0, mgmtBefore: 0, mgmtAfter: 0 };
const reasons: Record<string, number> = {};
const samples: any[] = [];
let nx = 0, done = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: PAR }, async () => {
  while (nx < batches.length) {
    const b = batches[nx++];
    let m: Map<number, { value: string | null; reason: string }>;
    try { m = await tagJobFunctions(b, MODEL); } catch (e: any) { console.error('\n批失败', String(e?.message || e).slice(0, 100)); continue; }
    for (const r of b) {
      const f = m.get(r.id);
      if (!f) continue;
      if (f.value) { stat.labeled++; if (f.reason === '仅凭岗位名称判断') stat.titleOnly++; } else { stat.empty++; const k = f.reason.split('：')[0]; reasons[k] = (reasons[k] || 0) + 1; }
      for (const j of groups.get(sameJobKey(r))!) {
        if (j.qianli_job_labels === 'exec_mgmt') stat.mgmtBefore++;
        if (f.value === 'exec_mgmt') stat.mgmtAfter++;
        if ((j.qianli_job_labels || null) !== f.value) { stat.changed++; if (samples.length < 80) samples.push({ id: j.id, name: j.name, before: j.qianli_job_labels, after: f.value, reason: f.reason }); }
        if (DRY) continue;
        const { error } = await db.from('jobs').update({ qianli_job_labels: f.value ? [f.value] : null, qianli_job_labels_reason: f.reason || null }).eq('id', j.id);
        if (!error) stat.written++;
      }
    }
    done += b.length;
    process.stdout.write(`\r${done}/${reps.length} 组：打上 ${stat.labeled}（仅凭岗位名 ${stat.titleOnly}）、留空 ${stat.empty}，和原来不同 ${stat.changed} 个岗位，写 ${stat.written}（${((Date.now() - t0) / 60000).toFixed(1)} 分钟）`);
  }
}));
console.log(`\n留空原因：${Object.entries(reasons).map(([k, n]) => `${k} ${n}`).join('，')}；「管理」${stat.mgmtBefore} → ${stat.mgmtAfter}`);
fs.writeFileSync(`reports/qianli-function-rerun-1021${DRY ? '-dry' : ''}.json`, JSON.stringify({ at: new Date().toISOString(), model: MODEL, stat, reasons, samples }, null, 1));
process.exit(0);
