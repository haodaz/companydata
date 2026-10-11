/**
 * 开腹医师 09:10 章：把工位换成新的「分层入腹」台面（src/lib/lab-surgery-spec.ts）。
 *   npx tsx scripts/lab-upgrade-surgery.mts            # 写入
 *   npx tsx scripts/lab-upgrade-surgery.mts --restore  # 换回旧工位（从 scripts/.surgery-bench-backup.json）
 * 旧工位先备份到 scripts/.surgery-bench-backup.json。prompt / 对话 / 其他步骤都不动。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { laparotomySpec } = await import('../src/lib/lab-surgery-spec');
const { sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');

const TASK = '681b5f1c-5115-4c32-82ea-69c085b21868', CHAPTER = 'f0f8cd1b-7c16-4797-b58c-d4dfd1d3c4a7';
const BACKUP = 'scripts/.surgery-bench-backup.json';
const restore = process.argv.includes('--restore');

const { data: ch, error } = await db.from('lab_chapters').select('sim').eq('id', CHAPTER).single();
if (error) throw error;
const sim = ch.sim;
const step = sim.steps.find((s: any) => s.type === 'bench');
if (!step) throw new Error('这一章没有工位步骤');

if (restore) {
  step.bench = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
} else {
  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify(step.bench, null, 1));
  const image = step.bench?.scene?.image || 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/seed-surgery_field.jpg';
  const spec = laparotomySpec(image);
  const ok = sanitizeBenchSpec(spec);
  if (!ok) throw new Error('新工位表达式有问题');
  // 示范脚本在模拟器里跑一遍：目标应全部达成、零违规
  const tr = simulateScript(spec, spec.expertScript!, 60, 0.25);
  console.log('示范：目标', tr.metrics.goals_done, '/', tr.metrics.goals_total, '违规', tr.metrics.violations, '提醒', tr.metrics.warnings, '质量', Math.round(tr.final.quality));
  if (tr.metrics.goals_done < tr.metrics.goals_total || tr.metrics.violations) { console.log(tr.events.filter(e => e.kind === 'rule' || e.kind === 'goal').map(e => `${e.t} ${e.kind} ${e.label}`).join('\n')); throw new Error('示范脚本没走通'); }
  step.bench = spec;
  step.prompt = step.prompt || '在开腹工位上完成麦氏切口分层入腹';
}
const { error: e2 } = await db.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', CHAPTER);
if (e2) throw e2;
// 老空间第 1 章在 skill_tasks.sim 上还有一份镜像
const { data: t } = await db.from('skill_tasks').select('sim').eq('id', TASK).single();
if (t?.sim?.steps?.some((s: any) => s.type === 'bench')) { const s2 = t.sim; const b2 = s2.steps.find((s: any) => s.type === 'bench'); b2.bench = step.bench; await db.from('skill_tasks').update({ sim: s2 }).eq('id', TASK); console.log('skill_tasks.sim 镜像也更新了'); }
console.log(restore ? '已换回旧工位' : '已写入新的分层入腹台面');
