/**
 * 数据分析师 09:20 章：把「多维下钻控制台」换成办公桌台面（src/lib/lab-desk-spec.ts）。
 *   npx tsx scripts/lab-upgrade-desk.mts            # 写入（旧工位备份到 scripts/.desk-bench-backup.json）
 *   npx tsx scripts/lab-upgrade-desk.mts --restore
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { deskSpec } = await import('../src/lib/lab-desk-spec');
const { sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');
const TASK = 'a35a662d-2be8-4cc1-a255-4c3f8ad29139';
const BACKUP = 'scripts/.desk-bench-backup.json';
const restore = process.argv.includes('--restore');
const { data: chs } = await db.from('lab_chapters').select('id, slot, sim').eq('task_id', TASK);
const ch = (chs || []).find(c => c.slot === '09:20')!;
const sim = ch.sim; const step = sim.steps.find((s: any) => s.type === 'bench');
if (restore) step.bench = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
else {
  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify(step.bench, null, 1));
  const spec = deskSpec(step.bench?.scene?.image || '');
  if (!sanitizeBenchSpec(spec)) throw new Error('表达式有问题');
  const tr = simulateScript(spec, spec.expertScript!, 60, 0.25);
  console.log('示范：目标', tr.metrics.goals_done, '/', tr.metrics.goals_total, '违规', tr.metrics.violations, '提醒', tr.metrics.warnings, '置信度', Math.round(tr.final.confidence));
  if (tr.metrics.goals_done < tr.metrics.goals_total) { console.log(tr.events.filter(e => e.kind === 'rule' || e.kind === 'goal').map(e => `${e.t} ${e.kind} ${e.label}`).join('\n')); throw new Error('示范没走通'); }
  step.bench = spec;
  step.prompt = '在数据桌上查清楚：周六 GMV 为什么掉了 18%——看对指标、拆对维度、拿到日志证据，写成简报';
}
const { error } = await db.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', ch.id);
if (error) throw error;
const { data: t } = await db.from('skill_tasks').select('sim').eq('id', TASK).single();
if (t?.sim?.steps?.some((s: any) => s.type === 'bench')) { const b2 = t.sim.steps.find((s: any) => s.type === 'bench'); b2.bench = step.bench; await db.from('skill_tasks').update({ sim: t.sim }).eq('id', TASK); console.log('skill_tasks.sim 镜像也更新了'); }
console.log(restore ? '已换回' : '已写入办公桌台面（09:20）');
