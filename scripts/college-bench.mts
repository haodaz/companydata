/**
 * 百业 Bench v0（2026-10-24）：模型 × 课程的跑分矩阵。每格 = 入学考（裸考，考核章）→ 上课（全章）→ 毕业考（同一章，装技能卡 + 笔记）→ 真活实习（有相关真活才做）。
 * 评分全部走学院评价体系（学院口径 v1 + 真活 rubric），对外不提评分模型。结果写 scripts/.college-bench.json，可 --resume 续跑。
 *   npx tsx scripts/college-bench.mts [--dry] [--models qwen-plus,deepseek-v4-pro,gpt-5.6-terra,claude-sonnet-5-5] [--courses id1,id2,...]
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const argv = process.argv.slice(2); const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry');
const MODELS = opt('models', 'qwen-plus,deepseek-v4-pro,gpt-5.6-terra,claude-sonnet-5-5').split(',');
const COURSES = opt('courses', '640f3bc6,b0614543,a35a662d,c9783880,f9add4b9').split(',');
const OUT = 'scripts/.college-bench.json';
const LOG = 'scripts/.college-bench.log';
const log = (s: string) => { const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${s}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); };

const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { createEnrollment, enrollmentDetail, listCourses } = await import('../src/lib/college-admin');
const { runChapterExam, attendClass, runWorkExam, pickableWorkTasks } = await import('../src/lib/college-train');

const state: Record<string, any> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { cells: {} };
const save = () => fs.writeFileSync(OUT, JSON.stringify(state, null, 2));

// 课程：按 id 前缀找
const all = await listCourses();
const courses = COURSES.map(p => all.find((c: any) => c.id.startsWith(p))).filter(Boolean) as any[];
log(`课程 ${courses.length}：${courses.map(c => `${c.role}（${c.company || c.title.slice(0, 10)}）`).join('、')}`);
log(`模型 ${MODELS.join('、')}`);

// 跑分学员：每个模型一位「Bench · 模型」学员（和日常学员分开，不混分数）
async function benchStudent(model: string) {
  const name = `Bench · ${model}`;
  const { data } = await db.from('college_students').select('id').eq('name', name).maybeSingle();
  if (data) return data.id;
  const { data: row, error } = await db.from('college_students').insert({ name, kind: 'platform', model_id: model, org: 'benchmark', created_by: 'bench' }).select('id').single();
  if (error) throw error; return row.id;
}

for (const c of courses) {
  const related = (await pickableWorkTasks(c.id)).find(w => w.related);
  log(`\n═══ ${c.role} · ${c.title.slice(0, 24)} · 章 ${c.chapters} · 相关真活 ${related ? related.title : '无'}`);
  for (const model of MODELS) {
    const key = `${c.id}|${model}`;
    const cell = state.cells[key] ||= { course: c.role, course_id: c.id, model, entrance: null, final: null, work: null, work_baseline: null };
    if (cell.final != null && (cell.work != null || !related)) { log(`  ${model}：已有，跳过`); continue; }
    if (DRY) { log(`  ${model}：待跑`); continue; }
    const t0 = Date.now();
    try {
      const sid = await benchStudent(model);
      const en = await createEnrollment(sid, c.id, 'bench');
      cell.enrollment_id = en.id;
      if (cell.entrance == null) { const r = await runChapterExam(en.id, null, false); cell.entrance = r.score; log(`  ${model} 入学考 ${r.score}`); }
      if (!cell.classed) { const d = await enrollmentDetail(en.id); for (const ch of d.chapters) { try { await attendClass(en.id, ch.id); } catch (e: any) { log(`   上课 ${ch.title} 失败：${String(e.message).slice(0, 80)}`); } } cell.classed = true; log(`  ${model} 上完课 ${(await enrollmentDetail(en.id)).chapters.length} 章`); }
      if (cell.final == null) { const r = await runChapterExam(en.id, null, true); cell.final = r.score; log(`  ${model} 毕业考 ${r.score}`); }
      if (related && cell.work == null) { const r = await runWorkExam(en.id, related.id); cell.work = r.score; cell.work_baseline = r.baseline; log(`  ${model} 真活 ${r.score}（基线 ${r.baseline}）`); }
      cell.seconds = Math.round((Date.now() - t0) / 1000); save();
    } catch (e: any) { cell.error = String(e?.message || e).slice(0, 200); save(); log(`  ${model} 失败：${cell.error}`); }
  }
}
save();
// 表
log('\n模型 × 课程（入学 → 毕业 | 真活/基线）');
const head = ['模型', ...courses.map(c => c.role)]; log(head.join(' | '));
for (const m of MODELS) log([m, ...courses.map(c => { const x = state.cells[`${c.id}|${m}`]; return x ? `${x.entrance ?? '–'} → ${x.final ?? '–'}${x.work != null ? ` | ${x.work}/${x.work_baseline ?? '–'}` : ''}${x.error ? ' ✗' : ''}` : '–'; })].join(' | '));
process.exit(0);
