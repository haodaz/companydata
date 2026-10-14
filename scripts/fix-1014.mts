/**
 * 数据部门 2026-10-14 反馈（查企业、岗位反馈-1014.docx + 公司来源及slug.xlsx + 行业和产业的选项集.xlsx）：
 *   npx tsx scripts/fix-1014.mts            只出报告，不写库
 *   npx tsx scripts/fix-1014.mts --apply    写库
 *   --only co-source|job-defaults|co-industry|job-source|job-lang|occ-new|co-merge   只跑其中一步；--limit N 试跑；--model 换模型（默认 qwen-plus）
 *
 * ① co-source：按《公司来源及slug》把现有企业分成 潜历一批 / 潜历二批 / ted，名单里没有的标「其他」（companies.source）；
 *    名单里给了 slug 的，企业编号 external_id 换成平台的 slug 并锁定（flora_id_locked，触发器不再改）。
 *    对名字：全名 / 工商名 / 简称 / 英文名完全一致 → 平台 slug 指向的企业 → 去掉地名和「有限公司」等后缀后唯一命中 → 我们的简称包含在对方全名里且唯一。
 *    一家在名单里出现在几个批次的，按 潜历一批 > 潜历二批 > ted 取一个。
 *    报告：疑似填错的 slug（平台 slug 是域名、但和这家企业官网的域名对不上）、我们库里疑似重复的企业（两家抢同一个 slug）。
 * ② job-defaults：主办方空 → 所属企业名；年级要求空且学历说明有值 → 按学历说明推；工作地址空 → 工作地点；技能标签（JD 原文）统一「；」。
 *    规则在 src/lib/job-defaults.ts，入库时也走这一套。审核已定论（通过 / 不通过 / 失效隐藏）的岗位不动。
 * ③ co-industry：所属行业大类（97 个，GB/T 4754）/ 所属产业二级目录（38 个，战略性新兴产业）——按企业名、行业、简介让便宜模型从选项集里选，
 *    存 external_id 数组（导出时「|」隔开）。只填空；审核已定论的不动；不属于战新产业的产业目录留空。
 * ④ job-source（迁移 030 跑完后）：岗位「来源」= 所属企业的名单批次（和企业一致）；原来的招聘渠道已由 030 挪到 recruit_channel。
 * ⑥ occ-new：人社部第八批（2026-09-09 发布）11 个新职业 + 23 个新工种进职业库。新职业的简介用 7 月公示稿的官方定义原文，
 *    其余字段联网建档（只填空）；新工种没有公开的官方定义，整条联网建档、待审核。来源记进 ai_sources。
 * ⑦ co-merge：合并我们库里重复建档的企业（① 报告「疑似重复企业」里名字明显是同一家的那些组；名单里两家不同公司共用 slug 的不动，等数据部门核对）。
 *    留拿到平台 slug 的那条；另一条的岗位 / 子实体 / 抓取记录等挪过来，空字段用它补（人工锁定的不动），名字进别名，然后软删。
 * ⑤ job-lang（迁移 030 跑完后）：岗位中英文字段 *_lang_cn / *_lang_en——原文是哪种语言就原样放进那一列，另一列用便宜模型翻译。
 */
import fs from 'node:fs';
import os from 'node:os';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { applyJobDefaults } = await import('../src/lib/job-defaults');
const { FROZEN_REVIEW_STATUSES } = await import('../src/lib/review-status');
const { COMPANY_INDUSTRY_OPTIONS, COMPANY_INDUSTRY_LIST_OPTIONS } = await import('../src/lib/industry-options');
const { generateContent } = await import('../src/lib/llm-client');
const { parseJsonLoose } = await import('../src/lib/agents/search-llm');
const { logTokenUsage } = await import('../src/lib/token-logger');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (k: string) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : '';
const ONLY = arg('--only');
const LIMIT = arg('--limit') ? Number(arg('--limit')) : Infinity;
const MODEL = arg('--model') || 'qwen-plus';
const run = (k: string) => ONLY ? ONLY.split(',').includes(k) : !['job-source', 'job-lang', 'occ-new', 'co-merge'].includes(k);   // ④⑤ 要等 030，默认不跑
const OUT = arg('--out') || 'reports/1014';
fs.mkdirSync(OUT, { recursive: true });
console.log(APPLY ? '▶ 写库' : '▶ 只出报告（加 --apply 写库）');

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x); }));
}
const csv = (rows: (string | number | null | undefined)[][]) => '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

