/**
 * 核心产品从官网抓（数据部门 11-20 赞灵）：官网上提到的相关产品都算，每条带抓取页面的链接；
 * 也可以人工给几个链接（产品中心 / 某个产品页），AI 只读这些页。
 *   自动：读官网首页 → 挑产品中心 / 产品分类 / 产品详情页（最多 12 页）→ 每页抽产品
 *   人工链接：直接读给的页
 * 一律只写官网页上写着的，不推测；来源链接 = 产品自己的详情页（页上有链接时），否则 = 抓到它的那一页。
 */
import { fetchJinaUrl } from '@/lib/agents/fetcher';
import { localRenderAvailable, renderMarkdown } from '@/lib/agents/local-render';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { normalizeProduct } from '@/lib/company-merge';

const MAX_PAGES = 12, MAX_TEXT = 24_000;

/** 先本机 Chrome（能等 JS 渲染），没有再 Jina */
async function readPage(url: string): Promise<string | null> {
  const local = localRenderAvailable() ? await renderMarkdown(url).catch(() => null) : null;
  if (local && local.length > 1500) return local;
  // 单页应用常常还没渲染完（自变量机器人首页本机只拿到 260 字）：再让 Jina 读一遍，取长的
  const jina = await fetchJinaUrl(url).catch(() => null);
  return (jina?.length || 0) > (local?.length || 0) ? jina : local;
}

