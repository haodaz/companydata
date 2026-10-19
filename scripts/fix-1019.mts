/**
 * 数据部门 10-19《AI工具反馈》岗位存量回刷（迁移 037 跑完之后）：
 *   --step region  国家 / 省份 / 城市改存选项集编码（不调模型；按值分组批量 update，几百次请求）
 *   --step tags    相关专业 / 职业（各 ≤ 4，「|」隔开）+ 四个标签（要求 / 职责 × 经验 / 技能，「；」隔开），每个岗位写一次
 *   npx tsx scripts/fix-1019.mts --step region [--dry]
 *   npx tsx scripts/fix-1019.mts --step tags --model qwen-flash [--par 4] [--only-missing]
 * 库是线上共用的：并发别开大（见记忆 db-load-limit）；tags 每批跑完会测一下库速度，慢了自动歇一会儿。
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { resolveRegion } = await import('@/lib/region-codes');
const { tagAndSave } = await import('@/lib/job-tagging');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const STEP = opt('step');
const DRY = process.argv.includes('--dry');

if (STEP === 'region') {
  const { data } = await selectAll(() => db.from('jobs').select('id, country, province, city, location, human_locked_fields').not('if_delete', 'is', true).order('id'));
  const groups = new Map<string, number[]>();
  let same = 0;
  for (const j of data as any[]) {
    const r = resolveRegion(j);
    const prov = r.province;
    if (j.country === r.country && j.city === r.city && JSON.stringify(j.province || []) === JSON.stringify(prov)) { same++; continue; }
    const k = JSON.stringify([r.country, prov, r.city]);
    (groups.get(k) || groups.set(k, []).get(k)!).push(j.id);
  }
  console.log(`岗位 ${(data as any[]).length}：已是编码 ${same}，要改 ${(data as any[]).length - same}，按值分 ${groups.size} 组`);
  if (!DRY) {
    let n = 0;
    for (const [k, ids] of groups) {
      const [country, province, city] = JSON.parse(k);
      for (let i = 0; i < ids.length; i += 300) {
        const { error } = await db.from('jobs').update({ country, province, city }).in('id', ids.slice(i, i + 300));
        if (error) throw new Error(`${k}：${error.message}`);
        n += Math.min(300, ids.length - i);
      }
    }
    console.log(`已改 ${n} 个岗位`);
  }
} else if (STEP === 'tags') {
  const MODEL = opt('model', process.env.CHEAP_MODEL || '');
  if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
  const PAR = Number(opt('par', '4'));
  const { data } = await selectAll(() => {
    let q = db.from('jobs').select('id').not('if_delete', 'is', true);
    // 断点续跑：四个标签里要求_经验标签还空的才跑
    if (process.argv.includes('--only-missing')) q = q.is('exp_labels_jd', null);
    return q.order('id');
  });
  const ids = (data as any[]).map(r => r.id);
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += 20) batches.push(ids.slice(i, i + 20));
  console.log(`要打标签 ${ids.length} 个岗位，${batches.length} 批，模型 ${MODEL}，并发 ${PAR}`);
  let next = 0, done = 0, saved = 0;
  const t0 = Date.now();
  const dbSlow = async () => { const s = Date.now(); await db.from('jobs').select('id', { count: 'exact', head: true }); return Date.now() - s > 2000; };
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (next < batches.length) {
      const b = batches[next++];
      // 先 await 再加：`saved += await` 会先读旧值，并发时互相覆盖
      try { const n = await tagAndSave(b, MODEL); saved += n; } catch (e: any) { console.error('批失败', String(e?.message || e).slice(0, 120)); }
      done += b.length;
      if ((done / 20) % 20 === 0) {
        console.log(`${done}/${ids.length} 已写 ${saved}（${((Date.now() - t0) / 60000).toFixed(1)} 分钟）`);
        if (await dbSlow()) { console.log('库变慢，歇 60 秒'); await new Promise(r => setTimeout(r, 60_000)); }
      }
    }
  }));
  console.log(`完成：写了 ${saved}/${ids.length} 个岗位，用时 ${((Date.now() - t0) / 60000).toFixed(1)} 分钟`);
} else {
  console.error('--step region | tags');
  process.exit(1);
}