// ── ① 企业来源 + 平台 slug ──
if (run('co-source')) {
  const XLSX = await import('xlsx');
  const file = arg('--file') || `${os.homedir()}/Desktop/公司来源及slug.xlsx`;
  const wb = XLSX.read(fs.readFileSync(file));
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const list = rows.map(r => ({ name: String(r['公司名称'] || '').trim(), slug: r.slug ? String(r.slug).trim() : null, batch: String(r['来源'] || '').trim() })).filter(r => r.name);
  const { data: cos, error } = await selectAll(() => db.from('companies').select('id, name, registered_name, brief_name, name_en, official_website, external_id, source, flora_id_locked').order('id'));
  if (error) throw error;

  const SUF = /(股份有限公司|有限责任公司|有限公司|集团股份|集团|股份|公司|科技|技术|信息|网络|智能|软件|系统|研究院|研究所|实验室|事务所)+$/g;
  const PRE = /^(中国|北京市?|上海市?|深圳市?|广州市?|杭州市?|天津市?|重庆市?|南京市?|苏州市?|成都市?|武汉市?|西安市?|合肥市?|厦门市?|宁波市?|青岛市?|珠海市?|东莞市?|佛山市?|无锡市?|长沙市?|郑州市?|济南市?|福州市?|广东省?|浙江省?|江苏省?|山东省?|安徽省?|福建省?|湖北省?|湖南省?|四川省?|河南省?|河北省?)/;
  const PLACE = new Set(['上海', '北京', '深圳', '广州', '杭州', '中国', '天津', '苏州', '南京', '成都', '武汉', '西安', '合肥', '香港']);
  const flat = (s: any) => String(s || '').replace(/\s/g, '').toLowerCase();
  const core = (s: any) => { let t = flat(String(s || '').replace(/[（(][^）)]*[）)]/g, '')); for (let i = 0; i < 3; i++) t = t.replace(SUF, '').replace(PRE, ''); return t; };
  const paren = (s: any) => [...String(s || '').matchAll(/[（(]([^）)]+)[）)]/g)].map(m => flat(m[1])).filter(k => k.length >= 2 && !PLACE.has(k));
  const namesOf = (c: any) => [c.name, c.registered_name, c.brief_name, c.name_en].filter(Boolean);
  const exact = new Map<string, any[]>(), loose = new Map<string, any[]>();
  const put = (m: Map<string, any[]>, k: string, c: any) => { if (!k || k.length < 2) return; const a = m.get(k) || []; if (!a.includes(c)) a.push(c); m.set(k, a); };
  for (const c of cos as any[]) for (const n of namesOf(c)) { put(exact, flat(n), c); put(loose, core(n), c); for (const p of paren(n)) put(loose, p, c); }
  const bySlug = new Map((cos as any[]).filter(c => c.external_id).map(c => [c.external_id, c]));

  // 名单每一行 → 我们的哪家企业
  const hits = new Map<number, { c: any; rows: typeof list; how: string }>();
  const unmatchedRows: typeof list = [];
  const take = (c: any, r: (typeof list)[number], how: string) => { const h = hits.get(c.id) || { c, rows: [], how }; h.rows.push(r); hits.set(c.id, h); };
  for (const r of list) {
    const e = exact.get(flat(r.name)) || [];
    // 全名一致的：我们库里同名的有好几条（重复建档）就都算这一行的，slug 只给一家，其余进「疑似重复」
    if (e.length) { for (const c of e) take(c, r, '全名'); continue; }
    const s = r.slug ? bySlug.get(r.slug) : null;
    if (s) { take(s, r, 'slug'); continue; }
    const l = [...new Set([core(r.name), ...paren(r.name)].flatMap(k => loose.get(k) || []))];
    if (l.length === 1) { take(l[0], r, '去后缀'); continue; }
    unmatchedRows.push(r);
  }
  // 我们还没对上的企业：简称包含在对方某行全名里，且只指向一家对方企业（slug 相同算一家）
  for (const c of (cos as any[]).filter(c => !hits.has(c.id))) {
    const keys = namesOf(c).flatMap(n => [flat(n), core(n)]).filter(k => k.length >= 2 && !PLACE.has(k));
    const cand = unmatchedRows.filter(r => keys.some(k => flat(r.name).includes(k)));
    const groups = new Set(cand.map(r => r.slug || r.name));
    if (cand.length && groups.size === 1) for (const r of cand) take(c, r, '包含');
  }

  const RANK = ['潜历一批', '潜历二批', 'ted'];
  type Plan = { id: number; name: string; batch: string; slug: string | null; slugFrom: string | null; how: string; oldSource: string | null; oldSlug: string | null; site: string | null };
  const plans: Plan[] = (cos as any[]).map(c => {
    const h = hits.get(c.id);
    if (!h) return { id: c.id, name: c.name, batch: '其他', slug: null, slugFrom: null, how: '名单里没有', oldSource: c.source, oldSlug: c.external_id, site: c.official_website };
    const batch = RANK.find(b => h.rows.some(r => r.batch === b)) || h.rows[0].batch;
    // slug：优先全名一致的那一行，其次排在前面的批次
    const withSlug = h.rows.filter(r => r.slug).sort((a, b) => Number(flat(b.name) === flat(c.name)) - Number(flat(a.name) === flat(c.name)) || RANK.indexOf(a.batch) - RANK.indexOf(b.batch));
    return { id: c.id, name: c.name, batch, slug: withSlug[0]?.slug || null, slugFrom: withSlug[0]?.name || null, how: h.how, oldSource: c.source, oldSlug: c.external_id, site: c.official_website };
  });

  // 两家抢同一个 slug：全名一致的那家拿，其余报疑似重复
  const bySlugPlan = new Map<string, Plan[]>();
  for (const p of plans) if (p.slug) bySlugPlan.set(p.slug, [...(bySlugPlan.get(p.slug) || []), p]);
  const dupes: string[][] = [];
  for (const [slug, ps] of bySlugPlan) if (ps.length > 1) {
    ps.sort((a, b) => Number(flat(b.slugFrom) === flat(b.name)) - Number(flat(a.slugFrom) === flat(a.name)) || a.id - b.id);
    for (const p of ps.slice(1)) { dupes.push([slug, ps[0].name, String(ps[0].id), p.name, String(p.id)]); p.slug = null; }
  }
  // 疑似填错的 slug：平台 slug 是「国家码.域名」，但这家企业有官网而且主域名对不上
  const dom = (u: string | null) => { try { const h = new URL(/^https?:/.test(u || '') ? u! : `https://${u}`).hostname.replace(/^www\./, ''); return h; } catch { return null; } };
  const suspicious = plans.filter(p => p.slug && /^[a-z]{2}\.[a-z0-9-]+\.[a-z.]+\d*$/.test(p.slug) && p.site).filter(p => {
    const sd = p.slug!.slice(3).replace(/\d+$/, ''), wd = dom(p.site);
    if (!wd) return false;
    const base = (d: string) => d.split('.').slice(-2).join('.').replace(/\.(com|cn|net|org)$/, '');
    return !(wd.endsWith(sd) || sd.endsWith(wd) || base(sd) === base(wd) || sd.includes(base(wd)) || wd.includes(base(sd)));
  });

  const cnt = (f: (p: Plan) => boolean) => plans.filter(f).length;
  console.log(`\n① 名单 ${list.length} 行；库里 ${plans.length} 家：` + RANK.concat('其他').map(b => `${b} ${cnt(p => p.batch === b)}`).join(' / '));
  console.log(`   对名字：${['全名', 'slug', '去后缀', '包含'].map(h => `${h} ${cnt(p => p.how === h)}`).join(' / ')}；名单里我们没有的 ${unmatchedRows.length} 行`);
  console.log(`   换成平台 slug ${cnt(p => !!p.slug && p.slug !== p.oldSlug)} 家（已一致 ${cnt(p => !!p.slug && p.slug === p.oldSlug)}，名单没给 slug 的保留我们的 ${cnt(p => p.batch !== '其他' && !p.slug)}）；疑似重复 ${dupes.length} 组；疑似填错的 slug ${suspicious.length} 个`);
  fs.writeFileSync(`${OUT}/企业来源与slug-对照.csv`, csv([['企业 id', '企业名', '来源（新）', '来源（旧）', '平台 slug', '我们原来的编号', '对上的方式', '名单里的名字'], ...plans.map(p => [p.id, p.name, p.batch, p.oldSource, p.slug, p.oldSlug, p.how, p.slugFrom])]));
  fs.writeFileSync(`${OUT}/疑似填错的slug.csv`, csv([['企业名', '平台 slug', '这家企业的官网', '名单里的名字'], ...suspicious.map(p => [p.name, p.slug, p.site, p.slugFrom])]));
  fs.writeFileSync(`${OUT}/疑似重复企业.csv`, csv([['slug', '拿到 slug 的企业', 'id', '疑似重复的企业', 'id'], ...dupes]));
  fs.writeFileSync(`${OUT}/名单里我们没有的企业.csv`, csv([['公司名称', 'slug', '来源'], ...unmatchedRows.map(r => [r.name, r.slug, r.batch])]));
  console.log(`   报告 → ${OUT}/`);

  if (APPLY) {
    // 来源
    for (const b of [...RANK, '其他']) {
      const ids = plans.filter(p => p.batch === b && p.oldSource !== b).map(p => p.id);
      for (let i = 0; i < ids.length; i += 200) { const { error } = await db.from('companies').update({ source: b }).in('id', ids.slice(i, i + 200)); if (error) throw error; }
    }
    // slug：先挪到临时编号（锁住），再写平台 slug；被占用的旧主人解锁、清空，让触发器重算（重了会自动加 -2）
    const todo = plans.filter(p => p.slug && p.slug !== p.oldSlug).slice(0, LIMIT);
    for (const p of todo) { const { error } = await db.from('companies').update({ external_id: `tmp-1014-${p.id}`, flora_id_locked: true }).eq('id', p.id); if (error) throw error; }
    let moved = 0, bumped = 0;
    for (const p of todo) {
      let { error } = await db.from('companies').update({ external_id: p.slug, flora_id_locked: true }).eq('id', p.id);
      if (error && /duplicate|unique/i.test(error.message)) {
        const { data: holder } = await db.from('companies').select('id, name').eq('external_id', p.slug!).neq('id', p.id).maybeSingle();
        // 占着的多半是同一家企业的另一条记录：先把它挪到临时编号，写完平台 slug 再让它重算（触发器按官网算回同一个域名时会自动加 -2）
        if (holder) await db.from('companies').update({ external_id: `tmp-1014-${holder.id}`, flora_id_locked: true }).eq('id', holder.id);
        ({ error } = await db.from('companies').update({ external_id: p.slug, flora_id_locked: true }).eq('id', p.id));
        if (holder) { await db.from('companies').update({ external_id: null, flora_id_locked: false }).eq('id', holder.id); bumped++; }
      }
      if (error) console.log(`   ✗ ${p.name}：${error.message}`); else moved++;
    }
    // 名单给了 slug、且本来就一致的，也锁上
    const same = plans.filter(p => p.slug && p.slug === p.oldSlug).map(p => p.id);
    for (let i = 0; i < same.length; i += 200) await db.from('companies').update({ flora_id_locked: true }).in('id', same.slice(i, i + 200));
    console.log(`   ✓ 来源已写；slug 换了 ${moved} 家（让出旧编号重算 ${bumped} 家），本来一致的锁定 ${same.length} 家`);
  }
}

