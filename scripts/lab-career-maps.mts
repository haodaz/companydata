/**
 * 给从 JD 建的精选空间补「职业地图」（2026-10-12，用户：职业地图有些岗位没有，补前面几个就行）。
 * 职业探索空间建的时候就有；从 JD 建的没有。这里按空间的岗位称呼跑一遍 structureCareer，只取生涯地图那半写进 jd_snapshot.career。
 *   npx tsx scripts/lab-career-maps.mts          精选名单里还没有职业地图的
 *   npx tsx scripts/lab-career-maps.mts 71a6cbf5 只补这几个（编号前缀）
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { structureCareer } = await import('../src/lib/agents/career');
const { FEATURED_SPACES } = await import('../src/lib/lab-featured');
const want = process.argv.slice(2).length ? process.argv.slice(2) : FEATURED_SPACES;
const { data: spaces } = await db.from('skill_tasks').select('id, title, profile, jd_snapshot');
for (const p of want) {
  const s = (spaces || []).find(x => x.id.startsWith(p)); if (!s) continue;
  const jd: any = s.jd_snapshot || {};
  if (jd.career) { console.log('已有', s.id.slice(0, 8), jd.career.profession); continue; }
  const role = String(s.profile?.role || jd.title || s.title).replace(/[（(].*?[)）]/g, '').trim();
  try {
    const { career } = await structureCareer(role);
    await db.from('skill_tasks').update({ jd_snapshot: { ...jd, career: { ...career, profession: role } } }).eq('id', s.id);
    console.log('✓', s.id.slice(0, 8), role);
  } catch (e: any) { console.log('✗', s.id.slice(0, 8), role, e.message); }
}
process.exit(0);
