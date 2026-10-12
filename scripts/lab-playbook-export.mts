/**
 * 样板库导出（2026-10-12）：把手工做的每个交互故事台面整理成结构化样例，给以后「平台自己生职人」的 agent 当 few-shot / 评测集。
 *   npx tsx scripts/lab-playbook-export.mts            → docs/lab-playbook.json，并打印体检表
 * 每条样例：设计说明（spec 文件头，里面有用户原话和日期）、拆出来的红线 / 数采点、规格规模、台面组件行数、
 * 以及示范脚本干跑的结果（目标全达成、零违规才算合格样例——不合格的标出来，不能拿去教 AI）。
 * 设计口径（模板、台面形态、规则）见 docs/lab-playbook.md。
 */
import fs from 'node:fs';
import path from 'node:path';

const { playDt, sanitizeBenchSpec, simulateScript } = await import('../src/lib/bench');
const LIB = 'src/lib', SURF = 'src/components/lab/surfaces';

const header = (src: string) => (src.match(/\/\*\*([\s\S]*?)\*\//)?.[1] || '').split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean);
const pick = (lines: string[], key: string) => lines.find(l => l.startsWith(key))?.slice(key.length).replace(/^[：:]\s*/, '') || null;

const out: any[] = [];
for (const f of fs.readdirSync(LIB).filter(f => /^lab-.+-spec\.ts$/.test(f)).sort()) {
  const name = f.replace(/^lab-|-spec\.ts$/g, '');
  const src = fs.readFileSync(path.join(LIB, f), 'utf8');
  const lines = header(src);
  const mod: any = await import(`../src/lib/lab-${name}-spec`);
  const fn = Object.values(mod).find((v: any) => typeof v === 'function' && /Spec$/.test(v.name)) as any;
  if (!fn) { console.log('跳过', f, '（没有 *Spec 函数）'); continue; }
  const spec = fn('');
  const comp = lines.join(' ').match(/surfaces\/(\w+)\.tsx/)?.[1];
  const compLines = comp && fs.existsSync(path.join(SURF, `${comp}.tsx`)) ? fs.readFileSync(path.join(SURF, `${comp}.tsx`), 'utf8').split('\n').length : null;
  let dry: any = { ok: false, note: '没有示范脚本' };
  if (!sanitizeBenchSpec(spec)) dry = { ok: false, note: '表达式有问题' };
  else if (spec.expertScript?.length) {
    const last = Math.max(...spec.expertScript.map((a: any) => a.t));
    const tr = simulateScript(spec, spec.expertScript, Math.min(spec.maxSeconds, last + 60), playDt(spec));   // 体验端的真实步长
    const m = tr.metrics;
    dry = { ok: m.goals_done === m.goals_total && m.violations === 0, goals: `${m.goals_done}/${m.goals_total}`, violations: m.violations, warnings: m.warnings };
  }
  out.push({
    key: name, surface: spec.surface || null, component: comp || null, componentLines: compLines,
    title: spec.name, brief: spec.brief,
    design: lines,                                  // 原样保留：故事、该做的、红线、数采点、用户原话
    redlines: pick(lines, '红线'), dataPoints: pick(lines, '数采点'),
    timeScale: spec.timeScale, maxSeconds: spec.maxSeconds,
    size: { vars: spec.vars.length, controls: spec.controls.length, hiddenControls: spec.controls.filter((c: any) => c.hidden).length, gauges: spec.gauges.length, rules: spec.rules.length, violations: spec.rules.filter((r: any) => r.severity === 'violation').length, goals: spec.goals.length, expertSteps: spec.expertScript?.length || 0 },
    rules: spec.rules.map((r: any) => ({ label: r.label, severity: r.severity })),
    goals: spec.goals.map((g: any) => g.label),
    dryRun: dry,
  });
}
fs.writeFileSync('docs/lab-playbook.json', JSON.stringify({ exportedAt: new Date().toISOString(), exemplars: out }, null, 1));
console.log('样例'.padEnd(12), '台面'.padEnd(11), '组件行'.padStart(5), ' 变量 控件 规则 目标  干跑');
for (const x of out) console.log(x.key.padEnd(12), String(x.surface || '（通用）').padEnd(11), String(x.componentLines ?? '-').padStart(5), String(x.size.vars).padStart(5), String(x.size.controls).padStart(4), String(x.size.rules).padStart(4), String(x.size.goals).padStart(4), ' ', x.dryRun.ok ? '✓' : `✗ ${x.dryRun.note || `${x.dryRun.goals} 违规 ${x.dryRun.violations}`}`);
console.log(`\n→ docs/lab-playbook.json（${out.length} 条）`);
