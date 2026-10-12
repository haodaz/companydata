/**
 * 把章节里的代码台面换成母版配置（2026-10-12，用户：「写死的部分复制一批进数据库，重点 demo 留代码保底」）。
 *   npx tsx scripts/lab-to-master.mts            试跑：列出会改哪些章节、新规格能不能过清洗
 *   npx tsx scripts/lab-to-master.mts --apply    写库（先把原样备份到 scripts/.master-backup-<时间>.json）
 *   npx tsx scripts/lab-to-master.mts --revert <备份文件>   按备份原样改回去
 * 只换「画法」：surface 改成母版名、加 surfaceConfig；库里的 vars / rules / goals / 老手脚本原样不动，所以判分和作答记录不受影响。
 * 代码版组件全部保留：把 surface 改回旧名就回到代码版。重点 demo 不在下面的清单里，不会被换。
 * 每改一章记一笔 lab_edits（source=script）；第 1 章同步 skill_tasks.sim。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { sanitizeBenchSpec, simulateScript, playDt } = await import('../src/lib/bench');
const { recordEdit } = await import('../src/lib/lab-edits');
const { SWITCHING_FIELD } = await import('../src/lib/lab-switching-field');
const { REPAIR_FIELD } = await import('../src/lib/lab-repair-field');
const { CONVERTER_CONSOLE } = await import('../src/lib/lab-converter-console');
const { GARDEN_FIELD } = await import('../src/lib/lab-garden-field');
const { CHEF_FIELD } = await import('../src/lib/lab-chef-field');

const mods = await Promise.all(['desktop', 'dialog', 'dispatch', 'hands'].map(m => import(`../src/lib/masters/${m}-samples`)));
const extra = mods.map(x => x.TO_MASTER || {});
/** 整台搬（比如拉花：配置按每台工位的场景层现算，还要清掉旧场景层，不然 BenchRunner 会再挂一套摄像头）：旧台面名 → (bench) => 新 bench */
const WHOLE: Record<string, (b: any) => any> = Object.assign({}, ...mods.map(x => x.MIGRATE_BENCH || {}));
/** 旧的代码台面名 → 母版配置。重点 demo（teststand 火箭 / laparotomy 外科 / paving 沥青 / desk 数据分析 / cad / sandtable、levee 应急 / greenhouse 温室）不在这里。
 *  可以只搬某几个：--only audit,triage */
const ALL: Record<string, any> = { switching: SWITCHING_FIELD, repair: REPAIR_FIELD, converter: CONVERTER_CONSOLE, garden: GARDEN_FIELD, chef: CHEF_FIELD, ...Object.assign({}, ...extra) };
const KEEP_CODE = ['teststand', 'laparotomy', 'paving', 'desk', 'cad', 'sandtable', 'levee', 'greenhouse'];
for (const k of KEEP_CODE) delete ALL[k];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const MAP = only ? Object.fromEntries(Object.entries(ALL).filter(([k]) => only.includes(k))) : ALL;

const args = process.argv.slice(2);
if (args[0] === '--revert') {
  const rows = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  for (const r of rows) {
    await db.from('lab_chapters').update({ sim: r.sim, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (r.seq === 1) await db.from('skill_tasks').update({ sim: r.sim }).eq('id', r.task_id);
    console.log('已改回', r.id, r.title);
  }
  process.exit(0);
}
const apply = args.includes('--apply');
const { data: chs, error } = await db.from('lab_chapters').select('id, task_id, seq, slot, title, sim');
if (error) throw error;
const backup: any[] = [];
for (const c of chs || []) {
  const steps = c.sim?.steps || [];
  // 一章里可能有几台工位（拉花一章三台），每台各自换
  const hits = steps.map((s: any, i: number) => (s?.type === 'bench' && MAP[s.bench?.surface] ? i : -1)).filter((i: number) => i >= 0);
  if (!hits.length) continue;
  const nextSteps = [...steps]; let okAll = true; const from: string[] = [];
  for (const hit of hits) {
    const old = steps[hit].bench, m = MAP[old.surface];
    // 配置可以是函数（按这台工位现算），也可以整台搬（WHOLE）
    const next = WHOLE[old.surface] ? WHOLE[old.surface](old) : (() => { const cfg = typeof m === 'function' ? m(old) : m; return { ...old, surface: cfg.master, surfaceConfig: cfg }; })();
    const spec = sanitizeBenchSpec(JSON.parse(JSON.stringify(next)));
    let dry = '—';
    if (spec?.expertScript?.length) { const r = simulateScript(spec, spec.expertScript, Math.min(spec.maxSeconds, Math.max(...spec.expertScript.map(a => a.t)) + 60), playDt(spec)).metrics; dry = `${r.goals_done}/${r.goals_total} 违规 ${r.violations}`; }
    console.log(`${c.task_id.slice(0, 8)} 第 ${c.seq} 章 ${c.slot || ''} ${c.title} · 第 ${hit + 1} 步「${old.name}」${old.surface} → ${next.surface} · ${spec ? '✓ 过清洗' : '✗ 过不了清洗（配置里有规格没有的变量 / 控件）'} · 干跑 ${dry}`);
    if (!spec) { okAll = false; continue; }
    nextSteps[hit] = { ...steps[hit], bench: next }; from.push(old.surface);
  }
  if (!okAll || !apply) continue;
  backup.push({ id: c.id, task_id: c.task_id, seq: c.seq, title: c.title, sim: c.sim });
  const sim = { ...c.sim, steps: nextSteps };
  const { error: e } = await db.from('lab_chapters').update({ sim, updated_at: new Date().toISOString() }).eq('id', c.id);
  if (e) { console.log('  写库失败', e.message); continue; }
  if (c.seq === 1) await db.from('skill_tasks').update({ sim }).eq('id', c.task_id);
  await recordEdit({ task_id: c.task_id, chapter_id: c.id, source: 'script', actor: 'lab-to-master', before: { surface: from.join(',') }, after: { surface: hits.map((i: number) => nextSteps[i].bench.surface).join(',') }, note: '代码台面换成母版配置（surfaceConfig），物理不变' });
}
if (apply && backup.length) {
  const f = `scripts/.master-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
  fs.writeFileSync(f, JSON.stringify(backup));
  console.log(`\n已换 ${backup.length} 章；原样备份在 ${f}（--revert 可改回）`);
} else if (!apply) console.log('\n试跑，没写库；加 --apply 写库');
