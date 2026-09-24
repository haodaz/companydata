/** 把种子 sim 的美术（art）刷进已经建好的演示空间：npx tsx scripts/lab-refresh-art.mts */
import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { SEED_CASES } = await import('../src/lib/skill-lab-seed');
const { SEED_SIMS } = await import('../src/lib/skill-lab-seed-sims');
for (let i = 0; i < SEED_CASES.length; i++) {
  const slug = SEED_CASES[i].skill.slug, art = SEED_SIMS[i].sim.art;
  const { data } = await supabaseAdmin.from('skill_tasks').select('id, sim, skill:skills!inner(slug)').eq('skill.slug', slug);
  for (const t of data || []) {
    const sim = { ...(t.sim as any), art };
    const { error } = await supabaseAdmin.from('skill_tasks').update({ sim }).eq('id', t.id);
    console.log(error ? `❌ ${slug}: ${error.message}` : `✅ ${slug} → ${t.id} art=${art ? Object.keys(art.npcs || {}).join(',') : '无'}`);
  }
}
