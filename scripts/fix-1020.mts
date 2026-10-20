/**
 * 数据部门 10-20《AI工具反馈》岗位存量回刷（迁移 038 跑完之后）：
 *   --step qianli   潜历职能标签（单个 value）+ 特色标签一级 / 二级（value 用「|」隔开），提示词同步自数据部门线下脚本
 *   npx tsx scripts/fix-1020.mts --step qianli --model qwen-plus [--par 4] [--only-missing]
 * 地区编码（全球城市、港澳台改存 344/446/158）用 fix-1019：npx tsx scripts/fix-1019.mts --step region
 * 库是线上共用的：并发别开大；每 20 批测一次库速度，慢了歇 60 秒。
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { qianliLabels } = await import('@/lib/qianli-labels');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
if (opt('step') !== 'qianli') { console.error('--step qianli'); process.exit(1); }
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const PAR = Number(opt('par', '4'));

const { data } = await selectAll(() => {
  let q = db.from('jobs').select('id, name, responsibilities, overview, summary_cn, institute_or_company_name, human_locked_fields').not('if_delete', 'is', true);
  // 断点续跑：职能标签还空的才跑
  if (process.argv.includes('--only-missing')) q = q.is('qianli_job_labels', null);
  return q.order('id');
});
const rows = (data as any[]).map(j => ({ ...j, company: j.institute_or_company_name }));
const batches: any[][] = [];
for (let i = 0; i < rows.length; i += 10) batches.push(rows.slice(i, i + 10));
console.log(`要打潜历标签 ${rows.length} 个岗位，${batches.length} 批，模型 ${MODEL}，并发 ${PAR}`);

let next = 0, done = 0, saved = 0, fnHit = 0, spHit = 0;
const t0 = Date.now();
const dbSlow = async () => { const s = Date.now(); await db.from('jobs').select('id', { count: 'exact', head: true }); return Date.now() - s > 2000; };
await Promise.all(Array.from({ length: PAR }, async () => {
  while (next < batches.length) {
    const b = batches[next++];
    try {
      const m = await qianliLabels(b, MODEL);
      for (const j of b) {
        const v = m.get(j.id);
        if (!v) continue;
        const locked = new Set<string>(j.human_locked_fields || []);
        const patch: Record<string, any> = { ...v };
        for (const k of Object.keys(patch)) if (locked.has(k)) delete patch[k];
        const { error } = await db.from('jobs').update(patch).eq('id', j.id);
        if (!error) { saved++; if (v.qianli_job_labels) fnHit++; if (v.qianli_job_specialty_labels) spHit++; }
      }
    } catch (e: any) { console.error('批失败', String(e?.message || e).slice(0, 120)); }
    done += b.length;
    if ((done / 10) % 40 === 0) {
      console.log(`${done}/${rows.length} 已写 ${saved}（职能 ${fnHit}，有特色标签 ${spHit}；${((Date.now() - t0) / 60000).toFixed(1)} 分钟）`);
      if (await dbSlow()) { console.log('库变慢，歇 60 秒'); await new Promise(r => setTimeout(r, 60_000)); }
    }
  }
}));
console.log(`完成：写了 ${saved}/${rows.length}，职能标签 ${fnHit}，有特色标签 ${spHit}，用时 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟`);