/** sitemap 里像产品页的链接：首页导航藏在下拉菜单里、读不到链接时靠它（最多 300 条） */
async function sitemapLinks(site: string): Promise<{ text: string; url: string }[]> {
  const get = async (u: string) => { try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36' }, signal: AbortSignal.timeout(15_000) }); return r.ok ? await r.text() : ''; } catch { return ''; } };
  let origin = ''; try { origin = new URL(site).origin; } catch { return []; }
  const maps = [...(await get(`${origin}/robots.txt`)).matchAll(/^sitemap:\s*(\S+)/gim)].map(m => m[1]);
  if (!maps.length) maps.push(`${origin}/sitemap.xml`);
  const locs: string[] = [];
  for (const m of maps.slice(0, 3)) {
    const xml = await get(m), ls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(x => x[1]);
    if (/<sitemapindex/i.test(xml)) for (const sub of ls.sort((a, b) => Number(/product|produkt|chanpin|solution/i.test(b)) - Number(/product|produkt|chanpin|solution/i.test(a))).slice(0, 3)) locs.push(...[...(await get(sub)).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(x => x[1]));
    else locs.push(...ls);
  }
  return locs.filter(u => /product|produkt|chanpin|solution|service|\/p\/|series|model/i.test(u)).slice(0, 300).map(u => ({ text: decodeURIComponent(new URL(u).pathname).slice(0, 80), url: u }));
}

const linksOf = (md: string, base: string) => {
  const out: { text: string; url: string }[] = [];
  for (const m of md.matchAll(/(?<!!)\[([^\]]{0,120})\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)) {
    try { out.push({ text: m[1].replace(/!\[[^\]]*\]/g, '').trim(), url: new URL(m[2], base).href.replace(/#.*$/, '') }); } catch { /* 坏链接跳过 */ }
  }
  return [...new Map(out.map(l => [l.url, l])).values()];
};
const brandOf = (h: string) => h.replace(/^www\d?\./, '').split('.').filter(x => !/^(com|net|org|cn|co|de|jp|uk|eu|us|io|gov|edu|global|en)$/.test(x)).pop() || '';
/** 同一家的站：同域名 / 子域名，或品牌名相同的另一个域名（跳地区站） */
const sameSite = (u: string, base: string) => {
  try {
    const a = new URL(u).hostname.replace(/^www\d?\./, ''), b = new URL(base).hostname.replace(/^www\d?\./, '');
    if (a === b || a.endsWith('.' + b) || b.endsWith('.' + a)) return true;
    const br = brandOf(b);
    return br.length >= 4 && a.split('.').some(x => x.includes(br));
  } catch { return false; }
};

async function pickPages(company: any, home: string, model: string): Promise<string[]> {
  const links = [...new Map([...linksOf(home, company.official_website), ...(await sitemapLinks(company.official_website))].filter(l => sameSite(l.url, company.official_website) && !/\.(png|jpe?g|gif|webp|svg|pdf)(\?|$)/i.test(l.url)).map(l => [l.url, l])).values()].slice(0, 400);
  if (!links.length) return [];
  const r = await generateContent(`下面是「${company.name}」官网首页上的链接。挑出讲这家公司产品的页面：产品中心 / 产品分类 / 产品详情 / 解决方案 / 服务项目，最多 ${MAX_PAGES - 1} 个，产品中心和分类页优先。
不要新闻、招聘、关于我们、联系方式、投资者关系、登录、隐私条款。
${links.map((l, i) => `${i}. ${l.text || '(无文字)'} ${l.url}`).join('\n')}
只返回 JSON：{"pages":[序号]}`, model, { jsonMode: true, temperature: 0 });
  const v = parseJsonLoose(r.text) || {};
  return [...new Set(((v.pages || []) as any[]).map(Number).filter(i => links[i]).map(i => links[i].url))];
}

async function extract(company: any, url: string, md: string, model: string, existing: string[]) {
  const links = linksOf(md, url).filter(l => sameSite(l.url, url)).slice(0, 200);
  const r = await generateContent(`下面是「${company.name}」官网的一个页面（${url}）。列出这一页上提到的、这家公司自己的产品 / 产品线 / 服务 / 解决方案（官网提到的相关产品都算，不要客户、合作伙伴、别家的产品）。
每个产品：
- name：产品名（官网怎么写就怎么写，带型号）
- category：品类（如「工业机器人」「世界统一模型」）
- kind：hardware 硬件 / software 软件或 App / service 服务 / solution 解决方案 / other
- status：active 在售 / discontinued 停产 / unknown
- tech_keywords：页上写到的技术关键词，最多 6 个
- is_flagship：页上明确说是主打 / 旗舰才写 true
- description：一两句话，只用页上的信息
- link：页上这个产品自己的详情页链接序号（下面链接列表里的序号，没有就 null）
页上没写的留空，不推测。不是产品页、一个产品都没有就返回空数组。${existing.length ? `
库里已有这些产品：${existing.join('、')}。页上的产品和其中某个是同一个（只是写法多了少了描述 / 型号前缀），name 就照抄库里那个名字，别另起一条。` : ''}

页面正文：
${md.slice(0, MAX_TEXT)}

链接列表：
${links.map((l, i) => `${i}. ${l.text || '(无文字)'} ${l.url}`).join('\n')}

只返回 JSON：{"products":[{"name":"","category":"","kind":"","status":"","tech_keywords":[],"is_flagship":false,"description":"","link":null}]}`, model, { jsonMode: true, temperature: 0 });
  const v = parseJsonLoose(r.text) || {};
  return ((v.products || []) as any[]).map(p => normalizeProduct({ ...p, source_url: (p.link != null && links[Number(p.link)]?.url) || url })).filter(Boolean) as any[];
}

export interface ProductCrawlResult { pages: { url: string; ok: boolean; products: number }[]; products: any[] }

/** urls 给了就只读这些页；没给就从官网首页挑产品页 */
export async function crawlCompanyProducts(company: any, opts: { urls?: string[]; model: string; existing?: string[] }): Promise<ProductCrawlResult> {
  let pages = (opts.urls || []).map(u => u.trim()).filter(u => /^https?:\/\//.test(u));
  if (!pages.length) {
    if (!company.official_website) throw new Error('这家企业还没有官网，先在档案里填官网，或者直接贴产品页链接');
    const home = await readPage(company.official_website);
    if (!home) throw new Error(`官网打不开：${company.official_website}（可以直接贴产品页链接再抓）`);
    pages = [company.official_website, ...(await pickPages(company, home, opts.model))];
  }
  pages = [...new Set(pages)].slice(0, MAX_PAGES);
  const result: ProductCrawlResult = { pages: [], products: [] };
  const queue = [...pages], seen = new Set(pages);
  let active = 0;
  const stopAt = Date.now() + 200_000;   // 线上接口最多 300 秒：读到 200 秒就不再开新页，已经抓到的照样入库
  await Promise.all([0, 1, 2].map(async () => {
    while (queue.length || active) {
      if (Date.now() > stopAt) { queue.length = 0; if (!active) break; await new Promise(r => setTimeout(r, 300)); continue; }
      if (!queue.length) { await new Promise(r => setTimeout(r, 300)); continue; }   // 别的页还在读，可能会顺出新的详情页
      const url = queue.shift()!; active++;
      try {
        const md = await readPage(url).catch(() => null);
        if (!md) { result.pages.push({ url, ok: false, products: 0 }); continue; }   // finally 里会减 active
        const got = await extract(company, url, md, opts.model, (opts.existing || []).slice(0, 80)).catch(() => []);
        result.pages.push({ url, ok: true, products: got.length });
        result.products.push(...got);
        // 列表页上抽到的产品有自己的详情页：顺着读（首页导航藏在下拉里、挑不出产品页时靠这个），总数不超过上限
        for (const p of got) if (p.source_url !== url && !seen.has(p.source_url) && seen.size < MAX_PAGES + 8) { seen.add(p.source_url); queue.push(p.source_url); }
      } finally { active--; }
    }
  }));
  // 同名合并：留信息多的那条，来源优先产品自己的详情页
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_()（）·]/g, '');
  const by = new Map<string, any>();
  for (const p of result.products) {
    const k = norm(p.name), o = by.get(k);
    if (!o) { by.set(k, p); continue; }
    for (const [f, v] of Object.entries(p)) if ((o[f] == null || o[f] === '' || (Array.isArray(o[f]) && !o[f].length)) && v != null) o[f] = v;
    if (pages.includes(o.source_url) && !pages.includes(p.source_url)) o.source_url = p.source_url;
  }
  result.products = [...by.values()];
  return result;
}
