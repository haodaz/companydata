/**
 * 急诊护士空间：在指定时段的章节里加一步「预检分诊台」（src/lib/lab-triage-spec.ts）。
 *   npx tsx scripts/lab-upgrade-triage.mts <空间 id 前缀> [时段，默认第一章] [--remove]
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { triageSpec } = await import('../src/lib/lab-triage-spec');
const { sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');
const argv = process.argv.slice(2); const remove = argv.includes('--remove');
const [prefix, slot] = argv.filter(a => !a.startsWith('--'));
const { data: all } = await db.from('skill_tasks').select('id, title');
const task = (all || []).find(t => t.id.startsWith(prefix))!;
const { data: chs } = await db.from('lab_chapters').select('id, seq, slot, title, sim').eq('task_id', task.id).order('seq');
const ch = slot ? (chs || []).find(c => c.slot === slot)! : (chs || [])[0];
const sim = ch.sim; sim.steps = sim.steps.filter((s: any) => s.id !== 'triage');
if (!remove) {
  const old = sim.steps.find((s: any) => s.type === 'bench');
  const spec = triageSpec(old?.bench?.scene?.image || '');
  if (!sanitizeBenchSpec(spec)) throw new Error('表达式有问题');
  const tr = simulateScript(spec, spec.expertScript!, 90, 0.25);
  console.log('示范：目标', tr.metrics.goals_done, '/', tr.metrics.goals_total, '违规', tr.metrics.violations, '提醒', tr.metrics.warnings, '质量', Math.round(tr.final.quality));
  if (tr.metrics.goals_done < tr.metrics.goals_total || tr.metrics.violations) { console.log(tr.events.filter(e => e.kind === 'rule' || e.kind === 'goal').map(e => `${e.t} ${e.kind} ${e.label}`).join('\n')); throw new Error('示范没走通'); }
  // 原来生成的那台「控制台」工位换掉；没有就插在第二步
  const i = sim.steps.findIndex((s: any) => s.type === 'bench');
  const step = { id: 'triage', type: 'bench', prompt: '早高峰的预检台：六个病人前后脚到，先看谁、量什么、分几级、送哪儿', scene: old?.scene, bench: spec };
  if (i >= 0) sim.steps[i] = step; else sim.steps.splice(Math.min(1, sim.steps.length), 0, step);
}
const { error } = await db.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', ch.id);
if (error) throw error;
console.log(remove ? '已去掉' : `已写入预检分诊台：${task.title} · ${ch.slot || '第一章'} ${ch.id}`);
