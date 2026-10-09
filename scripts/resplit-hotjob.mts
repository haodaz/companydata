/**
 * 用日志里存下的 hotjob 原文重新提取（不再访问 hotjob，绕开它的防火墙）：
 * 一个招聘帖装多个子岗位的，按 splitSubRoles 拆成「岗位-子岗位」独立岗位，再结构化入库。
 *   npx tsx scripts/resplit-hotjob.mts 立讯精密
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { splitSubRoles } = await import('../src/lib/agents/ats-adapters');
const { structureJobData } = await import('../src/lib/agents/structurer-job');
const { upsertJobsFromLog } = await import('../src/lib/job-store');
const company = process.argv[2];
if (!company) { console.error('给企业名'); process.exit(1); }

const { data: logs } = await supabaseAdmin.from('job_crawl_logs').select('id, target_url, company_id, raw_markdown, created_at')
  .eq('company', company).ilike('target_url', '%hotjob%').eq('structurer_status', 'success').order('id', { ascending: false });
const latest = new Map<string, any>();
for (const l of logs || []) if (!latest.has(l.target_url) && /### Source:/.test(l.raw_markdown || '')) latest.set(l.target_url, l);
console.log(`${company}：${latest.size} 个 hotjob 页面有原文`);

const { data: task } = await supabaseAdmin.from('job_tasks').insert({ name: `重拆子岗位 · ${company}（用日志原文，不访问 hotjob）`, scope: 'all', model_id: 'gemini-3.8-flash', created_by: 'resplit-hotjob', status: 'running' }).select('id').single();
for (const [url, l] of latest) {
  let splitN = 0;
  const blocks = (l.raw_markdown as string).split(/\n(?=### Source: )/).flatMap(b => {
    const m = b.match(/^### Source: \[([^\]]+)\]\(([^)]+)\)/);
    const duty = b.split('## 工作职责')[1]?.split('## 任职要求')[0]?.trim() || '';
    const req = b.split('## 任职要求')[1]?.trim() || '';
    const subs = m ? splitSubRoles(duty, req) : null;
    if (!m || !subs) return [b];
    splitN++;
    const meta = b.split('## 工作职责')[0].split('\n').slice(2).filter(x => !x.startsWith('# ')).join('\n');
    return subs.map(s => `### Source: [${m[1]}-${s.title}](${m[2]})\n\n# ${m[1]}-${s.title}\n${meta}\n子岗位：属于「${m[1]}」招聘帖（共 ${subs.length} 个子岗位）\n\n## 工作职责\n${s.duty}\n\n## 任职要求\n${s.req}`);
  });
  const md = blocks.join('\n');
  const { data: log } = await supabaseAdmin.from('job_crawl_logs').insert({ task_id: task!.id, target_url: url, company, company_id: l.company_id, hint: '', fetcher_status: 'success', structurer_status: 'pending', raw_markdown: md.slice(0, 500000), markdown_len: md.length, model_id: 'gemini-3.8-flash' }).select('id').single();
  const r = await structureJobData(md, company, '', 'gemini-3.8-flash', Date.now(), 'all');
  if (!r) { await supabaseAdmin.from('job_crawl_logs').update({ structurer_status: 'failed', error_message: '结构化失败' }).eq('id', log!.id); console.log(url, '结构化失败'); continue; }
  await supabaseAdmin.from('job_crawl_logs').update({ structurer_status: 'success', structured_json: r }).eq('id', log!.id);
  const saved = await upsertJobsFromLog(log!.id, r);
  await supabaseAdmin.from('job_crawl_logs').update({ jobs_saved: saved, pushed_to_db: saved > 0 }).eq('id', log!.id);
  console.log(`${url.slice(0, 90)}\n  拆了 ${splitN} 个多岗位招聘帖，岗位 ${r.jobs.length}，入库 ${saved}`);
}
await supabaseAdmin.from('job_tasks').update({ status: 'completed' }).eq('id', task!.id);
