/**
 * 数据部门 2026-10-10 反馈的存量回溯（迁移 018 跑完后再跑）：
 *   npx tsx scripts/fix-1010.mts            只出报告，不写库
 *   npx tsx scripts/fix-1010.mts --apply    写库
 *   --only ids|split|dedupe                 只跑其中一步
 *
 * ① 企业编号：flora_external_id = 国家代码.官网主域名（没官网用拼音首字母），applysquare_id / slug 同值。
 *    按完整度从高到低逐家处理，主体先拿到不带后缀的编号；国家认不出来的保留原编号，列出来交给人看。
 * ② 岗位按工作地点拆分：「北京、上海」→ 两条，每条一个城市（原记录留给第一个城市，其他城市复制新建）。
 * ③ 重复岗位合并：同企业 + 同岗位名 + 同城市（「深圳总部」=「深圳」），岗位编号不冲突，
 *    且来自同一来源页或其中有已下线的 → 留一条（在招 > 审核过 > 有详情链接 > 最近见到），其余 if_delete = true（不真删，可恢复）。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { countryCode, ensureCompanyFloraId } = await import('../src/lib/company-flora-id');
const { splitLocations, normCity } = await import('../src/lib/job-fields');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const run = (k: string) => !ONLY || ONLY === k;
console.log(APPLY ? '▶ 写库' : '▶ 只出报告（加 --apply 写库）');

// ── ① 企业编号 ──
if (run('ids')) {
  const { data: rows, error } = await selectAll(() => db.from('companies').select('id, name, country, official_website, external_id, flora_id_locked, completeness_score').order('id'));
  if (error) throw error;
  rows.sort((a: any, b: any) => (b.completeness_score || 0) - (a.completeness_score || 0) || a.id - b.id);
  const skipped: string[] = []; let byDomain = 0, byPinyin = 0, locked = 0;
  for (const c of rows as any[]) {
    if (c.flora_id_locked) { locked++; continue; }
    if (!countryCode(c.country, c.name) && !/^[a-z]{2}$/i.test(String(c.country || ''))) { skipped.push(`${c.id} ${c.name}（国家：${c.country || '空'}）`); continue; }
    if (!APPLY) { if (c.official_website) byDomain++; else byPinyin++; continue; }
    // 清空让触发器按官网重算；算不出来（没官网 / 官网不是正常域名）再补拼音
    if (c.official_website) {
      const { data: u, error: e } = await db.from('companies').update({ external_id: null }).eq('id', c.id).select('external_id').single();
      if (e) throw e;
      if (u.external_id) { byDomain++; continue; }
    }
    if (await ensureCompanyFloraId(c.id)) byPinyin++;
    else skipped.push(`${c.id} ${c.name}（拼音为空）`);
  }
  console.log(`① 企业编号：按官网 ${byDomain} 家，按拼音 ${byPinyin} 家，锁定未动 ${locked} 家，没处理 ${skipped.length} 家`);
  if (skipped.length) console.log('   没处理的：\n   ' + skipped.join('\n   '));
  if (APPLY) {
    const { data: s } = await db.from('companies').select('name, external_id').in('name', ['大疆创新', '好未来', '追光动画', 'vivo', '大疆农业']);
    console.log('   抽查：', (s || []).map((r: any) => `${r.name} → ${r.external_id}`).join('，'));
  }
}

// ── ② 岗位按城市拆分 ──
if (run('split')) {
  const { data: jobs, error } = await selectAll(() => db.from('jobs').select('*').not('if_delete', 'is', true).not('location', 'is', null).order('id'));
  if (error) throw error;
  const keys = new Set((jobs as any[]).map(j => j.dedupe_key));
  let split = 0, added = 0, clash = 0; const eg: string[] = [];
  for (const j of jobs as any[]) {
    const cities = splitLocations(j.location);
    if (cities.length < 2) continue;
    split++;
    const linkKey = !String(j.dedupe_key).startsWith(`${j.company_id}|`);
    const what = linkKey ? '' : String(j.dedupe_key).split('|')[1];
    const keyOf = (city: string) => linkKey ? `${j.dedupe_key}|${normCity(city)}` : `${j.company_id}|${what}|${city.trim().toLowerCase()}`;
    if (eg.length < 6) eg.push(`${j.name}：${j.location} → ${cities.join(' / ')}`);
    const [first, ...rest] = cities;
    if (APPLY) {
      const { error: e1 } = await db.from('jobs').update({ location: first, city: first, dedupe_key: keyOf(first) }).eq('id', j.id);
      if (e1) { clash++; continue; }
    }
    for (const city of rest) {
      const k = keyOf(city);
      if (keys.has(k)) { clash++; continue; }   // 这个城市已经有单独一条了
      keys.add(k); added++;
      if (!APPLY) continue;
      const { id, external_id, applysquare_id, created_at, ...copy } = j;
      const { error: e2 } = await db.from('jobs').insert({ ...copy, location: city, city, dedupe_key: k });
      if (e2) { clash++; added--; console.log('   插入失败', j.id, city, e2.message); }
    }
  }
  console.log(`② 岗位拆分：${split} 条多城市岗位，新增 ${added} 条单城市岗位，跳过 ${clash} 个（该城市已有）`);
  console.log('   例：\n   ' + eg.join('\n   '));
}

// ── ③ 重复岗位合并 ──
if (run('dedupe')) {
  const { data: jobs, error } = await selectAll(() => db.from('jobs').select('id, company_id, name, location, job_req_id, status, human_review_status, link, source_url, last_seen_at, updated_at').not('if_delete', 'is', true).order('id'));
  if (error) throw error;
  const groups = new Map<string, any[]>();
  for (const j of jobs as any[]) {
    if (!j.company_id) continue;
    const k = `${j.company_id}|${String(j.name).trim().toLowerCase()}|${normCity(j.location)}`;
    groups.set(k, [...(groups.get(k) || []), j]);
  }
  const score = (j: any) => (j.status === 'open' ? 8 : 0) + (j.human_review_status && j.human_review_status !== 'review' ? 4 : 0) + (j.link && j.link !== j.source_url ? 2 : 0);
  const drop: number[] = []; const eg: string[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => score(b) - score(a) || String(b.last_seen_at || b.updated_at).localeCompare(String(a.last_seen_at || a.updated_at)));
    const keep = g[0];
    for (const o of g.slice(1)) {
      if (o.job_req_id && keep.job_req_id && o.job_req_id !== keep.job_req_id) continue;   // 编号不同：两个岗位
      if (o.source_url !== keep.source_url && o.status !== 'closed' && keep.status !== 'closed') continue;   // 两个来源页都在招：不确定，不动
      drop.push(o.id);
      if (eg.length < 8) eg.push(`${o.name}（${o.location}）：留 #${keep.id} ${keep.status}，并掉 #${o.id} ${o.status}`);
    }
  }
  console.log(`③ 重复岗位：${drop.length} 条并掉（if_delete = true，列表 / 导出默认不再出现）`);
  console.log('   例：\n   ' + eg.join('\n   '));
  if (APPLY) for (let i = 0; i < drop.length; i += 200) {
    const { error: e } = await db.from('jobs').update({ if_delete: true, status: 'closed' }).in('id', drop.slice(i, i + 200));
    if (e) throw e;
  }
}
