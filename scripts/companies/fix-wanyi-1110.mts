/**
 * 数据部门 11-10（姜贺）：按爱企查截图补安徽万仪科技（#2895）。改过的字段锁住，以后补全不覆盖；主要人员照截图补。
 *   npx tsx scripts/companies/fix-wanyi-1110.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const APPLY = process.argv.includes('--apply');
const ID = 2895, SRC = '爱企查截图（数据部门 11-10）';
const SET: Record<string, any> = {
  unified_social_credit_code: '91340303MA8NEE6EXC', registered_name: '安徽万仪科技有限公司', legal_representative: '陈明', registered_capital: '500万元人民币', info_founding_year: 2021,
  company_type: 'private', kind: 'limited_liability_company', industry: '科技推广和应用服务业', sub_industry: '环境监测与分析仪器',
  country: '156', province: '34', city: '340300', county_area: '340303', address: '安徽省蚌埠市蚌山区青年街道同乐园社区15楼2号', registration_address: '安徽省蚌埠市蚌山区青年街道同乐园社区15楼2号',
  info_phone: '13955236661', info_email: '463303599@qq.com',
  business_range: '一般项目：技术服务、技术开发、技术咨询、技术交流、技术转让、技术推广；仪器仪表制造；环境监测专用仪器仪表制造；实验分析仪器制造；环境保护专用设备制造；大气污染监测及检测仪器仪表制造；水质污染物监测及检测仪器仪表制造；生态环境监测及检测仪器仪表制造；仪器仪表销售；海洋环境监测与探测装备销售；大气污染监测及检测仪器仪表销售；水质污染物监测及检测仪器仪表销售；生态环境监测及检测仪器仪表销售；环境保护专用设备销售（除许可业务外，可自主依法经营法律法规非禁止或限制的项目）',
  introduction: '安徽万仪科技有限公司成立于2021年11月19日，注册地位于安徽省蚌埠市蚌山区青年街道同乐园社区15楼2号，法定代表人为陈明。经营范围包括环境监测专用仪器仪表、实验分析仪器、水质与大气污染监测仪器的制造和销售，以及相关技术服务。',
};
const EXECS = [{ name: '陈明', title: '执行董事兼总经理、法定代表人' }, { name: '廖美莲', title: '财务负责人' }, { name: '陈玉杰', title: '监事' }];
const { data: c } = await db.from('companies').select('*').eq('id', ID).single();
console.log(`#${ID} ${c.name}：写 ${Object.keys(SET).length} 个字段；主要人员 ${EXECS.map(e => e.name).join('、')}`);
if (APPLY) {
  const ps = { ...(c.profile_source || {}) }; for (const k of Object.keys(SET)) ps[k] = SRC;
  const { error } = await db.from('companies').update({ ...SET, human_locked_fields: [...new Set([...(c.human_locked_fields || []), ...Object.keys(SET)])], profile_source: ps, updated_at: new Date().toISOString() }).eq('id', ID);
  if (error) throw error;
  for (const e of EXECS) { const key = `${ID}|${e.name}`; const { data: ex } = await db.from('company_executives').select('id').eq('dedupe_key', key).maybeSingle(); const { error: e2 } = ex ? await db.from('company_executives').update({ title: e.title, if_delete: false }).eq('id', ex.id) : await db.from('company_executives').insert({ company_id: ID, ...e, dedupe_key: key, human_review_status: 'review' }); if (e2) console.log('✗', e.name, e2.message); }
  const { data: after } = await db.from('companies').select('external_id, legal_representative, city, county_area, completeness_score').eq('id', ID).single(); console.log('已改', JSON.stringify(after));
}
