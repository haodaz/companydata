const [name, secs, ...keys] = process.argv.slice(2);
const mod: any = await import(`../src/lib/lab-${name}-spec`);
const fn = Object.values(mod).find((v: any) => typeof v === 'function' && /Spec$/.test(v.name)) as any;
const { initBench, applyControl, tickBench } = await import('../src/lib/bench');
const spec = fn(''); const st = initBench(spec); const sorted = [...spec.expertScript].sort((a: any, b: any) => a.t - b.t); let i = 0;
while (st.t < Number(secs)) { while (i < sorted.length && sorted[i].t <= st.t) { applyControl(spec, st, sorted[i].control, sorted[i].value); i++; } tickBench(spec, st, 0.25); if (Math.abs(st.t * 4 - Math.round(st.t * 4)) < 1e-6 && st.t % 1 === 0) console.log(st.t, keys.map(k => `${k}=${(st.vars[k] ?? st.controls[k])?.toFixed?.(1)}`).join(' ')); }
