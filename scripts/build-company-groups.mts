/**
 * 建集团 / 品牌实体（迁移 053，用户 10-28：需要）：库里只有中国子公司 / 分支的品牌，建一行集团（entity_level = group），
 * 子公司挂 parent_company_id；外部模拟（Forage）上说的是集团或别国分支的，company_id 挂到集团。
 * 集团的总部国家 / 官网是公开常识（写在下面，可核对），编号照规则由触发器算（国家代码.主域名）。其余字段之后跑画像补。
 *   npx tsx scripts/build-company-groups.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const APPLY = process.argv.includes('--apply');

const GROUPS: { name: string; name_en: string; website: string; country: string; industry: string; subs: number[]; forage: string[] }[] = [
  { name: '毕马威', name_en: 'KPMG', website: 'https://kpmg.com/', country: '英国', industry: '专业服务', subs: [1300, 1625, 1740], forage: ['KPMG U.S.', 'KPMG in Canada', 'KPMG UK'] },
  { name: '德勤', name_en: 'Deloitte', website: 'https://www.deloitte.com/', country: '英国', industry: '专业服务', subs: [1150, 1623], forage: ['Deloitte Australia'] },
  { name: '普华永道', name_en: 'PwC', website: 'https://www.pwc.com/', country: '英国', industry: '专业服务', subs: [1737], forage: ['PwC Switzerland'] },
  { name: '高盛', name_en: 'Goldman Sachs', website: 'https://www.goldmansachs.com/', country: '美国', industry: '金融', subs: [2153, 2159], forage: ['Goldman Sachs'] },
  { name: '彭博', name_en: 'Bloomberg', website: 'https://www.bloomberg.com/', country: '美国', industry: '金融信息服务', subs: [2154], forage: ['Bloomberg'] },
  { name: '渣打集团', name_en: 'Standard Chartered', website: 'https://www.sc.com/', country: '英国', industry: '金融', subs: [1961], forage: ['Standard Chartered'] },
  { name: '辉瑞', name_en: 'Pfizer', website: 'https://www.pfizer.com/', country: '美国', industry: '医药', subs: [2124], forage: ['Pfizer UK'] },
];

for (const g of GROUPS) {
  const { data: subs } = await db.from('companies').select('id, name, parent_company_id').in('id', g.subs);
  let { data: grp } = await db.from('companies').select('id, name, external_id').eq('entity_level', 'group').eq('name_en', g.name_en).maybeSingle();
  console.log(`${g.name}（${g.name_en}）${grp ? `已有 #${grp.id}` : '新建'}；子公司 ${(subs || []).map((s: any) => s.name).join('、')}；Forage ${g.forage.join(' / ')}`);
  if (!APPLY) continue;
  if (!grp) {
    const { data, error } = await db.from('companies').insert({ name: g.name, name_en: g.name_en, brief_name: g.name, official_website: g.website, country: g.country, industry: g.industry, entity_level: 'group', source: '集团实体', human_review_status: 'review', aliases: [g.name_en] }).select('id, name, external_id').single();
    if (error) { console.log('  ✗', error.message); continue; }
    grp = data; console.log(`  建好 #${grp!.id} 编号 ${grp!.external_id}`);
  }
  await db.from('companies').update({ parent_company_id: grp!.id }).in('id', g.subs);
  const { data: sims } = await db.from('work_external_simulations').update({ company_id: grp!.id }).in('company_name', g.forage).select('id');
  console.log(`  子公司挂上 ${g.subs.length}，Forage 模拟挂上 ${sims?.length || 0}`);
}
