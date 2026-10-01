/** 拉花三台工位的探针：专家脚本是不是真能把目标全点亮、新兵脚本是不是真能踩到各自该踩的坑 */
const { simulateScript, benchMatch, benchTimeline, sanitizeBenchSpec } = await import('../src/lib/bench');
const L = await import('../src/lib/skill-lab-seed-bench-latte');

const BENCHES: [string, any, any, Record<string, any>][] = [
  ['心形', L.BENCH_LATTE_HEART, L.HEART_EXPERT_SCRIPT, L.HEART_SCRIPTS],
  ['郁金香', L.BENCH_LATTE_TULIP, L.TULIP_EXPERT_SCRIPT, L.TULIP_SCRIPTS],
  ['树叶', L.BENCH_LATTE_ROSETTA, L.ROSETTA_EXPERT_SCRIPT, L.ROSETTA_SCRIPTS],
];

for (const [name, spec, expertScript, scripts] of BENCHES) {
  console.log(`\n████ ${name} · ${spec.name} ████`);
  console.log('清洗：', sanitizeBenchSpec(JSON.parse(JSON.stringify(spec))) ? '通过' : '❌ 不通过');
  const until = Math.max(...expertScript.map((a: any) => a.t)) + 25;
  const expert = simulateScript(spec, expertScript, until);
  console.log('专家 →', JSON.stringify(expert.metrics), '图案', Math.round(expert.final.pattern));
  console.log(benchTimeline(spec, expert).split('\n').filter(l => /违规|提醒|达成/.test(l)).join('\n') || '（无事件）');
  const missed = spec.goals.filter((g: any) => expert.metrics.time_to_goal[g.id] === null);
  if (missed.length) console.log('⚠ 专家没达成：', missed.map((g: any) => g.label).join('、'));
  for (const [k, s] of Object.entries(scripts)) {
    const tr = simulateScript(spec, s as any, Math.max(...(s as any).map((a: any) => a.t)) + 25);
    console.log(`\n-- ${k} · 吻合 ${benchMatch(spec, tr, expert)} · 图案 ${Math.round(tr.final.pattern)} ·`, JSON.stringify(tr.metrics));
    console.log(benchTimeline(spec, tr).split('\n').filter(l => /违规|提醒/.test(l)).join('\n') || '（无违规）');
  }
}
