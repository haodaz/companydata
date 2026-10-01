/**
 * 给还没有名字的空间分配 NOVA 编号与称呼：npx tsx scripts/lab-assign-nova.mts [--dry]
 * 名字按创建顺序排，称呼优先用生成器给的 role，没有就从职业名推。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const dry = process.argv.includes('--dry');

const { data } = await supabaseAdmin.from('skill_tasks').select('id, profile, jd_snapshot, created_at, skill:skills(source)').order('created_at', { ascending: true });
if (process.argv.includes('--reset')) {
  for (const t of (data || []) as any[]) {
    const src = (Array.isArray(t.skill) ? t.skill[0] : t.skill)?.source;
    if (src === 'jd-draft' && t.profile?.name) {
      const { name, role, ...rest } = t.profile;
      if (!dry) await supabaseAdmin.from('skill_tasks').update({ profile: rest }).eq('id', t.id);
      t.profile = rest;
    }
  }
  console.log('已清掉 AI 生成空间的旧编号\n');
}
const used = new Set<number>();
for (const t of (data || []) as any[]) {
  const m = String(t.profile?.name || '').match(/^NOVA-(\d+)$/);
  if (m) used.add(Number(m[1]));
}
let next = 21;   // 01–20 留给手写的预置示范
const take = () => { while (used.has(next)) next++; used.add(next); return next; };

/** 没有 role 的，从职业 / 岗位名里挑一个像称呼的词 */
const roleFrom = (s: string) => {
  // 只取第一个词（早期试的职业名里有「外科医生，动手术，腹腔手术」这种）
  const t = String(s || '').split(/[,，、\/]/)[0].replace(/（.*?）|\(.*?\)/g, '').trim();
  const m = t.match(/[\u4e00-\u9fa5]{1,4}(师傅|医师|工程师|护理师|设计师|分析师|治疗师|技师|教练|顾问|导游|律师|师|员)/);
  const r = (m ? m[0] : t) || '从业者';
  return r.length > 7 ? r.slice(-5) : r;
};

let n = 0;
for (const t of (data || []) as any[]) {
  if (t.profile?.name) continue;
  const prof = t.jd_snapshot?.career?.profession || t.jd_snapshot?.title || '';
  const name = `NOVA-${String(take()).padStart(2, '0')}`;
  const role = t.profile?.role || roleFrom(prof);
  console.log(`${dry ? '·' : '✅'} ${name} · ${role}   ← ${prof}`);
  if (!dry) await supabaseAdmin.from('skill_tasks').update({ profile: { ...(t.profile || {}), name, role } }).eq('id', t.id);
  n++;
}
console.log(`\n${dry ? '（--dry）' : ''}共 ${n} 个空间分到了名字`);
