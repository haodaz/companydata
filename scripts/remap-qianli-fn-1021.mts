/**
 * 潜历职能标签 value 换成数据部门 10-21 修正版口径（按中文名：旧 value → 名称 → 新 value），不调模型。
 * 旧口径字面错位（SWE = mgmt_trainee），修正版语义一致（SWE = softeng）。一次读全、算好再写，不会连环替换。
 *   npx tsx scripts/remap-qianli-fn-1021.mts [--dry]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const OLD: Record<string, string> = { mgmt_trainee: 'SWE', softeng: '数据分析师', ml_ai: '营销公关', hr: 'ML & AI', consulting: '商业分析', mkt: '产品经理', researcher: '设计/UIUX', admin_specialist: '财务', sales_bd: '战略/咨询分析', projectmgr: '工程师', cybersecurity: 'HR', stat_researcher: '创意', dataeng: 'Trainee管培', da: '客服', creative_uiux: '合规法律', ba: '销售BD', secretary: '研究员', customer_svc: '教师', edu_training: '网络安全', healthcare: '项目经理', legal_compliance: '数据工程师', exec_mgmt: '健康服务', eng_dev: '行政', arts_ent: '统计调查员', productmgr: '秘书', acct_fin: '管理' };
const NEW = new Map((JSON.parse(fs.readFileSync('/tmp/qianli-job-labels-v2.json', 'utf8')) as any[]).map(t => [t.cn, t.value]));
const map = new Map(Object.entries(OLD).map(([v, cn]) => [v, NEW.get(cn)!]));
if ([...map.values()].some(v => !v)) throw new Error('新表缺名称');
const { data } = await selectAll(() => db.from('jobs').select('id, qianli_job_labels').not('qianli_job_labels', 'is', null).order('id'));
const groups = new Map<string, number[]>();
for (const j of data as any[]) { const to = map.get(j.qianli_job_labels); if (!to || to === j.qianli_job_labels) continue; (groups.get(to) || groups.set(to, []).get(to)!).push(j.id); }
console.log(`有职能标签 ${(data as any[]).length} 个，要换 ${[...groups.values()].flat().length} 个：`, [...groups].map(([v, ids]) => `${v}:${ids.length}`).join(' '));
if (!process.argv.includes('--dry')) {
  for (const [to, ids] of groups) for (let i = 0; i < ids.length; i += 300) { const { error } = await db.from('jobs').update({ qianli_job_labels: to }).in('id', ids.slice(i, i + 300)); if (error) throw error; }
  console.log('已换完');
}