// ── ② 岗位默认值 ──
if (run('job-defaults')) {
  const { data: jobs, error } = await selectAll(() => db.from('jobs').select('id, organizer, grade, education_description, address, location, skill_labels_jd, human_review_status, human_locked_fields, institute_or_company_name, company:companies(name)').not('if_delete', 'is', true).order('id'));
  if (error) throw error;
  const changes: { id: number; patch: Record<string, any> }[] = [];
  const by: Record<string, number> = { organizer: 0, grade: 0, address: 0, skill_labels_jd: 0 };
  for (const j of jobs as any[]) {
    if (FROZEN_REVIEW_STATUSES.has(j.human_review_status || '')) continue;
    const locked = new Set(j.human_locked_fields || []);
    const next = applyJobDefaults({ ...j }, j.company?.name || j.institute_or_company_name);
    const patch: Record<string, any> = {};
    for (const k of Object.keys(by)) if (!locked.has(k) && JSON.stringify(next[k] ?? null) !== JSON.stringify(j[k] ?? null)) { patch[k] = next[k]; by[k]++; }
    if (Object.keys(patch).length) changes.push({ id: j.id, patch });
  }
  console.log(`\n② 岗位 ${jobs.length} 条，要改 ${changes.length} 条：主办方 ${by.organizer} / 年级要求 ${by.grade} / 工作地址 ${by.address} / 技能标签分隔 ${by.skill_labels_jd}`);
  for (const c of changes.slice(0, 5)) console.log('   样例', c.id, JSON.stringify(c.patch).slice(0, 200));
  if (APPLY) {
    let done = 0;
    await pool(changes.slice(0, LIMIT), 12, async c => { const { error } = await db.from('jobs').update(c.patch).eq('id', c.id); if (error) console.log(`   ✗ #${c.id}：${error.message}`); else done++; });
    console.log(`   ✓ 改了 ${done} 条`);
  }
}

