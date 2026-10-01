/** 把种子里的整个 sim（含虚拟工位定义）刷进已建好的演示空间：npx tsx scripts/lab-refresh-sim.mts */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { SEED_CASES } = await import('../src/lib/skill-lab-seed');
const { SEED_SIMS } = await import('../src/lib/skill-lab-seed-sims');
for (let i = 0; i < SEED_CASES.length; i++) {
  const slug = SEED_CASES[i].skill.slug, sim = SEED_SIMS[i].sim;
  const { data } = await supabaseAdmin.from('skill_tasks').select('id, skill:skills!inner(slug)').eq('skill.slug', slug);
  for (const t of data || []) {
    const { error } = await supabaseAdmin.from('skill_tasks').update({ sim }).eq('id', t.id);
    const benches = sim.steps.filter(s => s.type === 'bench').length;
    console.log(error ? `❌ ${slug}: ${error.message}` : `✅ ${slug} → ${sim.steps.length} 步 · ${benches} 台工位`);
  }
}
