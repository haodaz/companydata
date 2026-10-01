/** 把种子里的 profile（名字 / 称呼 / 立绘）刷进已经建好的演示空间：npx tsx scripts/lab-refresh-profile.mts */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { SEED_CASES } = await import('../src/lib/skill-lab-seed');
for (const c of SEED_CASES) {
  const { data } = await supabaseAdmin.from('skill_tasks').select('id, profile, skill:skills!inner(slug)').eq('skill.slug', c.skill.slug);
  for (const t of data || []) {
    const profile = { ...(t.profile as any), ...c.task.profile };
    const { error } = await supabaseAdmin.from('skill_tasks').update({ profile }).eq('id', t.id);
    console.log(error ? `❌ ${c.skill.slug}: ${error.message}` : `✅ ${profile.name} · ${profile.role}  ← ${c.skill.slug}`);
  }
}