// ── ③ 所属行业大类 / 所属产业二级目录 ──
if (run('co-industry')) {
  const { data: cos, error } = await selectAll(() => db.from('companies').select('id, name, name_en, industry, sub_industry, one_sentence, product_area, business_range, company_industry_ids, company_industry_list_ids, human_review_status').order('id'));
  if (error) throw error;
  const todo = (cos as any[]).filter(c => !FROZEN_REVIEW_STATUSES.has(c.human_review_status || '') && !(c.company_industry_ids || []).length).slice(0, LIMIT);
  console.log(`\n③ 企业 ${cos.length} 家，要归行业 / 产业的 ${todo.length} 家（模型 ${MODEL}）`);
  const IND = Object.entries(COMPANY_INDUSTRY_OPTIONS).map(([k, v]) => `${k}=${v}`).join('；');
  const ZL = Object.entries(COMPANY_INDUSTRY_LIST_OPTIONS).map(([k, v]) => `${k}=${v}`).join('；');
  const batches: any[][] = []; for (let i = 0; i < todo.length; i += 20) batches.push(todo.slice(i, i + 20));
  let done = 0, emptyZl = 0; const sample: string[] = [];
  await pool(batches, 6, async b => {
    const prompt = `给下面每家企业归类，只能从给定选项里选 external_id。
1. company_industry_ids「所属行业大类」（国民经济行业分类 GB/T 4754 大类）：按主营业务选 1 个，确实跨两三个主业才多选，最多 3 个。互联网平台选 major_class_64，软件 / IT 服务 / AI 软件选 major_class_65，芯片 / 电子 / 通信设备制造选 major_class_39，投资机构选 major_class_67，咨询 / 律所 / 会计 / 人力选 major_class_72，高校选 major_class_83，医院选 major_class_84。
2. company_industry_list_ids「所属产业二级目录」（战略性新兴产业分类）：只有主业确实属于战略性新兴产业才选（0–3 个）；餐饮、零售、普通咨询、传统金融这类不属于，返回空数组。
选项（所属行业大类）：${IND}
选项（所属产业二级目录）：${ZL}
返回 JSON：{ "items": [{ "id": 企业 id, "company_industry_ids": [...], "company_industry_list_ids": [...] }] }

企业：
${b.map(c => `- id ${c.id}：${c.name}${c.name_en ? `（${c.name_en}）` : ''}｜行业 ${c.industry || '-'}${c.sub_industry ? ` / ${c.sub_industry}` : ''}｜${String(c.one_sentence || c.product_area || c.business_range || '').slice(0, 120)}`).join('\n')}`;
    try {
      const r = await generateContent(prompt, MODEL, { jsonMode: true });
      await logTokenUsage({ tool_name: 'company-profile', task_name: 'Industry Classify 1014', model_id: MODEL, usageMetadata: r.usageMetadata, batch_id: 1014 }).catch(() => {});
      const items: any[] = parseJsonLoose(r.text)?.items || [];
      for (const it of items) {
        const c = b.find(x => x.id === Number(it.id)); if (!c) continue;
        const ind = [...new Set<string>((it.company_industry_ids || []).map(String).filter((k: string) => COMPANY_INDUSTRY_OPTIONS[k]))].slice(0, 3);
        const zl = [...new Set<string>((it.company_industry_list_ids || []).map(String).filter((k: string) => COMPANY_INDUSTRY_LIST_OPTIONS[k]))].slice(0, 3);
        if (!ind.length) continue;
        if (!zl.length) emptyZl++;
        if (sample.length < 12) sample.push(`${c.name}：${ind.map(k => COMPANY_INDUSTRY_OPTIONS[k]).join('、')}${zl.length ? ` ｜ ${zl.map(k => COMPANY_INDUSTRY_LIST_OPTIONS[k]).join('、')}` : ''}`);
        if (APPLY) { const { error } = await db.from('companies').update({ company_industry_ids: ind, company_industry_list_ids: zl }).eq('id', c.id); if (error) { console.log(`   ✗ ${c.name}：${error.message}`); continue; } }
        done++;
      }
    } catch (e: any) { console.log(`   ✗ 一批失败：${e.message}`); }
  });
  console.log(`   ${APPLY ? '✓ 写了' : '可写'} ${done} 家（其中不属于战新产业、产业目录空着的 ${emptyZl} 家）`);
  for (const s of sample) console.log('   ', s);
}

