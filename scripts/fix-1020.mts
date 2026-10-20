/**
 * 数据部门 10-20《AI工具反馈》岗位存量回刷（迁移 038 跑完之后）：
 *   --step qianli   潜历职能标签（单个 value）+ 特色标签一级 / 二级（value 用「|」隔开），提示词同步自数据部门线下脚本
 *   npx tsx scripts/fix-1020.mts --step qianli --model qwen-plus [--par 4] [--only-missing]
 *   --step qianli-fn  只重打潜历职能标签（10-20：改成模型填中文名、代码换 value 之后重打）
 *   npx tsx scripts/fix-1020.mts --step qianli-fn --model qwen-plus [--par 2]
 *   --step careers  相关专业 / 职业按收紧后的提示词重打（宁少勿多，对不上留空并记个体信号 → 市场新兴职业）
 *   npx tsx scripts/fix-1020.mts --step careers --model qwen-plus [--par 3]
 * 地区编码（全球城市、港澳台改存 344/446/158）用 fix-1019：npx tsx scripts/fix-1019.mts --step region
 * 库是线上共用的：并发别开大；每 20 批测一次库速度，慢了歇 60 秒。
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { qianliLabels } = await import('@/lib/qianli-labels');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const STEP = opt('step');
if (!['qianli', 'qianli-fn', 'careers'].includes(STEP)) { console.error('--step qianli | qianli-fn | careers'); process.exit(1); }
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const PAR = Number(opt('par', '4'));

if (STEP === 'careers') {
  const { tagAndSave } = await import('@/lib/job-tagging');
  const { data } = await selectAll(() => db.from('jobs').select('id').not('if_delete', 'is', true).order('id'));
  const ids = (data as any[]).map(r => r.id);
  const bs: number[][] = [];
  for (let i = 0; i < ids.length; i += 20) bs.push(ids.slice(i, i + 20));
  console.log(`重打相关专业 / 职业 ${ids.length} 个岗位，${bs.length} 批，模型 ${MODEL}，并发 ${PAR}`);
  let nx = 0, dn = 0, sv = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (nx < bs.length) {
      const b = bs[nx++];
      try { const n = await tagAndSave(b, MODEL, { labels: false, qianli: false, strongModel: MODEL }); sv += n; } catch (e: any) { console.error('批失败', String(e?.message || e).slice(0, 120)); }
      dn += b.length;
      if ((dn / 20) % 20 === 0) {
        const { count } = await db.from('occupation_signals').select('id', { count: 'exact', head: true });
        console.log(`${dn}/${ids.length} 已写 ${sv}，个体信号 ${count}（${((Date.now() - t0) / 60000).toFixed(1)} 分钟）`);
        const s0 = Date.now(); await db.from('jobs').select('id', { count: 'exact', head: true }); if (Date.now() - s0 > 2000) { console.log('库变慢，歇 60 秒'); await new Promise(r => setTimeout(r, 60_000)); }
      }
    }
  }));
  console.log(`完成：写了 ${sv}/${ids.length}，用时 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟`);
  process.exit(0);
}

if (STEP === 'qianli-fn') {
  const { tagJobFunctions } = await import('@/lib/qianli-labels');
  const { data } = await selectAll(() => db.from('jobs').select('id, name, responsibilities, overview, summary_cn, human_locked_fields').not('if_delete', 'is', true).order('id'));
  const rs = (data as any[]).filter(j => !(j.human_locked_fields || []).includes('qianli_job_labels'));
  const bs: any[][] = [];
  for (let i = 0; i < rs.length; i += 10) bs.push(rs.slice(i, i + 10));
  console.log(`重打潜历职能标签 ${rs.length} 个岗位，${bs.length} 批，模型 ${MODEL}，并发 ${PAR}`);
  let nx = 0, dn = 0, sv = 0, changed = 0;
  const old = new Map((data as any[]).map(j => [j.id, null as string | null]));
  const { data: cur } = await selectAll(() => db.from('jobs').select('id, qianli_job_labels').not('if_delete', 'is', true).order('id'));
  for (const j of cur as any[]) old.set(j.id, j.qianli_job_labels);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (nx < bs.length) {
      const b = bs[nx++];
      try {
        const m = await tagJobFunctions(b, MODEL);
        for (const [id, v] of m) { if (old.get(id) !== v) changed++; const { error } = await db.from('jobs').update({ qianli_job_labels: v }).eq('id', id); if (!error) sv++; }
      } catch (e: any) { console.error('批失败', String(e?.message || e).slice(0, 120)); }
      dn += b.length;
      if ((dn / 10) % 40 === 0) console.log(`${dn}/${rs.length} 已写 ${sv}，和原来不同 ${changed}（${((Date.now() - t0) / 60000).toFixed(1)} 分钟）`);
    }
  }));
  console.log(`完成：写了 ${sv}/${rs.length}，和原来不同 ${changed}，用时 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟`);
  process.exit(0);
}

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
