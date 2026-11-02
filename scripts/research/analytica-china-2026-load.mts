/**
 * 2026 慕尼黑上海分析生化展会刊（analytica-china-2026-crawl.mts 抓的）→ 企业库（展商）+ 科研产品库（参展商品）。姜贺 11-02。
 * 展商：库里有的（中文名 → 英文名 → 官网主域名 → 核心名完全相同）只补「仪器类目 / 展会」、官网空着才补；没有的新建（来源「科研仪器」、待审核）。
 * 商品：每家的参展商品全收（名称、介绍、图片、分类），挂到展商下；类型按会刊给的商品分类定，没有分类的按名称关键词定。
 *   标签用数据部门给的提示词（千问，公司付）；图片存进 research-images。介绍照会刊原文，不改写。
 *   npx tsx scripts/research/analytica-china-2026-load.mts [--limit N] [--no-labels] [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import crypto from 'node:crypto';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { resolveCompanyId, resolveCompanyLoose } = await import('@/lib/company-match');
const { ensureCompanyFloraId } = await import('@/lib/company-flora-id');
const { kindOf, productExternalId, plainHtml, labelPrompt, cleanLabels } = await import('@/lib/research-products');
const { generateContent } = await import('@/lib/llm-client');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isBlankImage } = await import('@/lib/image-blank');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply'), LIMIT = Number(opt('limit', '0')), LABELS = !process.argv.includes('--no-labels');
const EXHIBITION = '慕尼黑上海分析生化展';   // 和 2024 那批同一个展（analytica China），名字保持一致
const IMG = 'https://resources.analyticachina.com.cn/';
const PAGE = (id: string | number) => `https://onlinecatalogue.analyticachina.com.cn/exhibitors/company/${id}`;
const J = JSON.parse(fs.readFileSync('reports/analytica-china-2026.json', 'utf8'));

// 会刊分类 → 我们的 22 类 / 产品类型（父类 id：343 分析仪器、344 测量参数、345 信息与服务、346 实验室装备、347 实验室建设、348 洁净室、349 自动化与数字化、350 试剂化学品、351 生物技术、352 诊断）
const CAT: Record<string, { cat?: string; kind?: string }> = {
  '光学分析设备': { cat: 'analytical' }, '光度计': { cat: 'analytical' }, '光谱仪与配件': { cat: 'analytical' }, '微波系统': { cat: 'analytical' }, '显微镜及光学图像处理': { cat: 'analytical' },
  '检测仪': { cat: 'analytical' }, '流程分析': { cat: 'analytical' }, '联动系统': { cat: 'analytical' }, '色谱仪与配件': { cat: 'analytical' }, '芯片实验室': { cat: 'analytical' }, '质谱仪与配件': { cat: 'analytical' }, '通用分析仪器': { cat: 'analytical' },
  '材料测试': { cat: 'physical_testing' }, '几何测量/测试': { cat: 'metrology' }, '光学参数': { cat: 'metrology' }, '化学与生物参数': { cat: 'metrology' }, '放射参数': { cat: 'nuclear' }, '时间及基于时间系数': { cat: 'metrology' },
  '机械系数': { cat: 'physical_testing' }, '热量单位': { cat: 'metrology' }, '物理参数': { cat: 'physical_testing' }, '电参数': { cat: 'electronic_measurement' }, '质量评估软件': { cat: 'computing', kind: 'system' },
  '专业信息，数据库': { kind: 'service' }, '专利授权机构': { kind: 'service' }, '合同分析': { kind: 'service' }, '合同研究与开发（CRO）': { kind: 'service' }, '教育与培训': { kind: 'training' }, '文献': { kind: 'service' },
  '图像分析和处理': { cat: 'computing', kind: 'system' }, '实验室数据系统归档和软件': { cat: 'computing', kind: 'system' }, '通讯和软件': { cat: 'computing', kind: 'system' },
  '实验室技术和配套设备': { cat: 'other_instrument' }, '实验室装备及机械': { cat: 'other_instrument' },
  '实验室安全与认证': { cat: 'other_instrument' }, '实验室家具与系统': { cat: 'other_instrument' }, '实验室工程与建设': { kind: 'service' }, '实验室建设相关材料': { cat: 'lab_consumables', kind: 'consumable' },
  '实验室技术培训与管理': { kind: 'training' }, '实验室规划与设计': { kind: 'service' }, '废物处理和回收': { kind: 'service' },
  '洁净室工程系统与材料': { cat: 'process_testing' }, '洁净室服务与其他': { kind: 'service' }, '洁净室检测系统与认证': { cat: 'special_testing' }, '洁净室耗材与用品': { cat: 'lab_consumables', kind: 'consumable' }, '洁净室规划与设计': { kind: 'service' },
  'LIMS系统及分析软件': { cat: 'computing', kind: 'system' }, '人工智能': { cat: 'computing', kind: 'system' }, '数字化转型': { cat: 'computing', kind: 'system' }, '数据管理': { cat: 'computing', kind: 'system' }, '系统集成': { cat: 'computing', kind: 'system' },
  '实验室自动化设备': { cat: 'other_instrument' }, '智能实验室': { cat: 'other_instrument' }, '机器人': { cat: 'other_instrument' },
  '临床化学分析试剂': { cat: 'chemical_reagent', kind: 'reagent' }, '其他试剂': { cat: 'chemical_reagent', kind: 'reagent' }, '化学分析试剂': { cat: 'chemical_reagent', kind: 'reagent' }, '化学品': { cat: 'chemical_reagent', kind: 'reagent' },
  '同位素': { cat: 'chemical_reagent', kind: 'reagent' }, '基因工程试剂': { cat: 'bio_reagent', kind: 'reagent' }, '散装化工品': { cat: 'chemical_reagent', kind: 'reagent' }, '水分析试剂': { cat: 'chemical_reagent', kind: 'reagent' },
  '精细化工品': { cat: 'chemical_reagent', kind: 'reagent' }, '认证标准物质': { cat: 'reference_materials', kind: 'reagent' }, '食品分析试剂': { cat: 'chemical_reagent', kind: 'reagent' },
  '临床检验设备': { cat: 'medical_research' }, '影像系统': { cat: 'medical_research' }, '抗体': { cat: 'antibody_protein', kind: 'reagent' }, '生化试剂': { cat: 'bio_reagent', kind: 'reagent' }, '物质培养': { cat: 'cell_culture', kind: 'reagent' }, '干细胞': { cat: 'cell_culture', kind: 'reagent' },
  '基因组学': { cat: 'analytical' }, '蛋白质组学': { cat: 'analytical' }, '电泳': { cat: 'analytical' }, '生物技术设备': { cat: 'other_instrument' }, '生物技术与生命科学实验室': { cat: 'other_instrument' },
  '生物传感器': { cat: 'analytical' }, '除菌技术': { cat: 'other_instrument' }, '生物技术服务': { kind: 'service' }, '新药研发': { kind: 'service' }, '纳米技术/微波技术': { cat: 'process_testing' },
  '诊断设备': { cat: 'medical_research' }, '诊断技术': { cat: 'medical_research' }, '诊断试剂': { cat: 'bio_reagent', kind: 'reagent' }, '检测与试剂盒': { cat: 'bio_reagent', kind: 'reagent' }, '生物芯片': { cat: 'bio_reagent', kind: 'reagent' },
};
const mapCats = (list: any[]) => (list || []).map(p => CAT[p.name]).filter(Boolean) as { cat?: string; kind?: string }[];
/** 商品类型：会刊分类多数票；没有分类按名称关键词；都没有就是仪器设备 */
function kindOfProduct(title: string, cats: { cat?: string; kind?: string }[]): { kind: string; cat: string | null } {
  const t = title || '';
  if (/试剂盒|试剂|抗体|标准品|标准物质|对照品|培养基|血清|酶|引物|探针|缓冲液|染料|化学品|溶剂/.test(t)) return { kind: 'reagent', cat: cats.find(c => c.kind === 'reagent')?.cat || 'chemical_reagent' };
  if (/色谱柱|滤膜|吸头|离心管|样品瓶|培养皿|耗材|手套|过滤器|针头|萃取柱|SPE/i.test(t)) return { kind: 'consumable', cat: /色谱柱|萃取|样品瓶|SPE/i.test(t) ? 'chromatography_consumables' : 'lab_consumables' };
  if (/软件|LIMS|ELN|系统平台|云平台|数据平台|SaaS/i.test(t)) return { kind: 'system', cat: 'computing' };
  if (/服务|检测服务|CRO|定制|外包|维修|校准|咨询/.test(t)) return { kind: 'service', cat: null };
  if (/培训|课程/.test(t)) return { kind: 'training', cat: null };
  const kinds = cats.filter(c => c.kind && c.kind !== 'reagent' && c.kind !== 'consumable').map(c => c.kind!);
  const cat = cats.find(c => c.cat && !c.kind)?.cat || cats.find(c => c.cat)?.cat || null;
  return { kind: cats.length && kinds.length === cats.length ? kinds[0] : 'instrument', cat };
}

