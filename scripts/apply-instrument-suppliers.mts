/**
 * 核实过的科研仪器供应商 → 企业实体库（用户 10-21：企业实体库是全集，「科研仪器厂商」只是它的筛选视图，不另存一份）。
 * 先在名单内部合并重复（同一官网域名 / 同一核心名，如「赛默飞世尔科技」「赛默飞世尔科技公司」），
 * 再在企业库里找：中文名 → 英文名 → 官网主域名（两边都是中文名且核心名互不包含的不算：集团域名下的子公司）→ 宽松名（核心名必须完全相同，前缀包含不算：「成都中微达信」≠「中微公司」）；
 *   找到了：只补「仪器类目 / 展会」，官网空着才补，别的字段不动；
 *   找不到：新建企业（来源「科研仪器」、待审核），编号 = 国家码.主域名（触发器），没官网退到拼音那一档。
 *   npx tsx scripts/apply-instrument-suppliers.mts [--in reports/instrument-suppliers-verified.json] [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { resolveCompanyId, resolveCompanyLoose } = await import('@/lib/company-match');
const { ensureCompanyFloraId } = await import('@/lib/company-flora-id');
const { countryCn } = await import('@/lib/country-cn');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const IN = opt('in', 'reports/instrument-suppliers-verified.json'), APPLY = process.argv.includes('--apply');
const { pass: raw } = JSON.parse(fs.readFileSync(IN, 'utf8')) as { pass: any[] };

const CJK = /[一-鿿]/;
const CORE_STRIP = /[（(][^）)]*[)）]|股份有限公司|有限责任公司|有限公司|集团|控股|公司|科技|技术|中国|北京|上海|深圳|广州|杭州|苏州|南京|成都|武汉|合肥|西安|天津|\s|·|,|\.|inc|ltd|llc|gmbh|ag|corporation|corp|co|company|group|holdings?|s\.?a\.?|plc/gi;
const core = (s?: string | null) => String(s || '').replace(CORE_STRIP, '').toLowerCase();

const domainOf = (u?: string | null) => { try { return new URL(String(u)).hostname.replace(/^www\d?\./, '').toLowerCase(); } catch { return ''; } };
async function byDomain(d: string) {
  if (!d || d.split('.').length < 2) return null;
  const { data } = await db.from('companies').select('id, official_website').ilike('official_website', `%${d}%`).not('if_delete', 'is', true).order('id').limit(5);
  return (data || []).find(c => domainOf(c.official_website) === d)?.id ?? null;
}

// 名单内部去重
const groups = new Map<string, any>();
for (const r of raw) {
  const k = (r.website_ok && domainOf(r.website)) || core(r.name_cn) || core(r.name_en);
  const g = groups.get(k) || [...groups.values()].find(x => (core(r.name_cn) && core(x.name_cn) === core(r.name_cn)) || (core(r.name_en) && core(x.name_en) === core(r.name_en)));
  if (!g) { groups.set(k, { ...r, verified_categories: [...r.verified_categories], exhibitions: [...(r.exhibitions || [])], merged: [r.name_cn || r.name_en] }); continue; }
  g.verified_categories = [...new Set([...g.verified_categories, ...r.verified_categories])];
  g.exhibitions = [...new Set([...g.exhibitions, ...(r.exhibitions || [])])];
  g.merged.push(r.name_cn || r.name_en);
  if (!g.website_ok && r.website_ok) { g.website = r.website; g.website_ok = true; }
}
const pass = [...groups.values()];
console.log(`名单 ${raw.length} 条，内部合并重复后 ${pass.length} 家`);

async function namesOf(id: number) {
  const { data } = await db.from('companies').select('name, name_en, brief_name, aliases').eq('id', id).single();
  return data ? [data.name, data.name_en, data.brief_name, ...((data.aliases as string[]) || [])].filter(Boolean) as string[] : [];
}
/** 宽松名：核心名完全相同才算 */
async function looseStrict(n?: string) {
  const id = await resolveCompanyLoose(n);
  if (!id) return null;
  return (await namesOf(id)).some(x => core(x) && core(x) === core(n)) ? id : null;
}
/** 官网域名：两边都是中文名、核心名互不包含 → 多半是集团域名下的另一家，不算 */
async function domainStrict(r: any) {
  const id = await byDomain(r.website_ok ? domainOf(r.website) : '');
  if (!id || !r.name_cn) return id;
  const cn = (await namesOf(id)).filter(x => CJK.test(x)).map(core).filter(Boolean);
  const me = core(r.name_cn);
  return !cn.length || cn.some(x => x.includes(me) || me.includes(x)) ? id : null;
}

/** 展会只记真从展商名单来的（模型说的「常参加哪些展」没核实过，不记——宁空不错） */
const exhibitionsOf = (r: any) => /展商名单/.test(r.source || '') ? (r.exhibitions || []) : [];

let created = 0, updated = 0;
const how: Record<string, number> = {};
for (const r of pass) {
  const tries: [string, () => Promise<number | null>][] = [
    ['中文名', () => resolveCompanyId(r.name_cn)],
    ['英文名', () => resolveCompanyId(r.name_en)],
    ['官网域名', () => domainStrict(r)],
    ['宽松名', () => looseStrict(r.name_cn || r.name_en)],
  ];
  r.company_id = null;
  for (const [k, f] of tries) { const id = await f().catch(() => null); if (id) { r.company_id = id; r.matched_by = k; how[k] = (how[k] || 0) + 1; break; } }
  if (!APPLY) continue;
  if (r.company_id) {
    const { data: co } = await db.from('companies').select('supplier_categories, supplier_exhibitions, official_website').eq('id', r.company_id).single();
    const { error } = await db.from('companies').update({
      supplier_categories: [...new Set([...(co?.supplier_categories || []), ...r.verified_categories])],
      supplier_exhibitions: [...new Set([...(co?.supplier_exhibitions || []), ...exhibitionsOf(r)])],
      ...(!co?.official_website && r.website_ok ? { official_website: r.website } : {}),
    }).eq('id', r.company_id);
    if (error) console.log(`  补类目失败 ${r.name_cn || r.name_en}：${error.message}`); else updated++;
  } else {
    const { data, error } = await db.from('companies').insert({
      name: r.name_cn || r.name_en, name_en: r.name_en || null, country: r.is_domestic ? '中国' : (countryCn(r.country) || r.country || null),   // 企业库存中文国名
      official_website: r.website_ok ? r.website : null, source: ['科研仪器'], supplier_categories: r.verified_categories, supplier_exhibitions: exhibitionsOf(r),
      human_review_status: 'review',
    }).select('id').single();
    if (error) { console.log(`  建档失败 ${r.name_cn || r.name_en}：${error.message}`); continue; }
    r.company_id = data.id; created++;
    await ensureCompanyFloraId(data.id).catch(() => {});
  }
}
console.log(`共 ${pass.length} 家：已在库 ${pass.filter(r => r.matched_by).length}（${Object.entries(how).map(([k, n]) => `${k} ${n}`).join('、')}），要新建 ${pass.filter(r => !r.matched_by).length}`);
if (APPLY) console.log(`写库：新建 ${created}，已有企业补类目 ${updated}`);
fs.writeFileSync(IN.replace(/\.json$/, '-applied.json'), JSON.stringify({ at: new Date().toISOString(), apply: APPLY, pass }, null, 1));
