/**
 * 百业学院演示用例 · 开学籍并按学习路径培养到毕业（2026-10-23）。
 *   npx tsx scripts/college-demo-train.mts [--steps 14]
 * 前置：college-demo-prep.mts 建好两门课（并已用 lab-build-full-day 扩成一天）、college-demo-work.mts 出好两道真活。
 * 用例 1：学员 通义千问 Plus（国内模型）上「行业分析师（具身智能方向）」，定向培养给武岳峰资本的需求单。
 * 用例 2：学员 Claude Sonnet 5.5 上「单细胞多组学方向博士后研究员」，定向培养给实验室的需求单。
 * 每一步都是教务处里能人工点的基础功能：入学考 → 上课 → 毕业考 → 反思补考 → 真活 → 毕业 → 派去需求单。日志逐步打印。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { ensurePlatformStudents, createEnrollment, enrollmentDetail, createPlacement } = await import('../src/lib/college-admin');
const { nextStep, advance, runWorkExam } = await import('../src/lib/college-train');

const argv = process.argv.slice(2); const si = argv.indexOf('--steps'); const MAX = si >= 0 ? Number(argv[si + 1]) : 14;
const ME = 'haoz214@gmail.com', OUT = 'scripts/.college-demo.json';
const state: any = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const save = () => fs.writeFileSync(OUT, JSON.stringify(state, null, 2));
const log = (s: string) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${s}`);

await ensurePlatformStudents();
const { data: students } = await db.from('college_students').select('id, model_id').eq('kind', 'platform');
const sid = (m: string) => students!.find(s => s.model_id === m)!.id;

async function train(key: string, model: string, spaceId: string, demandId: string, workId: string | undefined, orgName: string) {
  const en = await createEnrollment(sid(model), spaceId, ME, demandId);
  state[key] = en.id; save();
  log(`学籍 ${key}：${model} × ${spaceId.slice(0, 8)} → ${en.id}`);
  for (let i = 0; i < MAX; i++) {
    const step = await nextStep(en.id);
    if (step.kind === 'done' || step.kind === 'blocked') { log(`${key} 停：${step.label}`); break; }
    const r = await advance(en.id, 1);
    const s = r.steps[0];
    log(`${key} ${s.step.label} → ${s.error ? '出错：' + s.error : s.result?.score != null ? `${s.result.score} 分${s.result.passed ? ' ✓' : ''}` : s.result?.points ? `${s.result.points.length} 条要点` : s.result?.rules ? `${s.result.rules.length} 条规则：${s.result.lesson}` : '完成'}`);
    if (s.error) break;
  }
  // 真活实习：指定我们出的那道（路径里只挑「相关」的，这里直接点名）
  const d = await enrollmentDetail(en.id);
  if (workId && !d.work.length) { try { const w = await runWorkExam(en.id, workId); log(`${key} 真活「${w.title}」${w.score} 分（基线 ${w.baseline ?? '—'}）`); } catch (e: any) { log(`${key} 真活失败：${e?.message}`); } }
  const fin = await enrollmentDetail(en.id);
  log(`${key} 结果：${fin.status} · 入学 ${fin.entrance_score ?? '—'} · 毕业考 ${fin.final_score ?? '—'} · 通过 ${fin.chapters.filter((c: any) => c.passed).length}/${fin.chapters.length} · 规则 ${(fin.notebook?.rules || []).length} 条`);
  if (fin.status === 'graduated' && !fin.placements.length) { await createPlacement({ enrollment_id: en.id, target_kind: 'demand', target_id: demandId, target_name: orgName, note: '学院演示：定向培养毕业，推荐给需求方' }, ME); log(`${key} 已派去需求单：${orgName}`); }
  return en.id;
}

await train('invest_enrollment_id', 'qwen-plus', state.invest_space_id, state.invest_demand_id, state.invest_work_id, '武岳峰资本 · 能看懂具身智能的投资分析师');
await train('bio_enrollment_id', 'claude-sonnet-5-5', state.bio_space_id, state.bio_demand_id, state.bio_work_id, '演示·肿瘤免疫单细胞多组学实验室 · 单细胞数据处理与文献分析研究员');
log('done');
process.exit(0);
