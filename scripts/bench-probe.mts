const { simulateScript, benchMatch, benchTimeline } = await import('../src/lib/bench');
const { BENCH_CASTING, CASTING_EXPERT_SCRIPT, CASTING_SCRIPTS } = await import('../src/lib/skill-lab-seed-bench');
const spec = BENCH_CASTING;
const expert = simulateScript(spec, CASTING_EXPERT_SCRIPT, 800);
console.log('EXPERT', JSON.stringify(expert.metrics), 'events', expert.events.length);
for (const [k, s] of Object.entries(CASTING_SCRIPTS)) {
  const tr = simulateScript(spec, s, Math.max(...s.map(a => a.t)) + 40);
  console.log('\n==', k, 'match', benchMatch(spec, tr, expert), JSON.stringify(tr.metrics));
  console.log(benchTimeline(spec, tr).split('\n').filter(l => /违规|提醒|达成|浇注/.test(l)).join('\n'));
}
