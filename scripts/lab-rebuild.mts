/** 删掉指定职业的空间再用当前提示词重建：npx tsx scripts/lab-rebuild.mts 中式烹调师 消防员 … */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const want = process.argv.slice(2);
if (!want.length) { console.error('要重建哪些职业？'); process.exit(1); }
const { data } = await supabaseAdmin.from('skill_tasks').select('id, skill_id, profile, jd_snapshot');
for (const t of (data || []) as any[]) {
  const prof = t.jd_snapshot?.career?.profession || '';
  if (!want.includes(prof)) continue;
  console.log(`删掉旧的 ${t.profile?.name} · ${prof}`);
  await supabaseAdmin.from('skill_tasks').delete().eq('id', t.id);
  if (t.skill_id) await supabaseAdmin.from('skills').delete().eq('id', t.skill_id);
}
console.log('\n开始重建……\n');
const { spawn } = await import('node:child_process');
spawn('npx', ['tsx', 'scripts/lab-batch-build.mts', ...want], { stdio: 'inherit' });
