const { simulateScript, benchMatch, benchTimeline, sanitizeBenchSpec } = await import('../src/lib/bench');
const S = await import('../src/lib/skill-lab-seed-bench-laparotomy');
const spec = S.BENCH_LAPAROTOMY;
console.log('清洗：', sanitizeBenchSpec(JSON.parse(JSON.stringify(spec))) ? '通过' : '❌');
const until = Math.max(...S.LAP_EXPERT_SCRIPT.map(a => a.t)) + 25;
const expert = simulateScript(spec, S.LAP_EXPERT_SCRIPT, until);
console.log('专家 →', JSON.stringify(expert.metrics), '质量', Math.round(expert.final.quality), '风险', Math.round(expert.final.bowel_risk));
console.log(benchTimeline(spec, expert).split('\n').filter(l => /违规|提醒|达成/.test(l)).join('\n') || '（无事件）');
const miss = spec.goals.filter((g: any) => expert.metrics.time_to_goal[g.id] === null);
if (miss.length) console.log('⚠ 专家没达成：', miss.map((g: any) => g.label).join('、'));
for (const [k, s] of Object.entries(S.LAP_SCRIPTS)) {
  const tr = simulateScript(spec, s as any, Math.max(...(s as any).map((a: any) => a.t)) + 25);
  console.log(`\n-- ${k} · 吻合 ${benchMatch(spec, tr, expert)} · 质量 ${Math.round(tr.final.quality)} · 风险 ${Math.round(tr.final.bowel_risk)} ·`, JSON.stringify(tr.metrics));
  console.log(benchTimeline(spec, tr).split('\n').filter(l => /违规|提醒/.test(l)).join('\n') || '（无违规）');
}
