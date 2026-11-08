/** 写卡前看这个职业在库里的真实数据：npx tsx --env-file=.env.local scripts/game-card-context.mts <occupation key> [岗位库城市编码] */
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const [key, cityCode] = process.argv.slice(2);
const { data: o } = await db.from('occupations').select('id, key, name, intro, responsibility, position_requirement, relevant_certificates, career_map').eq('key', key).single();
if (!o) { console.log('职业库里没有', key); process.exit(1); }
const cm: any = o.career_map || {};
const { data: sal } = await db.from('occupation_salaries').select('year, salary').eq('occupation_id', o.id).eq('if_delete', false);
const { data: ex } = await db.from('occupation_ai_exposure').select('tasks, new_tasks').eq('occupation_id', o.id).order('version', { ascending: false }).limit(1);
const jd = (await db.from('jobs').select('id', { count: 'exact', head: true }).contains('related_career_ids', [key])).count;
const jdc = cityCode ? (await db.from('jobs').select('id', { count: 'exact', head: true }).contains('related_career_ids', [key]).eq('city', cityCode)).count : null;
console.log(`【${o.name}】${o.intro}\n职责：${o.responsibility}\n要求：${o.position_requirement}\n证书：${o.relevant_certificates}`);
console.log('\n【晋升阶梯】（stage 下标从 0 起）'); (cm.ladder || []).forEach((l: any, i: number) => console.log(`${i}. ${l.title}（${l.stage}，${l.years}，${l.salary}）${l.focus}`));
console.log('\n【技能证书】'); (cm.skills || []).forEach((s: any) => console.log(`- ${s.name}（${s.kind} L${s.level}）${s.how_to_build || ''}`));
console.log('\n【之后的去向】'); (cm.next_roles || []).forEach((r: any) => console.log(`- ${r.name}（${r.type} ${r.years || ''}）${r.how || ''}`));
console.log('\n【入行路径】'); (cm.entry_paths || []).forEach((e: any) => console.log(`- ${e.path || e.name || ''}：${e.detail || e.how || ''}`));
console.log(`\n【年限薪资】${(sal || []).map((s: any) => `${s.year}=${s.salary}`).join(' ')}`);
console.log('\n【AI 替代性】'); (ex?.[0]?.tasks || []).forEach((t: any) => console.log(`- ${t.name}（${t.kind}）${t.how}`));
console.log(`新活：${(ex?.[0]?.new_tasks || []).map((t: any) => t.name).join('；')}`);
console.log(`\n【岗位库】全国 ${jd} 条${jdc != null ? `，城市 ${cityCode} ${jdc} 条` : ''}（校招实习为主）`);
