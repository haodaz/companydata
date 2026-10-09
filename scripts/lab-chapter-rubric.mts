/**
 * 给还没有评分标准的章节（第 1 章以外）补一份。
 *   npx tsx scripts/lab-chapter-rubric.mts [--space <id>] [--model gpt-5.6-luna]
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { draftRubric } = await import('../src/lib/agents/lab-chapters');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length));
let q = supabaseAdmin.from('lab_chapters').select('*').neq('seq', 1).is('rubric', null);
if (args.space) q = q.eq('task_id', args.space);
const { data: chs } = await q;
for (const ch of chs || []) {
  if (!ch.sim?.steps?.length) continue;
  const { data: space } = await supabaseAdmin.from('skill_tasks').select('id, title, profile, jd_snapshot').eq('id', ch.task_id).single();
  const rubric = await draftRubric(ch, space, args.model || 'gpt-5.6-luna');
  if (!rubric) { console.log('❌', ch.title); continue; }
  await supabaseAdmin.from('lab_chapters').update({ rubric }).eq('id', ch.id);
  console.log('✅', ch.slot, ch.title, rubric.map(r => `${r.name}${r.weight}`).join(' / '));
}