// ── ④ 岗位来源 = 企业的名单批次（迁移 030 之后） ──
if (run('job-source')) {
  const { data: jobs, error } = await selectAll(() => db.from('jobs').select('id, source, company:companies(source)').not('if_delete', 'is', true).order('id'));
  if (error) throw error;
  const groups = new Map<string, number[]>();
  for (const j of jobs as any[]) { const s = j.company?.source || '其他'; if (j.source !== s) groups.set(s, [...(groups.get(s) || []), j.id]); }
  console.log(`\n④ 岗位 ${jobs.length} 条，来源要改 ${[...groups.values()].reduce((a, b) => a + b.length, 0)} 条：${[...groups].map(([k, v]) => `${k} ${v.length}`).join(' / ')}`);
  if (APPLY) for (const [s, ids] of groups) for (let i = 0; i < ids.length; i += 200) { const { error } = await db.from('jobs').update({ source: s }).in('id', ids.slice(i, i + 200)); if (error) throw error; }
}

// ── ⑤ 岗位中英文字段（迁移 030 之后） ──
if (run('job-lang')) {
  // 对方的 *_lang 字段 → 我们库里对应的原文列（description / schedule / costs 我们没有单独的原文，留空）
  const SRC: Record<string, string | null> = { name: 'name', overview: 'overview', process: 'recruit_process', organizer: 'organizer', responsibilities: 'responsibilities', welfare: 'welfare', address: 'address', language: 'language_requirement', description: null, schedule: null, costs: null };
  const fields = Object.entries(SRC).filter(([, v]) => v) as [string, string][];
  const cols = ['id', 'human_review_status', ...new Set(fields.map(([, v]) => v)), ...fields.flatMap(([k]) => [`${k}_lang_cn`, `${k}_lang_en`])];
  const { data: jobs, error } = await selectAll(() => db.from('jobs').select(cols.join(', ')).not('if_delete', 'is', true).order('id'));
  if (error) throw error;
  const isZh = (s: string) => (s.match(/[一-鿿]/g) || []).length >= Math.max(2, s.replace(/\s/g, '').length * 0.15);
  type Todo = { id: number; patch: Record<string, string>; ask: { key: string; to: 'en' | 'cn'; text: string }[] };
  const todo: Todo[] = [];
  for (const j of jobs as any[]) {
    if (FROZEN_REVIEW_STATUSES.has(j.human_review_status || '')) continue;
    const t: Todo = { id: j.id, patch: {}, ask: [] };
    for (const [k, src] of fields) {
      const v = String(j[src] || '').trim(); if (!v) continue;
      const zh = isZh(v);
      const same = `${k}_lang_${zh ? 'cn' : 'en'}`, other = `${k}_lang_${zh ? 'en' : 'cn'}`;
      if (!j[same]) t.patch[same] = v;
      if (!j[other]) t.ask.push({ key: other, to: zh ? 'en' : 'cn', text: v });
    }
    if (Object.keys(t.patch).length || t.ask.length) todo.push(t);
  }
  const chars = todo.reduce((s, t) => s + t.ask.reduce((a, x) => a + x.text.length, 0), 0);
  console.log(`\n⑤ 岗位 ${jobs.length} 条，要写中英文的 ${todo.length} 条，待翻译约 ${Math.round(chars / 1e4)} 万字（模型 ${MODEL}）`);
  if (APPLY) {
    let done = 0, failed = 0;
    await pool(todo.slice(0, LIMIT), 8, async t => {
      try {
        if (t.ask.length) {
          const prompt = `把下面招聘岗位的各个字段翻译成目标语言。要求：忠实原文、不增不减、不总结；保留换行和编号；公司名、产品名、技术名词（Python、SQL、C++ 这类）保持原样；岗位名翻成通行的说法。
返回 JSON：{ "<字段键>": "译文", ... }，键原样照抄。
${t.ask.map(x => `【${x.key}】目标：${x.to === 'en' ? '英文' : '简体中文'}\n${x.text.slice(0, 6000)}`).join('\n\n')}`;
          const r = await generateContent(prompt, MODEL, { jsonMode: true });
          await logTokenUsage({ tool_name: 'structurer-job', task_name: 'Job Lang 1014', model_id: MODEL, usageMetadata: r.usageMetadata, batch_id: 1014 }).catch(() => {});
          const o = parseJsonLoose(r.text) || {};
          for (const x of t.ask) if (typeof o[x.key] === 'string' && o[x.key].trim()) t.patch[x.key] = o[x.key].trim();
        }
        if (Object.keys(t.patch).length) { const { error } = await db.from('jobs').update(t.patch).eq('id', t.id); if (error) throw error; }
        if (++done % 200 === 0) console.log(`   … ${done} / ${Math.min(todo.length, LIMIT)}`);
      } catch (e: any) { failed++; if (failed <= 10) console.log(`   ✗ #${t.id}：${e.message}`); }
    });
    console.log(`   ✓ 写了 ${done} 条，失败 ${failed} 条（重跑会接着补没写上的）`);
  }
}

