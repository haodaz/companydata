/**
 * 岗位「活动地址 (Cn)」「活动地址 (En)」和「工作地点」一致（数据部门周赞灵 10-26）。存量按工作地点统一刷；按同一个工作地点分组批量写。
 *   npx tsx scripts/sync-address-lang-1026.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('jobs').select('id, location, address_lang_cn, address_lang_en, human_locked_fields').not('if_delete', 'is', true).order('id'));
const byLoc = new Map<string, number[]>();
let n = 0;
for (const j of data as any[]) {
  if ((j.human_locked_fields || []).some((k: string) => /^address_lang/.test(k))) continue;
  const loc = String(j.location ?? '').trim() || null;
  if ((j.address_lang_cn ?? null) === loc && (j.address_lang_en ?? null) === loc) continue;
  n++; const k = JSON.stringify(loc); byLoc.set(k, [...(byLoc.get(k) || []), j.id]);
}
console.log(`岗位 ${(data as any[]).length}，要改 ${n}（${byLoc.size} 种工作地点）`);
if (APPLY) {
  let done = 0;
  for (const [k, ids] of byLoc) for (let i = 0; i < ids.length; i += 200) {
    const loc = JSON.parse(k);
    const { error } = await db.from('jobs').update({ address_lang_cn: loc, address_lang_en: loc }).in('id', ids.slice(i, i + 200));
    if (error) { console.log('✗', error.message); process.exit(1); }
    done += Math.min(200, ids.length - i);
  }
  console.log(`已改 ${done}`);
}