const CJK = /[一-鿿]/;
const CORE_STRIP = /[（(][^）)]*[)）]|股份有限公司|有限责任公司|有限公司|集团|控股|公司|科技|技术|中国|北京|上海|深圳|广州|杭州|苏州|南京|成都|武汉|合肥|西安|天津|\s|·|,|\.|inc|ltd|llc|gmbh|ag|corporation|corp|co|company|group|holdings?|s\.?a\.?|plc/gi;
const core = (s?: string | null) => String(s || '').replace(CORE_STRIP, '').toLowerCase();
const site = (u?: string | null) => { const s = String(u || '').trim(); if (!s) return null; return /^https?:\/\//i.test(s) ? s : `https://${s}`; };
const domainOf = (u?: string | null) => { try { return new URL(String(site(u))).hostname.replace(/^www\d?\./, '').toLowerCase(); } catch { return ''; } };
async function byDomain(d: string) {
  if (!d || d.split('.').length < 2) return null;
  const { data } = await db.from('companies').select('id, official_website').ilike('official_website', `%${d}%`).not('if_delete', 'is', true).order('id').limit(5);
  return (data || []).find(c => domainOf(c.official_website) === d)?.id ?? null;
}
async function namesOf(id: number) { const { data } = await db.from('companies').select('name, name_en, brief_name, aliases').eq('id', id).single(); return data ? [data.name, data.name_en, data.brief_name, ...((data.aliases as string[]) || [])].filter(Boolean) as string[] : []; }
async function looseStrict(n?: string) { const id = await resolveCompanyLoose(n); if (!id) return null; return (await namesOf(id)).some(x => core(x) && core(x) === core(n)) ? id : null; }
async function domainStrict(m: any) {
  const id = await byDomain(domainOf(m.website)); if (!id) return null;
  const cn = CJK.test(m.title) ? core(m.title) : ''; if (!cn) return id;
  const theirs = (await namesOf(id)).filter(x => CJK.test(x)).map(core).filter(Boolean);
  return !theirs.length || theirs.some(x => x.includes(cn) || cn.includes(x)) ? id : null;
}
async function fetchImage(supplierId: number, extId: string, url: string) {
  const img: any = { url };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && /^image\//.test(ct)) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1500 && await isBlankImage(buf)) return null;
      if (buf.length > 1500 && buf.length < 8 * 1024 * 1024) {
        const key = `${supplierId}/${extId}/${crypto.createHash('md5').update(url).digest('hex').slice(0, 12)}.${(ct.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '')}`;
        const { error } = await db.storage.from('research-images').upload(key, buf, { contentType: ct, upsert: true });
        if (!error) img.storage_path = key;
      }
    }
  } catch { /* 拿不到就只留原链接 */ }
  return img;
}
const norm = (s: string) => (s || '').toLowerCase().replace(/[\s\-_/·（）()]+/g, '');