// ── ⑥ 人社部第八批新职业 / 新工种进职业库 ──
if (run('occ-new')) {
  const { researchOccupation } = await import('../src/lib/agents/occupation-enrich');
  const { upsertOccupation, upsertSalaries, findOccupation } = await import('../src/lib/occupation-store');
  const SRC_NOTICE = 'https://m.12371.gov.cn/content/2026-07/03/content_512796.html';   // 7 月公示稿（带定义）
  const SRC_RELEASE = 'https://www.news.cn/fortune/20260909/f44ae08cf77d4958981d59663ae3063c/c.html';   // 9 月 9 日正式发布
  const SRC_GZ = 'https://m.hqwx.com/jlgcs-kaoshi/news/17890892694689.html';   // 23 个新工种名单（官方通稿只点了部分名字）
  // 新职业：官方定义（S 数字职业 / L 绿色职业）
  const JOBS8: [string, string, string][] = [
    ['船舶岸基管理工程技术人员', '', '从事船舶航行岸基安全保障、设备技术管控、营运合规监督、防污染管理、应急处置及安全管理制度运行监控的工程技术人员。'],
    ['数字孪生工程技术人员', 'S', '从事数字孪生技术研发、规划设计、工程实施、调试优化及运行维护的工程技术人员。'],
    ['具身智能机器人应用技术员', 'S', '使用遥操作设备、空间数字化工具及仿真测试平台，从事具身智能机器人多模态交互数据的采集与处理、算法模型的微调与适配、系统软硬件的现场部署与调试，以及运行效能监控与维护优化的人员。'],
    ['工业产品数字建模师', 'S', '使用数字化设计、产品数据管理等软件，从事工业产品三维模型构建、零部件设计、装配验证和工程图输出的人员。'],
    ['企业可持续发展规划师', '', '从事企业环境、社会与治理可持续发展规划管理工作的人员。'],
    ['微电网管理员', 'L/S', '使用微电网能量管理系统等，监测、预测和分析微电网电力数据，制定、执行微电网运行策略，实施并离网切换、并网和孤岛运行、黑启动，分析和评估微电网性能的人员。'],
    ['运动数据分析师', 'S', '从事体育运动数据收集、清洗、挖掘、分析，编制并应用运动表现分析报告的人员。'],
    ['制香香艺师', '', '以天然香材为原料，通过原料甄选、炮制、合方、成型、窖藏等技艺，制作香制品，进行香艺艺术实践与传播工作的人员。'],
    ['氢燃料电池制造工', 'L', '使用搅拌、涂布、热压、激光切割、测试平台等设备和工具，处理材料、制备部件，组装、调测氢燃料电池堆和系统，制造氢燃料电池的人员。'],
    ['卫星导航设备装调工', '', '使用频谱仪、卫星信号模拟器等仪器、设备和工具，装配、调试卫星导航设备的人员。'],
    ['电解水制氢工', 'L', '操作整流柜、电解槽、气体干燥净化装置、压缩机、储氢罐等设备，进行波动电源调节、原料制备、氢气生产、分离提纯、储存输送等作业的人员。'],
  ];
  const GZ8 = ['社区工作者', '消防救护员', '彩票销售员', '机场净空巡查员', '原糖保管员', '低空物流员', '食品生产安全员', '餐饮食品安全员', '食品销售安全员', '低空智能网联系统管理员', '智能体开发员', '工程建设项目劳资专管员', '新能源汽车检测员', '适老化改造设计师', '体育场馆安全员', '鲜切花加工工', '智能家具装调工', '冰雪雕塑工', '油渣萃取装置操作工', '聚乙醇酸装置操作工', '具身智能机器人数据采集员', '具身智能机器人训练师', '企业可持续投资分析师'];
  const todo = [...JOBS8.map(([name, tag, def]) => ({ name, tag, def, kind: '职业' })), ...GZ8.map(name => ({ name, tag: '', def: '', kind: '工种' }))].slice(0, LIMIT);
  const model = arg('--model') || 'gemini-3.8-flash';   // 国内信息在 occupation-enrich 里走千问联网
  console.log(`\n⑥ 第八批：新职业 ${JOBS8.length} + 新工种 ${GZ8.length}，要建档 ${todo.length} 个（模型 ${model}）`);
  let created = 0, filled = 0, failed = 0;
  await pool(todo, 3, async o => {
    try {
      const existing = await findOccupation({ name: o.name });
      if (existing?.intro && existing.source === 'official') { console.log(`  ${o.name}：已建档，跳过（#${existing.id}）`); return; }
      if (!APPLY) { console.log(`  ${o.kind} ${o.name}${o.tag ? `（${o.tag}）` : ''}${existing ? ` → 补全 #${existing.id}` : ' → 新建'}`); return; }
      const r = await researchOccupation(existing || { name: o.name }, model, 1014);
      const fields: Record<string, any> = { ...r.fields, name: o.name };
      const sources: Record<string, string> = { ...(r.sources || {}), name: o.kind === '职业' ? SRC_RELEASE : SRC_GZ };
      if (o.def) { fields.intro = o.def; sources.intro = SRC_NOTICE; }   // 官方定义原文
      // 别名只放真实叫法（别名用来和岗位名对上）；「第八批 / 数字职业 / 绿色职业」靠 source=official + 来源链接 + 报告记录
      fields.aliases = Array.from(new Set((fields.aliases || []).filter((a: string) => a !== o.name)));
      const saved = await upsertOccupation(existing ? { ...fields, external_id: existing.external_id } : fields, { mode: o.def ? 'overwrite' : 'fill', source: 'official', sources });
      const sal = await upsertSalaries(saved.id, r.salaries, 'fill');
      if (saved.created) created++; else filled++;
      console.log(`  ${o.kind} ${o.name}：${saved.created ? '新建' : '补全'}（#${saved.id}）${sal} 档薪资`);
    } catch (e: any) { failed++; console.log(`  ${o.name} 失败：${e.message}`); }
  });
  if (APPLY) console.log(`   ✓ 新建 ${created}、补全 ${filled}、失败 ${failed}（失败的重跑会接着补）`);
}

// ── ⑦ 合并我们库里的重复企业 ──
if (run('co-merge')) {
  const file = `${OUT}/疑似重复企业.csv`;
  const rows = fs.readFileSync(file, 'utf8').replace(/^\ufeff/, '').trim().split('\n').slice(1).map(l => l.slice(1, -1).split('","'));
  const flatN = (s: string) => String(s || '').replace(/[（(][^）)]*[）)]/g, '').replace(/(股份有限公司|有限责任公司|有限公司|集团|股份|公司|科技|技术|信息|智能)/g, '').replace(/^(上海|北京|深圳|广州|杭州|中国)/, '').replace(/\s/g, '').toLowerCase();
  // 括号里是地名的（「（上海）」）不算别名；母公司和子业务不算一家
  const PLACE_P = /^(上海|北京|深圳|广州|杭州|中国|天津|苏州|南京|成都|武汉|西安|合肥|香港|宁波|厦门)$/;
  const NOT_SAME = [['京东方', '京东方智慧农业']];
  const keysN = (s: string) => [flatN(s), ...[...String(s || '').matchAll(/[（(]([^）)]+)[）)]/g)].map(m => m[1].replace(/\s/g, '').toLowerCase()).filter(k => !PLACE_P.test(k))].filter(Boolean);
  const same = (a: string, b: string) => !NOT_SAME.some(([x, y]) => (a === x && b === y) || (a === y && b === x)) && keysN(a).some(x => keysN(b).some(y => x.includes(y) || y.includes(x) || x.slice(0, 2) === y.slice(0, 2)));
  const pairs = rows.map(r => ({ slug: r[0], keepName: r[1], keep: Number(r[2]), dropName: r[3], drop: Number(r[4]) })).filter(p => same(p.keepName, p.dropName) && p.keep !== p.drop);
  console.log(`\n⑦ 疑似重复 ${rows.length} 组，其中同一家公司重复建档 ${pairs.length} 组要合并`);
  for (const p of pairs) console.log(`   留 #${p.keep} ${p.keepName} ← 并入 #${p.drop} ${p.dropName}`);
  if (APPLY) {
    const CHILD: [string, string][] = [['jobs', 'company_id'], ['job_crawl_logs', 'company_id'], ['company_crawl_logs', 'company_id'], ['url_sources', 'company_id'], ['url_journal', 'company_id'], ['competition_searches', 'company_id'], ['competitions', 'organizer_company_id'], ['demand_signals', 'company_id'],
      ['company_financings', 'company_id'], ['company_news', 'company_id'], ['company_executives', 'company_id'], ['company_products', 'company_id'], ['company_deep_research', 'company_id']];
    let merged = 0;
    for (const p of pairs) {
      const [{ data: keep }, { data: drop }] = await Promise.all([db.from('companies').select('*').eq('id', p.keep).single(), db.from('companies').select('*').eq('id', p.drop).single()]);
      if (!keep || !drop || drop.if_delete) { console.log(`   跳过 #${p.drop}（已删或不存在）`); continue; }
      const moved: string[] = [];
      for (const [t, col] of CHILD) {
        const { data: kids, error } = await db.from(t).select('id').eq(col, p.drop);
        if (error || !kids?.length) continue;
        let n = 0;
        for (const k of kids) {   // 一条条挪：撞唯一键（同一条融资 / 新闻两边都有）就把并入方那条软删 / 丢掉
          const { error: e } = await db.from(t).update({ [col]: p.keep }).eq('id', k.id);
          if (!e) { n++; continue; }
          if (/duplicate|unique/i.test(e.message)) await db.from(t).update({ if_delete: true }).eq('id', k.id).then(() => {}, () => {});
        }
        if (n) moved.push(`${t} ${n}`);
      }
      // 空字段用并入方补；人工锁定的、编号类、审核类不动；名字进别名
      const locked = new Set(keep.human_locked_fields || []);
      const SKIP = new Set(['id', 'name', 'external_id', 'applysquare_id', 'slug', 'flora_id_locked', 'created_at', 'updated_at', 'if_delete', 'human_review_status', 'human_review_at', 'human_locked_fields', 'completeness_score', 'source', 'aliases']);
      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(drop)) {
        if (SKIP.has(k) || locked.has(k) || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
        const cur = (keep as any)[k];
        if (cur === null || cur === '' || (Array.isArray(cur) && !cur.length)) patch[k] = v;
      }
      patch.aliases = Array.from(new Set([...(keep.aliases || []), ...(drop.aliases || []), drop.name, drop.registered_name].filter((x: any) => x && x !== keep.name)));
      const { error: ue } = await db.from('companies').update(patch).eq('id', p.keep);
      if (ue) { console.log(`   ✗ #${p.keep} 补字段：${ue.message}`); continue; }
      await db.from('companies').update({ if_delete: true, aliases: Array.from(new Set([...(drop.aliases || []), `并入#${p.keep}`])) }).eq('id', p.drop);
      merged++;
      console.log(`   ✓ #${p.drop} → #${p.keep}：挪了 ${moved.join('、') || '无子数据'}；补字段 ${Object.keys(patch).length - 1} 个`);
    }
    console.log(`   ✓ 合并 ${merged} 组（并入方已软删，名字记进保留方的别名）`);
  }
}
