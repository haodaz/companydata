/**
 * 企业链接落地体检（数据部门 2026-10-10）：官网 / 校招官网 / 招聘总入口逐个直接请求一次（不渲染，快）。
 *   - https 打不开、http 能开（追光动画）→ 换成 http 的地址
 *   - 校招 / 招聘入口跳回网站首页（大疆 careers.dji.com/campus → /zh-CN）→ 重新找一次招聘入口（先爬官网，再联网搜）
 *   - 连不上的不动（多半是境外访问被拦，不等于失效）
 *   npx tsx scripts/fix-links-1010.mts            只出报告
 *   npx tsx scripts/fix-links-1010.mts --apply    写库（人工锁定的字段、已定论的企业不动）
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { linkLanding } = await import('../src/lib/agents/link-landing');
const { discoverRecruitEntry } = await import('../src/lib/agents/recruit-entry');
const { refreshCompleteness } = await import('../src/lib/company-store');
const { FROZEN_REVIEW_STATUSES } = await import('../src/lib/review-status');

const APPLY = process.argv.includes('--apply');
const CONC = Number(process.argv.find(a => a.startsWith("--conc="))?.slice(7) || 40);
const FIELDS = ['official_website', 'campus_url', 'careers_url'] as const;
const LABEL: Record<string, string> = { official_website: '官网', campus_url: '校招官网', careers_url: '招聘总入口' };

const { data: cos, error } = await selectAll(() => db.from('companies').select('id, name, official_website, campus_url, careers_url, human_locked_fields, human_review_status').order('id'));
if (error) throw error;
const jobs: { c: any; f: typeof FIELDS[number]; url: string }[] = [];
for (const c of cos as any[]) for (const f of FIELDS) if (c[f]) jobs.push({ c, f, url: c[f] });
console.log(`${APPLY ? '▶ 写库' : '▶ 只出报告（加 --apply 写库）'}：${(cos as any[]).length} 家企业，${jobs.length} 个链接`);

const http: string[] = [], home: string[] = [], down: Record<string, number> = {};
const refind = new Map<number, any>();
const locked = (c: any, f: string) => (c.human_locked_fields || []).includes(f) || FROZEN_REVIEW_STATUSES.has(c.human_review_status || '');
let n = 0;
const one = async ({ c, f, url }: typeof jobs[number]) => {
  const r = await linkLanding(url, 10000);
  if (++n % 300 === 0) console.log(`  … ${n}/${jobs.length}`);
  if (!r.ok && !r.httpFallback) { down[LABEL[f]] = (down[LABEL[f]] || 0) + 1; return; }
  if (r.httpFallback) {
    http.push(`${c.name} ${LABEL[f]}：${url} → ${r.httpFallback}`);
    if (APPLY && !locked(c, f)) await db.from('companies').update({ [f]: r.httpFallback }).eq('id', c.id).eq(f, url);
  }
  if (r.homeRedirect && f !== 'official_website') {
    home.push(`${c.name} ${LABEL[f]}：${url} → 跳回 ${r.finalUrl}`);
    if (!locked(c, f)) refind.set(c.id, c);
  }
};
// 工作池：一个查完马上接下一个（按批等的话，每批都要等最慢的那个超时）
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < jobs.length) { const j = jobs[next++]; await one(j).catch(e => console.log('  出错', j.url, e.message)); } }));

console.log(`\n▸ https 打不开、http 能开：${http.length} 个\n  ${http.join('\n  ')}`);
console.log(`\n▸ 招聘链接跳回首页：${home.length} 个\n  ${home.join('\n  ')}`);
console.log(`\n▸ 连不上（不动）：${JSON.stringify(down)}`);

if (APPLY && refind.size) {
  console.log(`\n▸ 重新找招聘入口：${refind.size} 家`);
  for (const c of refind.values()) {
    const { data: fresh } = await db.from('companies').select('official_website, campus_url, careers_url').eq('id', c.id).single();
    try {
      const r = await discoverRecruitEntry(c.name, fresh?.official_website || c.official_website);
      const patch: Record<string, string | null> = {};
      const bad = async (u: string | null) => !!u && !!(await linkLanding(u).catch(() => null))?.homeRedirect;
      for (const [f, v] of [['campus_url', r.campus || r.intern || null], ['careers_url', r.careers || r.social || null]] as const) {
        if (locked(c, f)) continue;
        if (v) patch[f] = v;
        else if (await bad(fresh?.[f] || null)) patch[f] = null;   // 找不到新的，也别留一个跳回首页的
      }
      if (Object.keys(patch).length) { await db.from('companies').update(patch).eq('id', c.id); await refreshCompleteness(c.id).catch(() => {}); }
      console.log(`  ${c.name}：${JSON.stringify(patch)}（${r.via}）`);
    } catch (e: any) { console.log(`  ${c.name} 出错：${e.message}`); }
  }
}
