// 任意台面规格干跑示范脚本：npx tsx scripts/.sim-spec.mts <lib 文件名去掉 lab- 和 -spec> <秒数>
const [name, secs] = process.argv.slice(2);
const mod: any = await import(`../src/lib/lab-${name}-spec`);
const fn = Object.values(mod).find((v: any) => typeof v === 'function' && /Spec$/.test(v.name)) as any;
const { sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');
const spec = fn('');
if (!sanitizeBenchSpec(spec)) { console.log('表达式有问题'); process.exit(1); }
const tr = simulateScript(spec, spec.expertScript, Number(secs) || 90, 0.25);
console.log('目标', tr.metrics.goals_done, '/', tr.metrics.goals_total, '违规', tr.metrics.violations, '提醒', tr.metrics.warnings, 'final', JSON.stringify(Object.fromEntries(Object.entries(tr.final).filter(([k]) => ['quality', 'done', 'correct', 'confidence', 'calm'].includes(k)))));
console.log(tr.events.filter(e => e.kind === 'rule' || e.kind === 'goal').map(e => `${e.t} ${e.kind} ${e.label}`).join('\n'));
