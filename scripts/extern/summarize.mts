/**
 * Extern 学员作品墙归纳（2026-11-04，用 Claude——用户有免费 credit）：每个项目把学员作品（Top performer 全收 + 其余随机补到 60 份）
 * 交给 Claude Opus 5.5，归纳成一段中文「作品墙」：这一期学员常见的选题 / 做法 / 交付形态、用了哪些工具和 AI、Top performer 做得不一样在哪、常见短板。
 * 只写归纳，不引原文长句、不提任何个人。结果写进 work_external_simulations.meta.works_summary（+ works_stats）。
 *   npx tsx scripts/extern/summarize.mts            估算（不调模型）
 *   npx tsx scripts/extern/summarize.mts --apply    跑
 */
import fs from 'node:fs';
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { generateContent } = await import('@/lib/llm-client');
const { logTokenUsage } = await import('@/lib/token-logger');

const MODEL = 'claude-opus-5-5', PRICE = { input: 4, output: 20 };   // 美元 / 百万 token（同 token-logger）
const APPLY = process.argv.includes('--apply'), MAX = 60;
const { data: progs } = await db.from('work_external_simulations').select('id, external_id, title, company_name, meta, task_structure').eq('source', 'extern');
const { data: works } = await db.from('work_external_works').select('program_id, cohort, in_progress, top_performer, tags, overview, accomplished, breakdown, artifact_kinds').eq('source', 'extern');
const byProg = new Map<string, any[]>();
for (const w of works || []) byProg.set(w.program_id, [...(byProg.get(w.program_id) || []), w]);

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const fmt = (w: any, i: number) => `### 作品 ${i + 1}${w.top_performer ? '（Top performer）' : ''}${w.in_progress ? '（进行中）' : ''}${(w.artifact_kinds || []).length ? ` · 外链：${w.artifact_kinds.join('、')}` : ''}\n${[w.overview, w.accomplished, w.breakdown].filter(Boolean).join('\n').slice(0, 2400)}`;

let inTok = 0, n = 0;
const jobs: { p: any; prompt: string; stats: any }[] = [];
for (const p of progs || []) {
  const ws = byProg.get(p.external_id) || [];
  if (ws.length < 3) continue;                                  // 少于 3 份不归纳
  const tops = ws.filter(w => w.top_performer), rest = shuffle(ws.filter(w => !w.top_performer));
  const pick = [...tops.slice(0, 30), ...rest].slice(0, MAX);
  const stats = { works: ws.length, top: tops.length, in_progress: ws.filter(w => w.in_progress).length, with_artifact: ws.filter(w => (w.artifact_kinds || []).length).length, sampled: pick.length };
  const prompt = `下面是线上实习项目「${p.title}」（${p.company_name}，企业导师带的多周项目）里，学员公开挂出来的作品描述（已脱敏）。我们要像看美术班外面挂的一百张作品一样：不关心是谁做的，只看这一期学员做出了什么、怎么做的。
## 项目的每周安排
${(p.task_structure || []).map((t: any) => `${t.position}. ${t.title}`).join('\n')}
## 项目要求的交付物
${(p.meta?.outputs || []).join('\n')}
## 学员作品（共 ${ws.length} 份，这里给 ${pick.length} 份，Top performer 是企业评的）
${pick.map(fmt).join('\n\n')}

用中文写一段「作品墙」归纳（500–800 字），分这几块，每块 2–4 句，要具体（选题、数据、方法、数字、工具），不要空话：
1. 学员常见的选题 / 切入点
2. 常见做法和用到的工具（含怎么用 AI）
3. 交付形态（报告 / 路演稿 / 看板 / 原型 / 代码……）
4. Top performer 做得不一样在哪（和一般作品比；没有 Top performer 就写「本项目没有标出 Top performer」）
5. 常见短板或容易流于表面的地方
不提任何个人，不大段引用原文。只返回正文。`;
  inTok += Math.round(prompt.length / 3.2); n++;
  jobs.push({ p, prompt, stats });
}
const outTok = n * 1200;
console.log(`要归纳的项目 ${n} 个（作品 ≥3 份）；输入约 ${(inTok / 1e6).toFixed(2)}M token、输出约 ${(outTok / 1e6).toFixed(2)}M → 约 $${(inTok / 1e6 * PRICE.input + outTok / 1e6 * PRICE.output).toFixed(1)}（${MODEL}）`);
if (!APPLY) process.exit(0);

let done = 0;
for (const j of jobs) {
  try {
    const r = await generateContent(j.prompt, MODEL, { temperature: 0.2 });
    await logTokenUsage({ tool_name: 'work', task_name: '外部模拟参照 · Extern 作品墙归纳', institution: '', model_id: MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
    const summary = String(r.text || '').trim();
    if (summary.length < 200) throw new Error('太短');
    await db.from('work_external_simulations').update({ meta: { ...(j.p.meta || {}), works_summary: summary, works_stats: j.stats, works_summary_model: MODEL, works_summary_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq('id', j.p.id);
    console.log(`${++done}/${jobs.length} ${j.p.title}（${j.stats.works} 份，Top ${j.stats.top}）`);
  } catch (e: any) { console.log('  ✗', j.p.title, String(e?.message).slice(0, 100)); }
}
fs.writeFileSync('data/extern/summarize-done.txt', new Date().toISOString());
