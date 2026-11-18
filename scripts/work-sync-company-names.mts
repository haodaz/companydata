/**
 * 企业库改名后，把已出的真活同步过去（11-18：智谱AI 在库里被写成「智朴」，数据部更正后已出的题还是旧名）。
 * 挂了企业库（company_id）的题，页头企业名和企业库当前的 name 不一致的，用 withCompany 一起换：页头、出题依据里的企业画像快照、题面、问题、材料、评分标准；题目资产库里的企业名也跟着改。
 *   npx tsx --env-file=.env.local scripts/work-sync-company-names.mts [--company=1577] [--apply]   （不带 --apply 只列出来）
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { withCompany } from '@/lib/work/generator';
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const apply = process.argv.includes('--apply');
let q = db.from('work_tasks').select('id, share_token, company_id, company_name, task, problem, materials, rubric, context').not('company_id', 'is', null);
if (arg('company')) q = q.eq('company_id', Number(arg('company')));
const { data: tasks } = await q.limit(5000);
const ids = [...new Set((tasks || []).map((t: any) => t.company_id))];
const names = new Map<number, string>();
for (let i = 0; i < ids.length; i += 200) { const { data } = await db.from('companies').select('id, name').in('id', ids.slice(i, i + 200)); for (const c of data || []) names.set(c.id, c.name); }
let n = 0;
for (const t of tasks || []) {
  const name = names.get(t.company_id); if (!name) continue;
  if (name === t.company_name) { if (apply) await db.from('work_question_bank').update({ company_name: name }).eq('task_id', t.id).neq('company_name', name); continue; }
  const r = withCompany(t, name);
  console.log(`${t.share_token} 企业 #${t.company_id}：「${r.old}」→「${name}」（换掉 ${r.olds.join('、')}）`);
  if (apply) { const { error } = await db.from('work_tasks').update({ company_name: r.company_name, task: r.task, problem: r.problem, materials: r.materials, rubric: r.rubric, context: r.context, updated_at: new Date().toISOString() }).eq('id', t.id); if (error) console.log('  失败', error.message); await db.from('work_question_bank').update({ company_name: r.company_name }).eq('task_id', t.id); }
  n++;
}
console.log(`${apply ? '改了' : '要改'} ${n} 道题`);
