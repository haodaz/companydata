/**
 * 月嫂带教官 18:00 章：加一步「哄睡台」（src/lib/lab-yuesao-spec.ts），放在晚班陈敏复述之后、写交接留言之前。
 *   npx tsx scripts/lab-upgrade-yuesao.mts            # 写入（已有就替换）
 *   npx tsx scripts/lab-upgrade-yuesao.mts --remove   # 去掉这一步
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { sootheSpec } = await import('../src/lib/lab-yuesao-spec');
const { sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');

const CHAPTER = '8e0a51ca-fe97-4568-8fd8-02651079faea';
const IMAGE = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art/19fd15d1-bench-baby-mv2o4xv1.jpg';
const remove = process.argv.includes('--remove');

const { data: ch, error } = await db.from('lab_chapters').select('sim').eq('id', CHAPTER).single();
if (error) throw error;
const sim = ch.sim;
sim.steps = sim.steps.filter((s: any) => s.id !== 'soothe');
if (!remove) {
  const spec = sootheSpec(IMAGE);
  if (!sanitizeBenchSpec(spec)) throw new Error('哄睡台表达式有问题');
  const tr = simulateScript(spec, spec.expertScript!, 60, 0.25);
  console.log('示范：目标', tr.metrics.goals_done, '/', tr.metrics.goals_total, '违规', tr.metrics.violations, '提醒', tr.metrics.warnings, 'calm', Math.round(tr.final.calm), '质量', Math.round(tr.final.quality));
  if (tr.metrics.goals_done < tr.metrics.goals_total || tr.metrics.violations) { console.log(tr.events.filter(e => e.kind === 'rule' || e.kind === 'goal').map(e => `${e.t} ${e.kind} ${e.label}`).join('\n')); throw new Error('示范脚本没走通'); }
  const i = sim.steps.findIndex((s: any) => s.id === 'write_final_handover');
  sim.steps.splice(i < 0 ? sim.steps.length : i, 0, {
    id: 'soothe', type: 'bench', prompt: '802 房的宝宝哭起来了：抱起来哄睡，再放回床里',
    scene: { who: '张姐', time: '18:22', text: '802 的宝宝突然哭起来了，周宁刚喂完奶在休息，别叫她。你来——抱起来，托住头，灯调暗一点，按着节奏轻轻拍，等他睡踏实了再放回床里。放早了，他马上就醒。' },
    bench: spec,
  });
  if (sim.art?.scenes) sim.art.scenes.soothe = IMAGE;
}
const { error: e2 } = await db.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', CHAPTER);
if (e2) throw e2;
console.log(remove ? '已去掉哄睡台' : '已写入哄睡台（18:00 章）');
