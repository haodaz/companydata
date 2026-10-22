/**
 * 智囊团（datasquare /global）找到的企业 → companydata 企业库（2026-10-23，用户：东西都别浪费，进企业库）
 *   npx tsx --env-file=.env.local scripts/sync-global-companies.mts <jobId> [--dry]
 * - 读 datasquare global_entities（kind=company；transfer 里公司型的也算），按名字 / 英文名 / 别名在 companydata 去重：
 *   已有的只补空字段、合并别名、加标签；没有的新建（human_review_status=review）。
 * - 外方企业主名用原语言官方名（name_native），中文名 / 英文名进别名；中方用中文名。
 * - 打标签「中欧教科人智囊团」；companydata 的企业 id 回写到 global_entities.external_ids.companydata。
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const jobId = process.argv[2]; const DRY = process.argv.includes('--dry');
if (!jobId) { console.error('need jobId'); process.exit(1); }
const dsEnv = Object.fromEntries(fs.readFileSync('../datasquare/.env.local', 'utf8').split('\n').map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m![1], m![2].trim().replace(/^"|"$/g, '')]));
const ds = createClient(dsEnv.SUPABASE_URL, dsEnv.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cd = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TAG = '中欧教科人智囊团';
const CJK = /[一-鿿]/;
const COMPANYISH = /(GmbH|AG|SE|SA|Ltd|Inc|LLC|有限公司|股份|集团|科技|Corp|Company|S\.A\.|Sàrl|KG)\b/i;

const { data: ents, error } = await ds.from('global_entities').select('id, kind, side, name, name_en, country, country_code, region, org, tier, subfields, summary, profile, recommended, external_ids, appendix_code').eq('job_id', jobId);
if (error) { console.error(error.message); process.exit(1); }
const list = (ents || []).filter(e => e.kind === 'company' || (e.kind === 'transfer' && (e.tier === 'company' || COMPANYISH.test(e.name_en || e.name))));
console.log(`job ${jobId}: ${ents?.length} entities, ${list.length} company-like`);

const esc = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[%_]/g, m => `\\${m}`)}"`;
async function find(names: string[]): Promise<any | null> {
  for (const n of names) {
    const { data } = await cd.from('companies').select('id, name, name_en, aliases, country, city, industry, one_sentence, introduction, tags, official_website').eq('if_delete', false).or(`name.ilike.${esc(n)},name_en.ilike.${esc(n)},brief_name.ilike.${esc(n)}`).order('id').limit(1);
    if (data?.[0]) return data[0];
    const { data: a } = await cd.from('companies').select('id, name, name_en, aliases, country, city, industry, one_sentence, introduction, tags, official_website').eq('if_delete', false).contains('aliases', [n]).limit(1);
    if (a?.[0]) return a[0];
  }
  return null;
}

let created = 0, merged = 0;
for (const e of list) {
  const p = e.profile || {};
  const abroad = e.side === 'abroad';
  const native = p.name_native || (abroad ? (e.name_en && CJK.test(e.name) ? e.name_en : e.name) : '');
  const cn = p.name_cn || (CJK.test(e.name) ? e.name : '');
  const primary = (abroad ? native || e.name_en || e.name : cn || e.name).trim();
  const names = [...new Set([primary, e.name, e.name_en, cn, native].filter(Boolean).map((x: string) => x.trim()))];
  const aliases = names.filter(n => n !== primary);
  const country = e.country || (e.country_code === 'CN' ? '中国' : e.country_code === 'DE' ? '德国' : e.country_code === 'CH' ? '瑞士' : null);
  const intro = String(e.summary || '').slice(0, 2000) || null;
  const site = p.website ? `https://www.${p.website}` : null;   // 补名字那步给的官网主域名；有了它企业编号按 国家码.主域名 自动生成
  const hit = await find(names);
  let id: number;
  if (hit) {
    const patch: Record<string, any> = {
      aliases: [...new Set([...(hit.aliases || []), ...names.filter(n => n !== hit.name)])],
      tags: [...new Set([...(hit.tags || []), TAG])],
    };
    if (!hit.name_en && e.name_en && !CJK.test(e.name_en)) patch.name_en = e.name_en;
    if (!hit.country && country) patch.country = country;
    if (!hit.city && e.region) patch.city = e.region;
    if (!hit.industry && e.subfields?.[0]) patch.industry = e.subfields[0];
    if (!hit.introduction && intro) patch.introduction = intro;
    if (!hit.official_website && site) patch.official_website = site;
    if (!DRY) await cd.from('companies').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', hit.id);
    id = hit.id; merged++;
    console.log(`= ${hit.id} ${hit.name}  ←  ${primary}`);
  } else {
    const row = { name: primary, name_en: e.name_en && !CJK.test(e.name_en) ? e.name_en : null, aliases, country, city: e.region || null, industry: e.subfields?.[0] || null, introduction: intro, one_sentence: intro ? intro.split(/[。.!！]/)[0].slice(0, 120) : null, official_website: site, segment: e.country_code === 'CN' ? 'china' : 'other', tags: [TAG], human_review_status: 'review' };
    if (DRY) { console.log(`+ (dry) ${primary} | ${aliases.join(' / ')} | ${country}`); continue; }
    const { data, error: ie } = await cd.from('companies').insert(row).select('id').single();
    if (ie) { console.warn(`! ${primary}: ${ie.message}`); continue; }
    id = data.id; created++;
    console.log(`+ ${id} ${primary} | ${aliases.join(' / ')} | ${country}`);
  }
  if (!DRY) await ds.from('global_entities').update({ external_ids: { ...(e.external_ids || {}), companydata: String(id) } }).eq('id', e.id);
}
console.log(`done: 新建 ${created}，已有 ${merged}${DRY ? '（dry run）' : ''}`);
