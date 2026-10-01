/** 缝合工位探针：专家脚本能不能把目标点亮，各种错法是不是真能踩到各自的坑 */
const { simulateScript, benchMatch, benchTimeline, sanitizeBenchSpec } = await import('../src/lib/bench');
const S = await import('../src/lib/skill-lab-seed-bench-surgery');
const spec = S.BENCH_SUTURE;
console.log('清洗：', sanitizeBenchSpec(JSON.parse(JSON.stringify(spec))) ? '通过' : '❌ 不通过');
const until = Math.max(...S.SUTURE_EXPERT_SCRIPT.map(a => a.t)) + 25;
const expert = simulateScript(spec, S.SUTURE_EXPERT_SCRIPT, until);
console.log('专家 →', JSON.stringify(expert.metrics), '对合', expert.final.approx.toFixed(2), '质量', Math.round(expert.final.quality));
console.log(benchTimeline(spec, expert).split('\n').filter(l => /违规|提醒|达成/.test(l)).join('\n') || '（无事件）');
const missed = spec.goals.filter((g: any) => expert.metrics.time_to_goal[g.id] === null);
if (missed.length) console.log('⚠ 专家没达成：', missed.map((g: any) => g.label).join('、'));
for (const [k, s] of Object.entries(S.SUTURE_SCRIPTS)) {
  const tr = simulateScript(spec, s as any, Math.max(...(s as any).map((a: any) => a.t)) + 25);
  console.log(`\n-- ${k} · 吻合 ${benchMatch(spec, tr, expert)} · 对合 ${tr.final.approx.toFixed(2)} · 质量 ${Math.round(tr.final.quality)} ·`, JSON.stringify(tr.metrics));
  console.log(benchTimeline(spec, tr).split('\n').filter(l => /违规|提醒/.test(l)).join('\n') || '（无违规）');
}
