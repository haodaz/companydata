/** 体检：批量生成的空间都长什么样——工位、场景图、提示词，一眼看出哪个跑偏了 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { simulateScript } = await import('../src/lib/bench');
const { data } = await supabaseAdmin.from('skill_tasks').select('id, title, sim, created_by, jd_snapshot, skill:skills(name, source)').order('created_at', { ascending: false }).limit(40);
const only = process.argv[2];
for (const t of (data || []) as any[]) {
  const prof = t.jd_snapshot?.career?.profession;
  if (!prof) continue;
  if (only && !prof.includes(only)) continue;
  const sim = t.sim || {};
  const b = (sim.steps || []).find((s: any) => s.type === 'bench');
  console.log(`\n━━ ${prof} · ${t.id.slice(0, 8)}`);
  console.log(`   故事线：${sim.title} · ${(sim.steps || []).length} 步`);
  if (b) {
    const sp = b.bench;
    let res = '';
    try { const tr = simulateScript(sp, sp.expertScript || [], Math.max(...(sp.expertScript || [{ t: 0 }]).map((a: any) => a.t)) + 30); res = `老手 ${tr.metrics.goals_done}/${tr.metrics.goals_total} 违规 ${tr.metrics.violations}`; } catch (e: any) { res = '跑不动：' + e.message; }
    console.log(`   工位：${sp.name}（${res}）`);
    console.log(`   层：${sp.scene ? sp.scene.layers.map((l: any) => l.kind).join(',') : '无'}`);
  } else console.log('   工位：无');
  const art = sim.art || {};
  const urls = [...new Set([art.cover, ...Object.values(art.scenes || {})].filter(Boolean))] as string[];
  console.log(`   场景图 ${urls.length} 张 · 立绘 ${Object.keys(art.npcs || {}).length} 张`);
  for (const u of urls) console.log(`     ${u}`);
}