const ids = Object.keys(J.details).filter(id => J.details[id]?.detail);
const todo = LIMIT ? ids.slice(0, LIMIT) : ids;
const stat = { companies: 0, matched: 0, created: 0, products: 0, images: 0, how: {} as Record<string, number>, kinds: {} as Record<string, number> };
let done = 0;
// 3 路并行（线上共用库，总并发不超过 3–4）：一家展商 + 它的商品为一个单位
const queue = [...todo];
async function worker() { while (queue.length) { const id = queue.shift()!; try { await one(id); } catch (e: any) { console.log(`  ${id} 出错：${e.message}`); } } }
async function one(id: string) {
  const m = J.members[id] || {}, d = J.details[id].detail;
  const cn = CJK.test(d.title || '') ? d.title : null, en = d.etitle || (!cn ? d.title : null);
  const cats = [...new Set(mapCats(d.products || m.products).map(c => c.cat).filter(Boolean) as string[])];
  // 1) 展商
  let cid: number | null = null, how = '';
  for (const [k, f] of [['中文名', () => resolveCompanyId(cn)], ['英文名', () => resolveCompanyId(en)], ['官网域名', () => domainStrict({ title: d.title, website: d.website })], ['宽松名', () => looseStrict(cn || en)]] as [string, () => Promise<number | null>][]) {
    const x = await f().catch(() => null); if (x) { cid = x; how = k; break; }
  }
  stat.companies++;
  if (cid) { stat.matched++; stat.how[how] = (stat.how[how] || 0) + 1; }
  if (APPLY) {
    if (cid) {
      const { data: co } = await db.from('companies').select('supplier_categories, supplier_exhibitions, official_website').eq('id', cid).single();
      await db.from('companies').update({
        supplier_categories: [...new Set([...(co?.supplier_categories || []), ...cats])],
        supplier_exhibitions: [...new Set([...(co?.supplier_exhibitions || []), EXHIBITION])],
        ...(!co?.official_website && site(d.website) ? { official_website: site(d.website) } : {}),
      }).eq('id', cid);
    } else {
      const { data, error } = await db.from('companies').insert({
        name: cn || en, name_en: en && en !== cn ? en : null, official_website: site(d.website), introduction: (d.des || '').trim() || null,
        source: '科研仪器', supplier_categories: cats, supplier_exhibitions: [EXHIBITION], human_review_status: 'review',
        profile_source: { introduction: PAGE(id), official_website: PAGE(id) },
      }).select('id').single();
      if (error) { console.log(`  建档失败 ${cn || en}：${error.message}`); return; }
      cid = data.id; stat.created++;
      await ensureCompanyFloraId(data.id).catch(() => {});
    }
  }
  // 2) 参展商品：详情里的完整清单 + 分页里带的图片 / 分类
  const paged = new Map((J.details[id].exhibits || []).map((e: any) => [e.id, e]));
  for (const e0 of d.exhibits || []) {
    const e: any = { ...e0, ...(paged.get(e0.id) || {}) };
    const title = String(e.title || e.etitle || '').trim(); if (!title) continue;
    const pc = mapCats(e.products?.length ? e.products : []);
    const { kind, cat } = kindOfProduct(title, pc.length ? pc : mapCats(d.products || []));
    stat.kinds[kind] = (stat.kinds[kind] || 0) + 1; stat.products++;
    if (!APPLY || !cid) continue;
    const k = kindOf(kind)!;
    const intro = String(e.des || e.edes || '').replace(/￼/g, '').trim();
    const dedupe = `${cid}|${norm(title)}|`;
    const { data: old } = await db.from('research_products').select('id, external_id, labels').eq('dedupe_key', dedupe).maybeSingle();
    const extId = old?.external_id || productExternalId(kind as any);
    let labels = old?.labels || null;
    if (LABELS && !labels) {
      const lr = await generateContent(labelPrompt({ name: title, company: cn || en, type: k.name, intro }), 'qwen-flash', { temperature: 0 }).catch(() => null);
      if (lr) { labels = cleanLabels(lr.text); await logTokenUsage({ tool_name: 'research-products' as any, task_name: 'Research Product Labels', institution: cn || en, model_id: lr.model || 'qwen-flash', usageMetadata: lr.usageMetadata, success: true }).catch(() => {}); }
    }
    const row: any = {
      name: title.slice(0, 300), description: plainHtml(intro), labels, status: 'onShelf', supplier_id: cid, type: k.type, kind, category: cat,
      brand_origin: cn && !en ? 'domestic' : null, source_url: PAGE(id), ai_sources: { product_page: PAGE(id), source: `${EXHIBITION} 2026 在线会刊`, at: new Date().toISOString() },
      dedupe_key: dedupe, human_review_status: 'review',
    };
    const { data: saved, error } = old
      ? await db.from('research_products').update({ ...row, updated_at: new Date().toISOString() }).eq('id', old.id).select('id').single()
      : await db.from('research_products').insert({ ...row, external_id: extId }).select('id').single();
    if (error) { console.log(`  商品写不进 ${title}：${error.message}`); continue; }
    const paths = [...new Set([...(e.images || []).map((g: any) => g.path || g.orign_path), e.logo].filter(Boolean))].slice(0, 4);
    if (paths.length) {
      const imgs = (await Promise.all(paths.map(p => fetchImage(cid!, extId, IMG + String(p).replace(/^\//, ''))))).filter(Boolean);
      if (imgs.length) { await db.from('research_products').update({ images: imgs }).eq('id', saved.id); stat.images += imgs.length; }
    }
  }
  if (++done % 50 === 0) console.log(`${done}/${todo.length}：展商已在库 ${stat.matched}、新建 ${stat.created}；商品 ${stat.products}、图 ${stat.images}`);
}
await Promise.all([worker(), worker(), worker()]);
console.log(JSON.stringify(stat));
fs.writeFileSync('reports/analytica-china-2026-load.json', JSON.stringify({ at: new Date().toISOString(), apply: APPLY, stat }, null, 1));
