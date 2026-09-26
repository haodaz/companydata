/** 把 scripts/deep-research.mts 的 JSON 快照写进 company_deep_research（迁移 008），并回填实体库：npx tsx scripts/import-deep-research.mts <companyId> <json> */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const [cid, file] = process.argv.slice(2);
const { saveDeepTopic, applyDeepTopic } = await import('../src/lib/agents/company-deep-research');
const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const [key, v] of Object.entries<any>(snap.topics || {})) {
  if (!v?.data) { console.log(`⏭ ${key} 无数据`); continue; }
  await saveDeepTopic(Number(cid), key, { data: v.data, queries: v.queries || [], seconds: v.seconds || 0 }, snap.model || 'gpt-5.6-luna', 'import');
  const applied = await applyDeepTopic(Number(cid), key, v.data);
  console.log(`✅ ${key} 已落库${Object.keys(applied).length ? ` · 回填 ${JSON.stringify(applied)}` : ''}`);
}
