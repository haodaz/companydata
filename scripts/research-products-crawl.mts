/**
 * 从厂商官网抓科研产品 / 服务 + 产品资料（产品手册、规格书、操作手册…）→ research_products / research_product_docs。
 * 用户 10-21：这部分数据服务于仪器设备服务的评价 + 资源推荐平台；手册 / 规格参数 / 操作手册有的一定带回来（百业虚拟工位要用）。
 *   1. 打开官网首页，模型从链接里挑产品 / 服务页（详情页优先，没有就挑分类页再往下找一层）
 *   2. 每个页面：只按原文抽产品（名称要在页面里找得到，规格参数照抄，不编），连同页面上的资料链接
 *   3. 资料：下载（≤ 30MB）存进存储桶 research-docs，PDF 用 PDFKit 抽全文；下载不了的只记链接
 *   4. 标签用数据部门给的 prompt；简介存不含图视频的 html；external_id 按类型加前缀（kyyq_ / kyhc_ / kysj_ / kyfw_）
 *   npx tsx scripts/research-products-crawl.mts --model qwen-plus (--ids 1,2,3 | --sample 12) [--per 8] [--par 2] [--dry]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { fetchJinaUrl } = await import('@/lib/agents/fetcher');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');
const { INSTRUMENT_CATEGORIES, isDomesticCountry } = await import('@/lib/instrument-categories');
const { PRODUCT_KINDS, kindOf, productExternalId, plainHtml, labelPrompt, cleanLabels, DOC_TYPES } = await import('@/lib/research-products');
const { kwText } = await import('@/lib/entity-ids');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const PER = Number(opt('per', '8')), PAR = Number(opt('par', '2')), DRY = process.argv.includes('--dry');
const MAX_DOC = 30 * 1024 * 1024;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-'));
const CAT_KEYS = INSTRUMENT_CATEGORIES.map(c => c.key);
const log = (task: string, inst: string, r: any) => logTokenUsage({ tool_name: 'company-pipeline', task_name: task, institution: inst, model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});

// 厂商
let q = db.from('companies').select('id, name, name_en, country, official_website, supplier_categories').not('supplier_categories', 'eq', '{}').not('official_website', 'is', null).not('if_delete', 'is', true);
if (opt('ids')) q = q.in('id', opt('ids').split(',').map(Number));
const { data: sups } = await q.order('id');
let suppliers = (sups || []) as any[];
if (!opt('ids')) {
  // 样本：每类挑一家、国内海外交替，凑够 --sample 家
  const n = Number(opt('sample', '12')), picked: any[] = [];
  for (const c of CAT_KEYS) {
    const pool = suppliers.filter(s => s.supplier_categories.includes(c) && !picked.includes(s));
    const want = picked.filter(isDom).length <= picked.length / 2;
    const s = pool.find(x => isDom(x) === want) || pool[0];
    if (s) picked.push(s);
    if (picked.length >= n) break;
  }
  suppliers = picked;
}
function isDom(s: any) { return isDomesticCountry(s.country); }
console.log(`抓 ${suppliers.length} 家厂商的产品（每家最多 ${PER} 个），模型 ${MODEL}${DRY ? '（试跑不写库）' : ''}`);

const linksOf = (md: string, base: string) => {
  const out: { text: string; url: string }[] = [];
  for (const m of md.matchAll(/\[([^\]]{0,120})\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) {
    try { out.push({ text: m[1].replace(/!\[[^\]]*\]/g, '').trim(), url: new URL(m[2], base).href }); } catch {}
  }
  return [...new Map(out.map(l => [l.url, l])).values()];
};
const sameSite = (u: string, base: string) => { try { const a = new URL(u).hostname.replace(/^www\./, ''), b = new URL(base).hostname.replace(/^www\./, ''); return a === b || a.endsWith('.' + b) || b.endsWith('.' + a); } catch { return false; } };
const IMG_RE = /\.(jpe?g|png|gif|webp|svg|bmp|ico|mp4|mov|webm)(\?|$)/i;   // 图片 / 视频不是资料
const DOC_RE = /\.pdf(\?|$)|\.docx?(\?|$)|手册|说明书|规格书|彩页|样本|datasheet|data sheet|brochure|manual|catalog|catalogue|spec sheet|技术参数|下载|download|SDS|MSDS|COA|application note|应用(文献|报告|笔记)/i;

async function pickPages(s: any, md: string) {
  const links = linksOf(md, s.official_website).filter(l => sameSite(l.url, s.official_website)).slice(0, 400);
  if (!links.length) return [];
  const r = await generateContent(`下面是「${s.name}」官网首页上的链接。挑出最可能是「具体产品 / 服务详情页」的链接（科研仪器、试剂耗材、检测 / 维修 / 校准 / 定制等服务），最多 ${PER} 个；首页上没有详情页时，挑产品 / 服务分类页（最多 3 个）。
不要新闻、招聘、关于我们、联系方式、登录、商城首页。
${links.map((l, i) => `${i}. ${l.text || '(无文字)'} ${l.url}`).join('\n')}
只返回 JSON：{"detail":[序号],"category":[序号]}`, MODEL, { jsonMode: true, temperature: 0 });
  await log('Research Product Pick Pages', s.name, r);
  const v = parseJsonLoose(r.text) || {};
  const at = (a: any) => ((a || []) as any[]).map(Number).filter(i => links[i]).map(i => links[i].url);
  return [...at(v.detail).map(u => ({ url: u, kind: 'detail' })), ...at(v.category).slice(0, 3).map(u => ({ url: u, kind: 'category' }))];
}

async function extract(s: any, url: string, md: string, isCategory = false) {
  const docLinks = linksOf(md, url).filter(l => !IMG_RE.test(l.url) && DOC_RE.test(`${l.text} ${l.url}`)).slice(0, 40);
  const r = await generateContent(`从「${s.name}」官网的这个页面里抽取科研产品 / 服务。只用页面原文，不要补充页面上没有的信息；没有的字段留空。
页面：${url}
${md.slice(0, 14000)}

每个产品 / 服务：
- name 名称（页面原文）、brand 品牌、model_no 型号、specification 规格（如 100mL、10 万转、500 样本 / 天，原文写法）、price 价格（原文写法，没写就空）
- kind：instrument 仪器设备 | consumable 耗材 | reagent 试剂 | service 服务（检测、维修、校准、定制合成、平台机时等）
- category：从这些 key 里选一个最贴切的：${INSTRUMENT_CATEGORIES.map(c => `${c.key}=${c.name}`).join('，')}
- intro 产品介绍（原文要点，可分段，不超过 600 字）
- specs 规格参数（参数名 → 值，照抄页面上的参数表，没有就 {}）
- disciplines 适用学科（2–5 个，如 化学；材料；生命科学）、applications 应用场景（2–5 个，原文提到的）
- service_mode / service_region：只有服务填（送样检测 / 上门 / 远程 / 驻场 / 平台机时；服务地区）
- docs：这个产品的资料链接，只从下面的资料链接里选（产品手册 brochure / 规格书 datasheet / 操作手册 manual / 应用文献 app_note / 安全数据表 sds / 质检报告 coa / 其他 other）
页面上的资料链接：
${docLinks.map((l, i) => `${i}. ${l.text || '(无文字)'} ${l.url}`).join('\n') || '（无）'}

page_type：这个页面是单个产品 / 服务的详情页（detail），还是列了多个产品 / 大类的总览、分类、列表页（list）${isCategory ? '（这页是从分类入口进来的，多半是 list）' : ''}。
- list 页：products 只放页面上写明了具体型号或货号的产品（只是产品大类名，如「液相色谱仪」，不要放），并把指向具体产品 / 服务详情页的链接放进 more（最多 ${PER} 个网址）。
- 每个产品的 specs / intro / docs 只放属于它自己的，不要把页面通用内容复制给每个产品。
只返回 JSON：{"page_type":"detail","products":[{"name":"","brand":"","model_no":"","specification":"","price":"","kind":"instrument","category":"","intro":"","specs":{},"disciplines":"","applications":"","service_mode":"","service_region":"","docs":[{"i":0,"doc_type":"manual","title":""}]}],"more":[""]}`, MODEL, { jsonMode: true, temperature: 0 });
  await log('Research Product Extract', s.name, r);
  const v = parseJsonLoose(r.text) || {};
  const page = md.replace(/\s+/g, '').toLowerCase();
  const products = ((v.products || []) as any[]).filter(p => p?.name && page.includes(String(p.name).replace(/\s+/g, '').toLowerCase().slice(0, 12)))   // 名称要在页面里找得到
    .map(p => ({ ...p, docs: ((p.docs || []) as any[]).filter(d => docLinks[Number(d.i)]).map(d => ({ ...d, url: docLinks[Number(d.i)].url, title: d.title || docLinks[Number(d.i)].text })) }));
  return { page_type: v.page_type === 'list' ? 'list' : 'detail', products, more: ((v.more || []) as string[]).filter(u => typeof u === 'string' && /^https?:/.test(u) && sameSite(u, s.official_website)) };
}

async function fetchDoc(s: any, extId: string, d: any) {
  const out: any = { doc_type: DOC_TYPES.some(t => t.key === d.doc_type) ? d.doc_type : 'other', title: String(d.title || '').slice(0, 200) || null, url: d.url, fetched_at: new Date().toISOString() };
  try {
    const res = await fetch(d.url, { redirect: 'follow', signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36' } });
    const ct = res.headers.get('content-type') || '';
    const len = Number(res.headers.get('content-length') || 0);
    if (!res.ok || len > MAX_DOC) return { ...out, file_type: len > MAX_DOC ? 'pdf' : null, size_bytes: len || null };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOC) return { ...out, size_bytes: buf.length };
    const isPdf = /pdf/i.test(ct) || buf.subarray(0, 5).toString() === '%PDF-';
    const isHtml = /html/i.test(ct);
    out.file_type = isPdf ? 'pdf' : isHtml ? 'html' : (d.url.match(/\.(\w{2,5})(\?|$)/)?.[1] || 'bin').toLowerCase();
    out.size_bytes = buf.length;
    if (isHtml) { out.text_content = ((await fetchJinaUrl(d.url)) || '').slice(0, 200_000) || null; return out; }   // 网页资料不存文件，存正文
    if (isPdf) {
      const f = path.join(TMP, `${crypto.randomUUID()}.pdf`);
      fs.writeFileSync(f, buf);
      try {
        const txt = execFileSync('swift', ['scripts/tools/pdf2txt.swift', f, '300'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
        const [first, ...rest] = txt.split('\n');
        out.pages = Number(first) || null;
        out.text_content = rest.join('\n').replace(/\u0000/g, '').trim().slice(0, 500_000) || null;
        out.lang = /[一-鿿]/.test(out.text_content?.slice(0, 3000) || '') ? 'zh' : 'en';
      } catch {}
      fs.unlinkSync(f);
    }
    if (!DRY) {
      const key = `${s.id}/${extId}/${crypto.createHash('md5').update(d.url).digest('hex').slice(0, 12)}.${out.file_type}`;
      const { error } = await db.storage.from('research-docs').upload(key, buf, { contentType: isPdf ? 'application/pdf' : ct || 'application/octet-stream', upsert: true });
      if (!error) out.storage_path = key;
    }
  } catch {}
  return out;
}

/** 品牌 / 公司名不当标签（如「聚光科技」「阿拉丁正品」） */
const dropBrandLabels = (l: string | null, names: any[]) => {
  if (!l) return l;
  const cores = names.filter(Boolean).map(n => String(n).replace(/[（(][^）)]*[）)]|股份有限公司|有限公司|公司|集团|科技|生化|企业管理|中国|上海|北京|\s/g, '').toLowerCase()).filter(c => c.length >= 2);
  const a = l.split('；').filter(x => !cores.some(c => x.toLowerCase().includes(c.slice(0, 3))) && !/正品|原装/.test(x));
  return a.length ? a.join('；') : null;
};
const norm = (x: any) => String(x || '').replace(/\s+/g, '').toLowerCase();
const total = { products: 0, docs: 0, stored: 0, pages: 0 };
const report: any[] = [];
let nx = 0;
await Promise.all(Array.from({ length: PAR }, async () => {
  while (nx < suppliers.length) {
    const s = suppliers[nx++];
    const got: any[] = [];
    try {
      const home = (await fetchJinaUrl(s.official_website)) || '';
      const queue = home.length > 200 ? await pickPages(s, home) : [];
      const seen = new Set<string>();
      while (queue.length && got.length < PER && seen.size < PER + 6) {
        const pg = queue.shift()!;
        if (seen.has(pg.url)) continue;
        seen.add(pg.url);
        const md = (await fetchJinaUrl(pg.url)) || '';
        total.pages++;
        if (md.length < 300) continue;
        const isCat = pg.kind === 'category';
        const { page_type, products: ps, more } = await extract(s, pg.url, md, isCat);
        // 列表 / 总览页（模型判的，或者一页抽出 3 个以上）只收写明型号 / 货号的、且不带页面通用的参数；大类名留给下一层详情页
        const listy = isCat || page_type === 'list' || ps.length >= 3;
        const products = listy ? ps.filter((p: any) => p.model_no && String(p.model_no).trim()).map((p: any) => ({ ...p, specs: {} })) : ps;
        for (const p of products) if (got.length < PER && !got.some(g => norm(g.name) === norm(p.name) && norm(g.model_no) === norm(p.model_no))) got.push({ ...p, source_url: pg.url });
        if (listy) for (const u of more.slice(0, PER)) queue.unshift({ url: u, kind: 'detail' });
      }
    } catch (e: any) { console.log(`\n✗ ${s.name}：${String(e?.message || e).slice(0, 80)}`); }

    for (const p of got) {
      const kind = kindOf(p.kind) ? p.kind : 'instrument';
      const k = kindOf(kind)!;
      const intro = String(p.intro || '').trim();
      const lr = await generateContent(labelPrompt({ name: p.name, brand: p.brand, specification: p.specification || p.model_no, company: s.name, type: k.name, intro }), MODEL, { temperature: 0 }).catch(() => null);
      if (lr) await log('Research Product Labels', s.name, lr);
      const row: any = {
        name: String(p.name).slice(0, 300), brand: p.brand || null, model_no: p.model_no || null, specification: p.specification || null, price: p.price || null,
        description: plainHtml(intro), labels: lr ? dropBrandLabels(cleanLabels(lr.text), [s.name, s.name_en, p.brand]) : null, status: 'onShelf', supplier_id: s.id, type: k.type, kind,
        category: CAT_KEYS.includes(p.category) ? p.category : (s.supplier_categories[0] || null),
        specs: p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs) ? p.specs : {},
        disciplines: kwText(p.disciplines), applications: kwText(p.applications),
        service_mode: kind === 'service' ? p.service_mode || null : null, service_region: kind === 'service' ? p.service_region || null : null,
        brand_origin: isDom(s) ? 'domestic' : 'imported', source_url: p.source_url, ai_sources: { product_page: p.source_url, model: MODEL, at: new Date().toISOString() },
        dedupe_key: `${s.id}|${norm(p.name)}|${norm(p.model_no || p.specification)}`, human_review_status: 'review',
      };
      let id: number | null = null, extId = '';
      if (!DRY) {
        const { data: old } = await db.from('research_products').select('id, external_id').eq('dedupe_key', row.dedupe_key).maybeSingle();
        extId = old?.external_id || productExternalId(kind as any);
        const { data: saved, error } = old
          ? await db.from('research_products').update({ ...row, updated_at: new Date().toISOString() }).eq('id', old.id).select('id').single()
          : await db.from('research_products').insert({ ...row, external_id: extId }).select('id').single();
        if (error) { console.log(`\n  写不进 ${p.name}：${error.message}`); continue; }
        id = saved.id;
      }
      total.products++;
      const docs: any[] = [];
      for (const d of (p.docs || []).slice(0, 6)) {
        const doc = await fetchDoc(s, extId || 'dry', d);
        docs.push(doc); total.docs++; if (doc.storage_path) total.stored++;
        if (!DRY && id) await db.from('research_product_docs').upsert({ ...doc, product_id: id, supplier_id: s.id }, { onConflict: 'product_id,url' });
      }
      report.push({ supplier: s.name, name: row.name, kind, category: row.category, labels: row.labels, specs: Object.keys(row.specs).length, price: row.price, docs: docs.map(d => `${d.doc_type}:${d.file_type || '?'}:${d.pages || ''}p:${d.storage_path ? '存' : '链'}`), url: row.source_url });
    }
    console.log(`✓ ${s.name}：${got.length} 个产品，资料 ${got.reduce((n, p) => n + (p.docs?.length || 0), 0)} 份`);
  }
}));
fs.writeFileSync(`reports/research-products-crawl${DRY ? '-dry' : ''}.json`, JSON.stringify({ at: new Date().toISOString(), model: MODEL, total, report }, null, 1));
console.log(`\n完成：${suppliers.length} 家，看了 ${total.pages} 页，产品 ${total.products}，资料 ${total.docs} 份（存档 ${total.stored}）`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(0);
