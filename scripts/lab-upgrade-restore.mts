/**
 * 古籍补书人 11:10 章：加一步「修复台 · 补虫洞」（src/lib/lab-restore-spec.ts），放在写修复日志之前。
 *   npx tsx scripts/lab-upgrade-restore.mts            # 写入（已有就替换）
 *   npx tsx scripts/lab-upgrade-restore.mts --remove
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { restoreSpec } = await import('../src/lib/lab-restore-spec');
const { sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');

const CHAPTER = '3653d14c-8b2e-43f0-bf9f-4d73addb3e9a';
const IMAGE = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/mv38sqq1gqw5-bench.jpg';
const remove = process.argv.includes('--remove');
const { data: ch, error } = await db.from('lab_chapters').select('sim').eq('id', CHAPTER).single();
if (error) throw error;
const sim = ch.sim;
sim.steps = sim.steps.filter((s: any) => s.id !== 'restore');
if (!remove) {
  const spec = restoreSpec(IMAGE);
  if (!sanitizeBenchSpec(spec)) throw new Error('表达式有问题');
  const tr = simulateScript(spec, spec.expertScript!, 50, 0.25);
  console.log('示范：目标', tr.metrics.goals_done, '/', tr.metrics.goals_total, '违规', tr.metrics.violations, '提醒', tr.metrics.warnings, '质量', Math.round(tr.final.quality));
  if (tr.metrics.goals_done < tr.metrics.goals_total || tr.metrics.violations) { console.log(tr.events.filter(e => e.kind === 'rule' || e.kind === 'goal').map(e => `${e.t} ${e.kind} ${e.label}`).join('\n')); throw new Error('示范没走通'); }
  const i = sim.steps.findIndex((s: any) => s.id === 'repair_log_note');
  sim.steps.splice(i < 0 ? sim.steps.length : i, 0, {
    id: 'restore', type: 'bench', prompt: '在修复台上把第 7 叶右下的虫洞补好：喷潮、蘸浆、刷边、对位、压实、等半干、揭吸水纸',
    scene: { who: '苏师傅', time: '12:00', text: '第 7 叶右下那个虫洞，你来补。记住——水是少量多次，这张竹纸见水就洇；浆糊只到破口边上，宁薄勿厚；补纸对准了再放手，压实了要等，等不及去揭，前面全白做。' },
    bench: spec,
  });
  if (sim.art?.scenes) sim.art.scenes.restore = IMAGE;
}
const { error: e2 } = await db.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', CHAPTER);
if (e2) throw e2;
console.log(remove ? '已去掉修复台' : '已写入修复台（11:10 章）');
