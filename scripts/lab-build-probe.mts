/**
 * 检测「岗位 AI 自己把虚拟空间建出来」这条链路：只跑生成，不落库、不生图。
 *   npx tsx scripts/lab-build-probe.mts 西点烘焙师      职业名路径（职业探索）
 *   npx tsx scripts/lab-build-probe.mts --jd [第几条]   岗位库里一条真实 JD 的路径
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { buildSpaceFromJd } = await import('../src/lib/agents/skill-lab-build');
const { simulateScript, benchTimeline } = await import('../src/lib/bench');

const args = process.argv.slice(2);
const t0 = Date.now();
let jd: any;

if (args[0] === '--jd') {
  const { supabaseAdmin } = await import('../src/lib/supabase');
  const { data: jobs } = await supabaseAdmin.from('jobs').select('institute_or_company_name, name, responsibilities, overview').not('responsibilities', 'is', null).limit(60);
  const job = (jobs || []).filter(j => (j.responsibilities || '').length > 180)[Number(args[1] || 0)];
  if (!job) { console.error('岗位库里没有职责完整的 JD'); process.exit(1); }
  jd = { company: job.institute_or_company_name || '', title: job.name, responsibilities: job.responsibilities || '', qualifications: job.overview || '' };
  console.log(`\n══ JD → 空间：${jd.company} · ${jd.title} ══`);
} else {
  const { structureCareer } = await import('../src/lib/agents/career');
  const profession = args[0] || '西点烘焙师';
  console.log(`\n══ 职业名 → 空间：「${profession}」══`);
  const r = await structureCareer(profession);
  jd = r.jd;
  console.log(`① 结构化职业 → ${jd.company} · ${jd.title}（${Math.round((Date.now() - t0) / 1000)}s）`);
}

const built = await buildSpaceFromJd(jd, undefined, (p, d) => console.log(`   · ${p}${d ? ' — ' + d : ''}`), { bench: true, art: false });
const sim: any = built.task.sim;
console.log(`\n② 故事线：${sim.title} · ${sim.steps.length} 步`);
for (const s of sim.steps) console.log(`   [${s.type}] ${s.id} — ${String(s.prompt).slice(0, 46)}`);
console.log(`\n③ 技能卡草案：${built.skill.name} · ${built.skill.card.rules.length} 条规则`);
console.log(`   规则示例：${built.skill.card.rules[0]}`);

const b = sim.steps.find((s: any) => s.type === 'bench');
console.log(`\n④ 虚拟工位：${b ? '✅ 生成成功' : '❌ 没生成出来'}`);
if (b) {
  const spec = b.bench;
  console.log(`   ${spec.name}`);
  console.log(`   控件 ${spec.controls.map((c: any) => `${c.label}(${c.kind})`).join('、')}`);
  console.log(`   变量 ${spec.vars.length} · 规则 ${spec.rules.length} · 目标 ${spec.goals.length} · 场景层 ${spec.scene ? spec.scene.layers.map((l: any) => l.kind).join(',') : '（本次关掉了生图，所以没有场景层）'}`);
  const tr = simulateScript(spec, spec.expertScript || [], Math.max(...(spec.expertScript || [{ t: 0 }]).map((a: any) => a.t)) + 30);
  console.log(`   老手脚本自检：目标 ${tr.metrics.goals_done}/${tr.metrics.goals_total}，违规 ${tr.metrics.violations}`);
  console.log(benchTimeline(spec, tr).split('\n').filter(l => /违规|达成/.test(l)).slice(0, 8).map(l => '     ' + l).join('\n'));
}
console.log(`\n⑤ 评分标准：${built.task.rubric.map((r: any) => `${r.name}(${r.weight})`).join(' · ')}`);
console.log(`\n总耗时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
