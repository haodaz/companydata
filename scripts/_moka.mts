import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { fetchBaseAndLinks, fetchAndEvaluateBatch } = await import('../src/lib/agents/fetcher');
const { structureJobData } = await import('../src/lib/agents/structurer-job');
const url = process.argv[2], company = process.argv[3];
const t0 = Date.now();
const scope = (process.argv[4] || 'campus') as any;
const init = await fetchBaseAndLinks(url, undefined, undefined, '', scope);
console.log(`列表页 ${init.base_markdown.length} 字，挑出子链接 ${init.candidate_urls.length} 个：`);
for (const u of init.candidate_urls.slice(0, 5)) console.log('  ', u);
const batch = init.candidate_urls.length ? await fetchAndEvaluateBatch(init.candidate_urls) : { useful_markdown: '', useful_urls: [] } as any;
console.log(`详情页有用的 ${batch.useful_urls?.length || 0} 个`);
const r: any = await structureJobData(init.base_markdown + (batch.useful_markdown || ''), company, '', undefined, undefined, scope);
const jobs = r?.jobs || r?.data?.jobs || r || [];
const list = Array.isArray(jobs) ? jobs : (jobs.jobs || []);
console.log(`结构化出岗位 ${list.length} 个（${Math.round((Date.now() - t0) / 1000)}s）：`);
for (const j of list.slice(0, 16)) console.log(`   · ${j.name || j.title}　|　职责 ${String(j.responsibilities || '').length} 字　要求 ${String(j.overview || j.qualifications || '').length} 字　|　${String(j.link || '').slice(-50)}`);
