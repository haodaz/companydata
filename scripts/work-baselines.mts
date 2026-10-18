/** 真活台 · 给还没有 AI 基线的题跑基线：npx tsx scripts/work-baselines.mts [--force] */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { runBaseline } = await import('../src/lib/work/generator');
const { withCost } = await import('../src/lib/token-logger');
const force = process.argv.includes('--force');
const { data } = await db.from('work_tasks').select('*').order('created_at');
for (const t of (data || []).filter(t => force || !t.baseline)) {
  const t0 = Date.now();
  try {
    const baseline = await withCost({ tool_name: 'work', task_name: 'Baseline · AI 先做一遍', stage: 'create', actor: 'script' }, () => runBaseline({ env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric }, { institution: t.company_name }));
    await db.from('work_tasks').update({ baseline, updated_at: new Date().toISOString() }).eq('id', t.id);
    console.log(`✓ ${t.company_name} · ${t.role} · ${t.task?.title} · 基线 ${baseline.result.total} · ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e: any) { console.log(`✗ ${t.task?.title} · ${String(e.message).slice(0, 120)}`); }
}
process.exit(0);
