/**
 * 数据部门 11-10（姜贺）给了爱企查截图：按截图改常州天瑞仪器（#3896）和江苏天瑞仪器（#2310）。
 * 3896 上次重补画像又被灌进了江苏天瑞的东西（官网、地址、股票代码、产品、动态、高管）：照截图改正，错挂的子实体软删，主要人员照截图补；改过的字段锁住，以后补全不覆盖。
 *   npx tsx scripts/companies/fix-tianrui-1110.mts [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const APPLY = process.argv.includes('--apply');
const SRC = '爱企查截图（数据部门 11-10）';
const TEXT_CLEAR = ['one_sentence', 'company_specialties', 'product_area', 'tech_advantage', 'growth_signals', 'industry_position', 'business_profile', 'public_sentiment', 'candidate_reputation', 'company_case', 'company_evaluate', 'ai_comprehensive_evaluate', 'research_area', 'name_en', 'brief_name', 'logo_url', 'careers_url', 'campus_url', 'info_phone', 'operating_revenue', 'profit', 'paid_in_capital'];
const FIX: Record<number, Record<string, any>> = {
  3896: {
    ...Object.fromEntries(TEXT_CLEAR.map(k => [k, null])),
    unified_social_credit_code: '913204135558186310', legal_representative: '冯国民', registered_capital: '200万元人民币', info_founding_year: 2010,
    official_website: 'https://jstr17.com', info_email: '2585298024@qq.com', stock_code: null, company_type: 'private', kind: 'limited_liability_company', company_employees: 9,
    province: '32', city: '320400', county_area: '320413', address: '常州市金坛区良常中路249号凤凰城经济工业园27-2号', registration_address: '常州市金坛区良常中路249号凤凰城经济工业园27-2号', industry: '仪器仪表制造业', sub_industry: '教学仪器制造',
    business_range: '教学仪器及配件的制造和销售；直流电机的制造和销售；自营和代理各类商品及技术的进出口业务。（依法须经批准的项目，经相关部门批准后方可开展经营活动）',
    introduction: '常州天瑞仪器有限公司成立于2010年5月17日，注册地位于常州市金坛区良常中路249号凤凰城经济工业园27-2号，法定代表人为冯国民。经营范围包括教学仪器及配件的制造和销售、直流电机的制造和销售，以及自营和代理各类商品及技术的进出口业务。',
  },
  2310: { legal_representative: '应刚', official_website: 'https://www.skyray-instrument.com' },
};
const bak: any = {};
for (const [id, set] of Object.entries(FIX)) {
  const { data: c } = await db.from('companies').select('*').eq('id', id).single(); bak[id] = c;
  const changed = Object.keys(set).filter(k => JSON.stringify(c[k] ?? null) !== JSON.stringify(set[k] ?? null));
  console.log(`#${id} ${c.name}：改 ${changed.length} 个字段：${changed.map(k => `${k}=${String(set[k] ?? '空').slice(0, 24)}`).join('；')}`);
  if (!APPLY) continue;
  const locked = [...new Set([...(c.human_locked_fields || []), ...Object.keys(set).filter(k => set[k] != null)])];
  const ps = { ...(c.profile_source || {}) }; for (const k of Object.keys(set)) { if (set[k] != null) ps[k] = SRC; else delete ps[k]; }
  const { error } = await db.from('companies').update({ ...set, human_locked_fields: locked, profile_source: ps, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
const sub: any = {};
for (const t of ['company_executives', 'company_products', 'company_news']) { const { data } = await db.from(t).select('*').eq('company_id', 3896).not('if_delete', 'is', true); sub[t] = data; console.log(`#3896 ${t} 软删 ${data?.length || 0}`); }
bak.sub3896 = sub;
const EXECS = [{ name: '冯国民', title: '执行董事、法定代表人' }, { name: '冯立', title: '监事' }];
console.log('#3896 主要人员照截图补：', EXECS.map(e => `${e.name}（${e.title}）`).join('、'));
if (APPLY) {
  for (const t of Object.keys(sub)) if (sub[t]?.length) await db.from(t).update({ if_delete: true }).in('id', sub[t].map((x: any) => x.id));
  for (const e of EXECS) { const key = `3896|${e.name}`; const { data: ex } = await db.from("company_executives").select("id").eq("dedupe_key", key).maybeSingle(); const { error } = ex ? await db.from("company_executives").update({ title: e.title, if_delete: false }).eq("id", ex.id) : await db.from("company_executives").insert({ company_id: 3896, ...e, dedupe_key: key, human_review_status: "review" }); if (error) console.log("✗", e.name, error.message); }
  fs.writeFileSync('reports/1110-天瑞两家-改前备份.json', JSON.stringify(bak, null, 1));
  console.log('已改');
}
