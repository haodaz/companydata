/**
 * 台面母版回归检查（2026-10-12「巩固开发」）：改了 bench.ts / lab-masters.ts / 任何 *Stage 之后跑一遍，看有没有弄坏谁。
 *   npx tsx scripts/lab-masters-check.mts          样板 + 库里的章节
 *   npx tsx scripts/lab-masters-check.mts --no-db  只查样板
 * 样板（src/lib/masters/*-samples.ts 的 SAMPLES，代码版 key ↔ 母版版 key-<母版名> 成对）：
 *   ① JSON 往返过 sanitizeBenchSpec，surfaceConfig 原样保留  ② 母版版和代码版按体验端步长干跑，指标一致
 *   ③ BenchRunner 服务端渲染（普通 + 沉浸）不报错
 * 库里的章节：每个用母版的工位都要过清洗、留着配置；老手脚本干跑结果列出来（不合格的标 ✗，多半是早就有的 B1 问题）。
 * 有一项不过就退出码 1。
 */
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { sanitizeBenchSpec, simulateScript, playDt } = await import('../src/lib/bench');
const { MASTER_DEFS } = await import('../src/lib/lab-masters');
const { BenchRunner } = await import('../src/components/lab/BenchRunner');

const mods = await Promise.all(['field', 'desktop', 'dialog', 'dispatch', 'hands'].map(m => import(`../src/lib/masters/${m}-samples`)));
const SAMPLES: Record<string, () => any> = Object.assign({}, ...mods.map(m => m.SAMPLES || {}));
const masters = Object.keys(MASTER_DEFS);
let fail = 0;
const bad = (msg: string) => { fail++; console.log('  ✗', msg); };

const dry = (spec: any) => {
  if (!spec?.expertScript?.length) return '—';
  const m = simulateScript(spec, spec.expertScript, Math.min(spec.maxSeconds, Math.max(...spec.expertScript.map((a: any) => a.t)) + 60), playDt(spec)).metrics;
  return `${m.goals_done}/${m.goals_total} 违规 ${m.violations}`;
};
const render = (spec: any, hud: boolean) => renderToStaticMarkup(React.createElement(BenchRunner as any, { spec, role: 'rookie', hud, onFinish: () => {}, onCancel: () => {} }));

console.log('== 样板');
for (const [key, make] of Object.entries(SAMPLES)) {
  const suffix = masters.find(m => key.endsWith(`-${m}`));
  if (!suffix) continue;   // 代码版，配对时再用
  const raw = make();
  const spec = sanitizeBenchSpec(JSON.parse(JSON.stringify(raw)));
  const codeKey = key.slice(0, -suffix.length - 1);
  const line = [`${key.padEnd(22)}`];
  if (!spec) { bad(`${key} 过不了清洗`); continue; }
  if (!spec.surfaceConfig || spec.surfaceConfig.master !== suffix) { bad(`${key} 清洗后丢了 surfaceConfig`); continue; }
  const mine = dry(spec);
  line.push(`干跑 ${mine}`);
  if (SAMPLES[codeKey]) {
    const code = sanitizeBenchSpec(JSON.parse(JSON.stringify(SAMPLES[codeKey]())));
    const theirs = dry(code);
    if (theirs !== mine) bad(`${key} 干跑 ${mine}，代码版 ${codeKey} 是 ${theirs}`);
    else line.push(`= 代码版`);
  }
  try { render(spec, false); render(spec, true); line.push('渲染 ✓'); } catch (e: any) { bad(`${key} 渲染报错：${String(e?.message || e).slice(0, 160)}`); }
  console.log('  ' + line.join(' · '));
}

if (!process.argv.includes('--no-db')) {
  console.log('\n== 库里用母版的工位');
  const { supabaseAdmin: db } = await import('../src/lib/supabase');
  const { data: chs, error } = await db.from('lab_chapters').select('task_id, seq, slot, title, sim');
  if (error) throw error;
  for (const c of chs || []) for (const [i, s] of (c.sim?.steps || []).entries()) {
    const b = s?.bench; if (s?.type !== 'bench' || !b || !MASTER_DEFS[b.surface]) continue;
    const spec = sanitizeBenchSpec(b);
    const tag = `${c.task_id.slice(0, 8)} 第 ${c.seq} 章 ${c.slot || ''} 第 ${i + 1} 步 · ${b.surface}`;
    if (!spec?.surfaceConfig) { bad(`${tag} 过不了清洗或丢了配置`); continue; }
    const d = dry(spec);
    console.log(`  ${/^(\d+)\/\1 违规 0$/.test(d) ? '✓' : '✗'} ${tag} · 干跑 ${d}`);
  }
}
console.log(fail ? `\n${fail} 项不过` : '\n全部通过');
process.exit(fail ? 1 : 0);
