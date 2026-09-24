const { simulateScript, benchMatch, benchTimeline } = await import('../src/lib/bench');
const { BENCH_WELD, WELD_EXPERT_SCRIPT, WELD_SCRIPTS } = await import('../src/lib/skill-lab-seed-bench');
const spec = BENCH_WELD;
const expert = simulateScript(spec, WELD_EXPERT_SCRIPT, 60);
console.log('EXPERT', JSON.stringify(expert.metrics));
console.log(benchTimeline(spec, expert).split('\n').filter(l => /违规|提醒|达成|起步|走完/.test(l)).join('\n'));
for (const [k, s] of Object.entries(WELD_SCRIPTS)) {
  const tr = simulateScript(spec, s, Math.max(...s.map(a => a.t)) + 20);
  console.log('\n==', k, 'match', benchMatch(spec, tr, expert), JSON.stringify(tr.metrics));
  console.log(benchTimeline(spec, tr).split('\n').filter(l => /违规|提醒|达成|起步|走完/.test(l)).join('\n'));
}
