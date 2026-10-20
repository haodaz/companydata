/**
 * 相关职业凑数排查（只读，不写库）：岗位被配上的职业逐个判「搭不搭」，汇总哪些职业常被乱配、哪些岗位找不到合适的职业。
 * 2026-10-20 起因：「QQ音乐海外专区运营实习生」被配了「网约配送员」——职业库里没有「海外运营」，模型凑了个字面相近的。
 *   npx tsx scripts/audit-career-tags.mts --model qwen-flash [--par 2] [--limit 0] [--out reports/career-audit.json]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const PAR = Number(opt('par', '2')), LIMIT = Number(opt('limit', '0'));
const OUT = opt('out', 'reports/career-audit.json');

const { data: occ } = await selectAll(() => db.from('occupations').select('external_id, name').not('if_delete', 'is', true).order('id'));
const occName = new Map((occ as any[]).map(o => [String(o.external_id), String(o.name)]));
const { data } = await selectAll(() => db.from('jobs').select('id, name, job_function, related_career_ids').not('if_delete', 'is', true).not('related_career_ids', 'is', null).neq('related_career_ids', '').order('id'));
let jobs = (data as any[]).map(j => ({ id: j.id, name: String(j.name), fn: j.job_function || '', careers: String(j.related_career_ids).split('|').filter(Boolean) }));
// 同名岗位（按城市拆开的）只判一次
const byTitle = new Map<string, typeof jobs[number] & { n: number }>();
for (const j of jobs) { const k = `${j.name.replace(/[（(].*?[）)]/g, '').trim()}|${j.careers.join('|')}`; const e = byTitle.get(k); if (e) e.n++; else byTitle.set(k, { ...j, n: 1 }); }
let uniq = [...byTitle.values()];
if (LIMIT) uniq = uniq.slice(0, LIMIT);
console.log(`有相关职业的岗位 ${jobs.length} 个，去重后判 ${uniq.length} 组，模型 ${MODEL}，并发 ${PAR}`);

type Bad = { job: string; fn: string; career: string; careerName: string; n: number; better: string };
const bad: Bad[] = [];
let next = 0, done = 0, pairs = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: PAR }, async () => {
  while (next < uniq.length) {
    const b = uniq.slice(next, next + 25); next += 25;
    const lines = b.map((j, i) => `${i + 1}. 岗位「${j.name}」职能：${j.fn || '—'}｜配的职业：${j.careers.map(c => `${c}=${occName.get(c) || c}`).join('；')}`).join('\n');
    const prompt = `你是职业分类审核员。下面每个招聘岗位都被配上了几个「相关职业」。逐个判断：这个职业和岗位实际做的事是否属于同一类工作（相关、相近都算搭；只是字面沾边、实际工作内容完全不同的算不搭，比如「海外运营」配「网约配送员」）。
对不搭的，在 better 里写一个你认为该有的职业名（行业通行叫法；如果这个岗位本来就该归到已有的某个泛职业也写出来）。
只返回 JSON：{"items":[{"n":序号,"bad":[{"key":"职业 key","better":"该有的职业名"}]}]}，全都搭的 bad 给 []。

${lines}`;
    try {
      const r = await generateContent(prompt, MODEL, { jsonMode: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'job-tagging', task_name: 'Career Tag Audit', institution: '', model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
      for (const it of parseJsonLoose(r.text)?.items || []) {
        const j = b[Number(it.n) - 1];
        if (!j) continue;
        for (const x of it.bad || []) if (j.careers.includes(String(x.key))) bad.push({ job: j.name, fn: j.fn, career: String(x.key), careerName: occName.get(String(x.key)) || String(x.key), n: j.n, better: String(x.better || '') });
      }
    } catch (e: any) { console.error('批失败', String(e?.message || e).slice(0, 100)); }
    done += b.length; pairs += b.reduce((s, j) => s + j.careers.length, 0);
    if ((done / 25) % 40 === 0) console.log(`${done}/${uniq.length}（${((Date.now() - t0) / 60000).toFixed(1)} 分钟），不搭 ${bad.length} 对`);
  }
}));

// 汇总：常被乱配的职业；岗位该有的职业（better）
const agg = <K extends string>(rows: Bad[], key: (b: Bad) => K) => { const m = new Map<K, { n: number; jobs: Set<string> }>(); for (const b of rows) { const k = key(b); const v = m.get(k) || { n: 0, jobs: new Set() }; v.n += b.n; v.jobs.add(b.job); m.set(k, v); } return [...m].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => ({ key: k, jobs: v.n, examples: [...v.jobs].slice(0, 6) })); };
const badCareers = agg(bad, b => `${b.careerName}（${b.career}）`);
const wanted = agg(bad.filter(b => b.better), b => b.better.replace(/\s+/g, '') as string);
const badJobs = bad.reduce((s, b) => s + b.n, 0);
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), judged_groups: uniq.length, jobs: jobs.length, pairs, bad_pairs: bad.length, bad_job_links: badJobs, badCareers, wanted, bad }, null, 1));
console.log(`\n完成（${((Date.now() - t0) / 60000).toFixed(1)} 分钟）：判了 ${uniq.length} 组 / ${pairs} 对职业关联，不搭 ${bad.length} 对（涉及岗位 ${badJobs} 个次）→ ${OUT}`);
console.log('最常被乱配的职业：'); for (const c of badCareers.slice(0, 15)) console.log(`  ${c.key}：${c.jobs} 个岗位，如 ${c.examples.slice(0, 3).join('、')}`);
console.log('岗位该有的职业（模型建议）：'); for (const w of wanted.slice(0, 25)) console.log(`  ${w.key}：${w.jobs} 个岗位，如 ${w.examples.slice(0, 3).join('、')}`);
