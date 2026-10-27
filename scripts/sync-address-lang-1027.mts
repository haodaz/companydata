/**
 * 活动地址按工作地点的语言放一边（数据部门周赞灵 10-27 #51）：中文工作地点只放 (Cn)、英文只放 (En)，另一边清空。
 * 10-26 那版两边都写了工作地点，英文栏里大量是中文。人工改过活动地址（锁定）的不动。按目标值分组批量写。
 *   npx tsx scripts/sync-address-lang-1027.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { addressLangOf } = await import('@/lib/job-defaults');
const APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('jobs').select('id, location, address_lang_cn, address_lang_en, human_locked_fields').not('if_delete', 'is', true).order('id'));
const groups = new Map<string, number[]>();
let zh = 0, en = 0;
for (const j of data as any[]) {
  if ((j.human_locked_fields || []).some((k: string) => /^address_lang/.test(k))) continue;
  const want = addressLangOf(j.location);
  if ((j.address_lang_cn ?? null) === want.address_lang_cn && (j.address_lang_en ?? null) === want.address_lang_en) continue;
  want.address_lang_cn ? zh++ : want.address_lang_en ? en++ : 0;
  const k = JSON.stringify(want); groups.set(k, [...(groups.get(k) || []), j.id]);
}
console.log(`岗位 ${(data as any[]).length}，要改 ${zh + en}（中文工作地点 ${zh}、英文 ${en}），${groups.size} 组`);
if (APPLY) {
  let done = 0;
  for (const [k, ids] of groups) for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from('jobs').update(JSON.parse(k)).in('id', ids.slice(i, i + 200));
    if (error) { console.log('✗', error.message); process.exit(1); }
    done += Math.min(200, ids.length - i);
  }
  console.log(`已改 ${done}`);
}
