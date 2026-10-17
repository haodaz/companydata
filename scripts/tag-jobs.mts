/**
 * 存量岗位批量关联专业（fos_ids）和职业（related_career_ids）——数据部门 10-17 反馈。
 *   npx tsx scripts/tag-jobs.mts --model qwen-flash [--par 6] [--all]
 * 默认只标还没有 fos_ids 的在库岗位；--all 全部重标。按 id 从小到大走一遍，中断后再跑会自动跳过已标的。
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { tagJobs, tagCatalog } = await import('@/lib/job-tagging');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', process.env.CHEAP_MODEL || '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const PAR = Number(opt('par', '6')), BATCH = 20;

await tagCatalog();
const { data } = await selectAll(() => {
  let q = db.from('jobs').select('id, name, job_function, summary_cn, responsibilities, overview, institute_or_company_name').not('if_delete', 'is', true);
  if (!process.argv.includes('--all')) q = q.or('fos_ids.is.null,fos_ids.eq.{}');
  return q.order('id');
});
const rows = (data as any[]).map(j => ({ ...j, company: j.institute_or_company_name }));
const batches: any[][] = [];
for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
console.log(`待标 ${rows.length} 个岗位，${batches.length} 批，模型 ${MODEL}，并发 ${PAR}`);

let done = 0, tagged = 0, empty = 0, failed = 0, next = 0;
const t0 = Date.now();
async function worker() {
  while (next < batches.length) {
    const b = batches[next++];
    try {
      const m = await tagJobs(b, MODEL);
      for (const [id, v] of m) {
        const { error } = await db.from('jobs').update(v).eq('id', id);
        if (error) failed++; else if (v.fos_ids.length || v.related_career_ids.length) tagged++; else empty++;
      }
      failed += b.length - m.size;
    } catch (e: any) {
      failed += b.length;
      console.error('批失败', e?.message?.slice(0, 120));
      if (/quota|余额|Arrearage|insufficient/i.test(e?.message || '')) { process.exitCode = 2; next = batches.length; }
    }
    done += b.length;
    if ((done / BATCH) % 25 === 0) console.log(`${done}/${rows.length} 已标 ${tagged} 空 ${empty} 失败 ${failed}（${((Date.now() - t0) / 60000).toFixed(1)} 分钟）`);
  }
}
await Promise.all(Array.from({ length: PAR }, worker));
console.log(`完成：已标 ${tagged}，对不上留空 ${empty}，失败 ${failed}，用时 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟`);
