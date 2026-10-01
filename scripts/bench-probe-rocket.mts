const { simulateScript, benchMatch, benchTimeline, sanitizeBenchSpec } = await import('../src/lib/bench');
const R = await import('../src/lib/skill-lab-seed-bench-rocket');
for (const [name, spec, exp, scripts] of [
  ['搅拌摩擦焊', R.BENCH_FSW, R.FSW_EXPERT_SCRIPT, R.FSW_SCRIPTS],
  ['发动机试车', R.BENCH_ENGINE, R.ENGINE_EXPERT_SCRIPT, R.ENGINE_SCRIPTS],
] as [string, any, any, any][]) {
  console.log(`\n████ ${name} ████  清洗 ${sanitizeBenchSpec(JSON.parse(JSON.stringify(spec))) ? '通过' : '❌'}`);
  const until = Math.max(...exp.map((a: any) => a.t)) + 30;
  const e = simulateScript(spec, exp, until);
  console.log('专家 →', JSON.stringify(e.metrics), '质量', Math.round(e.final.quality));
  console.log(benchTimeline(spec, e).split('\n').filter(l => /违规|提醒|达成/.test(l)).join('\n') || '（无事件）');
  const miss = spec.goals.filter((g: any) => e.metrics.time_to_goal[g.id] === null);
  if (miss.length) console.log('⚠ 专家没达成：', miss.map((g: any) => g.label).join('、'));
  for (const [k, s] of Object.entries(scripts)) {
    const tr = simulateScript(spec, s as any, Math.max(...(s as any).map((a: any) => a.t)) + 30);
    console.log(`-- ${k} · 吻合 ${benchMatch(spec, tr, e)} · 质量 ${Math.round(tr.final.quality)} · 目标 ${tr.metrics.goals_done}/${tr.metrics.goals_total} · 违规 ${tr.metrics.violations}`);
  }
}
