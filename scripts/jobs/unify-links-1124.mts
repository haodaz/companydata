/**
 * 数据部门 11-24（赞灵）：「投递入口 application_website」和「岗位详情页 link」保持一致，且不能是列表页。
 *   能找到这个岗位自己的详情页（两个里有一个不是列表页）→ 两个字段都写成它（link 优先）
 *   两个都是列表页 → 保留原值，link_issue 标「需补详情页（只有列表页链接）」（用户 11-24 选保留）
 * 列表页：同一个链接挂了 3 个以上岗位，或路径像列表（域名首页、/campus、/jobs、?page= 等）。人工锁定的不动；改前备份。
 *   npx tsx scripts/jobs/unify-links-1124.mts [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const APPLY = process.argv.includes('--apply');
export const LIST_ISSUE = '需补详情页（只有列表页链接）';
const { data } = await selectAll(() => db.from('jobs').select('id, link, application_website, link_issue, human_locked_fields').not('if_delete', 'is', true).order('id'));
const js = data as any[];
const cnt = new Map<string, number>(); for (const j of js) for (const u of new Set([j.link, j.application_website].filter(Boolean))) cnt.set(u, (cnt.get(u) || 0) + 1);
const listish = (u: string) => { try { const x = new URL(u); const p = x.pathname.replace(/\/+$/, ''); return p === '' || /\/(campus|jobs?|positions?|careers?|join|recruit(ment)?|list|search|social|intern)$/i.test(p) || /[?&](page|current|pageNo|keywords?|category)=/i.test(x.search); } catch { return true; } };
const isList = (u: string) => !u || (cnt.get(u) || 0) >= 3 || listish(u);
const upd: { id: number; patch: any }[] = [], bak: any[] = [];
let locked = 0;
for (const j of js) {
  const lk = new Set(j.human_locked_fields || []);
  if (lk.has('link') || lk.has('application_website')) { locked++; continue; }
  const c = [j.link, j.application_website].find(u => u && !isList(u));
  if (c) { if (j.link !== c || j.application_website !== c) upd.push({ id: j.id, patch: { link: c, application_website: c } }); }
  else if ((j.link || j.application_website) && j.link_issue !== LIST_ISSUE) upd.push({ id: j.id, patch: { link_issue: LIST_ISSUE } });
  else continue;
  bak.push({ id: j.id, link: j.link, application_website: j.application_website, link_issue: j.link_issue });
}
console.log(`统一成详情页 ${upd.filter(u => u.patch.link).length}，标「需补详情页」${upd.filter(u => u.patch.link_issue).length}，人工锁定跳过 ${locked}${APPLY ? '' : '（试跑）'}`);
if (APPLY) {
  fs.writeFileSync('reports/1124-岗位链接统一-改前备份.json', JSON.stringify(bak));
  const q = [...upd]; let n = 0;
  await Promise.all([0, 1, 2].map(async () => { while (q.length) { const u = q.shift()!; const { error } = await db.from('jobs').update(u.patch).eq('id', u.id); if (error) console.log('✗', u.id, error.message); if (++n % 2000 === 0) console.log(n); } }));
  console.log('已改', n);
}
process.exit(0);
