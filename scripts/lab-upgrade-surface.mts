/**
 * 通用：把某个交互故事台面写进一个空间的某一章（替换那一章原有的工位步骤；没有工位就插在第二步）。
 *   npx tsx scripts/lab-upgrade-surface.mts <规格名> <空间 id 前缀> [时段] [--prompt "…"] [--image <底图 url>] [--remove]
 *   规格名 = src/lib/lab-<名>-spec.ts 里导出的 *Spec 函数，例如 repair / triage / chef
 * 旧工位备份到 scripts/.bench-backup-<空间前 8 位>-<时段>.json；--remove 从备份换回。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');
const argv = process.argv.slice(2);
const remove = argv.includes('--remove');
const pi = argv.indexOf('--prompt'); const prompt = pi >= 0 ? argv[pi + 1] : '';
const ii = argv.indexOf('--image'); const imageArg = ii >= 0 ? argv[ii + 1] : '';
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--prompt' && argv[i - 1] !== '--image');
const [name, prefix, slot] = pos;
if (!name || !prefix) { console.error('用法见文件头'); process.exit(1); }

const mod: any = await import(`../src/lib/lab-${name}-spec`);
const fn = Object.values(mod).find((v: any) => typeof v === 'function' && /Spec$/.test(v.name)) as any;
const { data: all } = await db.from('skill_tasks').select('id, title, profile');
const task = (all || []).find(t => t.id.startsWith(prefix));
if (!task) throw new Error('没有这个空间');
const { data: chs } = await db.from('lab_chapters').select('id, seq, slot, title, sim').eq('task_id', task.id).order('seq');
const ch = slot ? (chs || []).find(c => c.slot === slot) : (chs || []).find(c => (c.sim as any)?.steps?.some((s: any) => s.type === 'bench')) || (chs || [])[0];
if (!ch) throw new Error('没有章节');
const sim = ch.sim as any;
const backup = `scripts/.bench-backup-${task.id.slice(0, 8)}-${(ch.slot || 'first').replace(':', '')}.json`;
const i = sim.steps.findIndex((s: any) => s.type === 'bench');

if (remove) {
  if (!fs.existsSync(backup)) throw new Error('没有备份');
  const old = JSON.parse(fs.readFileSync(backup, 'utf8'));
  if (old) { if (i >= 0) sim.steps[i] = old; } else sim.steps = sim.steps.filter((s: any) => s.id !== `surface_${name}`);
} else {
  const old = i >= 0 ? sim.steps[i] : null;
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(old, null, 1));
  const spec = fn(imageArg || old?.bench?.scene?.image || '');
  if (!sanitizeBenchSpec(spec)) throw new Error('规格表达式有问题');
  const script = spec.expertScript || [];
  const tr = simulateScript(spec, script, Math.max(60, ...script.map((x: any) => x.t)) + 12, 0.25);
  console.log('示范：目标', tr.metrics.goals_done, '/', tr.metrics.goals_total, '违规', tr.metrics.violations, '提醒', tr.metrics.warnings);
  if (tr.metrics.goals_done < tr.metrics.goals_total || tr.metrics.violations) { console.log(tr.events.filter(e => e.kind === 'rule' || e.kind === 'goal').map(e => `${e.t} ${e.kind} ${e.label}`).join('\n')); throw new Error('示范没走通'); }
  const step = { id: old?.id || `surface_${name}`, type: 'bench', prompt: prompt || old?.prompt || spec.brief.slice(0, 60), scene: old?.scene, bench: spec };
  if (i >= 0) sim.steps[i] = step; else sim.steps.splice(Math.min(1, sim.steps.length), 0, step);
}
const { error } = await db.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', ch.id);
if (error) throw error;
// 第一章在 skill_tasks.sim 上可能有镜像
if (ch.seq === 0 || ch === (chs || [])[0]) { const { data: t } = await db.from('skill_tasks').select('sim').eq('id', task.id).single(); if (t?.sim?.steps) { const j = t.sim.steps.findIndex((s: any) => s.type === 'bench'); if (j >= 0 && i >= 0) { t.sim.steps[j] = sim.steps[i]; await db.from('skill_tasks').update({ sim: t.sim }).eq('id', task.id); console.log('skill_tasks.sim 镜像也更新了'); } } }
console.log(remove ? '已换回' : `已写入 ${name}：${(task as any).profile?.role || task.title} · ${ch.slot || '第一章'} · ${ch.id}`);
