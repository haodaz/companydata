const { simulateScript, benchTimeline, benchMatch, initBench, tickBench, applyControl, finishBench } = await import('../src/lib/bench');
const { BENCH_CASTING } = await import('../src/lib/skill-lab-seed-bench');
const spec = BENCH_CASTING;
const expert = simulateScript(spec, spec.expertScript!, 800);
console.log(benchTimeline(spec, expert));
console.log('\nfinal', JSON.stringify(Object.fromEntries(Object.entries(expert.final).map(([k, v]) => [k, Math.round(v as number)]))));
// 一个急躁新兵：不抽真空就满功率、炉门乱开、温度不到就浇
const rookie = simulateScript(spec, [
  { t: 0, control: 'power', value: 1 }, { t: 2, control: 'heater', value: 100 }, { t: 60, control: 'pump', value: 1 }, { t: 90, control: 'door', value: 1 }, { t: 100, control: 'door', value: 0 },
  { t: 200, control: 'preheat', value: 1 }, { t: 400, control: 'pour', value: 1 }, { t: 410, control: 'heater', value: 0 }, { t: 420, control: 'power', value: 0 },
], 430);
console.log('\n=== rookie ===\n' + benchTimeline(spec, rookie).split('\n').slice(-4).join('\n'));
console.log('\nmatch expert-vs-expert', benchMatch(spec, expert, expert), 'rookie-vs-expert', benchMatch(spec, rookie, expert));
