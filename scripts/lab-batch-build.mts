/**
 * 批量建空间：一个职业名一个空间，串行跑（生图有速率限制，并行只会互相挤）。
 *   npx tsx scripts/lab-batch-build.mts            跑内置清单
 *   npx tsx scripts/lab-batch-build.mts 导游 潜水   只跑指定的
 * 已经建过同名职业的会跳过。失败的记下来，最后一起列出来重跑。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { structureCareer } = await import('../src/lib/agents/career');
const { buildSpaceFromJd } = await import('../src/lib/agents/skill-lab-build');

const LIST = [
  // 高精尖材料
  '半导体材料工程师', '碳纤维复合材料成型工艺师',
  // 先进制造
  '五轴数控加工技师',
  // 防风险
  '消防员',
  // 大农业
  '智慧农业技术员',
  // 建筑
  '建筑设计师', '混凝土结构工程师', '室内装修工长',
  // 金融
  '证券分析师',
  // 心理与疗愈
  '艺术治疗师', '心理咨询师',
  // 生活服务
  '宠物美容师', '母婴护理师', '导游', '潜水教练',
  // 法律
  '律师',
  // 中医
  '中医推拿按摩师', '中医针灸医师',
];

const want = process.argv.slice(2).length ? process.argv.slice(2) : LIST;
const { data: exist } = await supabaseAdmin.from('skill_tasks').select('jd_snapshot');
const done = new Set((exist || []).map((t: any) => t.jd_snapshot?.career?.profession).filter(Boolean));

const ok: string[] = [], fail: [string, string][] = [];
for (const [n, prof] of want.entries()) {
  if (done.has(prof)) { console.log(`\n[${n + 1}/${want.length}] ${prof} —— 已经有了，跳过`); continue; }
  const t0 = Date.now();
  console.log(`\n[${n + 1}/${want.length}] ${prof} ……`);
  try {
    const { jd, career } = await structureCareer(prof);
    const built = await buildSpaceFromJd(jd, undefined, (p, d) => process.stdout.write(`   · ${p}${d ? ' — ' + d : ''}\n`), {
      hint: '这是面向高中生 / 大学生的「职业探索空间」，不是招聘考核：任务要让一个完全没入行的人也能上手体验这个职业最有代表性的一天，材料自解释、术语随手解释，难度比校招题降一档；故事线要有带教的前辈，让人感受到这个职业真实的工作节奏与判断方式。',
    });
    const { data: skill, error: e1 } = await supabaseAdmin.from('skills').insert({
      slug: `career-${Date.now().toString(36)}-${n}`, ...built.skill, interview: [],
      expert_name: '岗位 AI 自学草案', expert_title: '从职业公开知识推断 · 等待第一位从业者校正', expert_location: '云端', expert_note: '尚未有真人专家', tz_offset: 0,
      source: 'jd-draft', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: 'batch',
    }).select('id').single();
    if (e1) throw e1;
    const { data: task, error: e2 } = await supabaseAdmin.from('skill_tasks').insert({
      job_id: null, skill_id: skill.id,
      jd_snapshot: { ...jd, kind: 'career', career, fetched_at: new Date().toISOString().slice(0, 10) },
      ...built.task, created_by: 'batch',
    }).select('id').single();
    if (e2) throw e2;
    const sim: any = built.task.sim;
    const b = sim.steps.find((s: any) => s.type === 'bench');
    console.log(`   ✅ ${Math.round((Date.now() - t0) / 1000)}s · ${sim.steps.length} 步 · 工位 ${b ? b.bench.name : '无'} · 美术 ${built.artCount} 新 + ${built.artReused} 复用 · ${task.id}`);
    ok.push(prof);
  } catch (e: any) {
    console.log(`   ❌ ${prof}: ${e?.message || e}`);
    fail.push([prof, String(e?.message || e).slice(0, 120)]);
  }
}
console.log(`\n══ 完成 ${ok.length} / 失败 ${fail.length} ══`);
for (const [p, m] of fail) console.log(`  ❌ ${p} — ${m}`);
if (fail.length) console.log(`\n重跑：npx tsx scripts/lab-batch-build.mts ${fail.map(f => f[0]).join(' ')}`);
