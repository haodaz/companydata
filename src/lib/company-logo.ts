/**
 * 企业 logo 链接（companies.logo_url）：从官网首页 HTML 里找 logo 图片的绝对地址。
 * 数据部门 2026-10-11 反馈要的是「logo 的链接」，所以只记地址、不转存图片。
 *
 * 优先级：JSON-LD 的 Organization.logo → 页面里 src / class / alt / id 带 logo 的 <img>（页头的优先）
 *        → og:logo / itemprop=logo → apple-touch-icon → 普通 icon → /favicon.ico（实际能打开才算）。
 * 直连抓不到（JS 渲染、被墙）时退到 Jina 取渲染后的 HTML。
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function directHtml(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const html = await r.text();
    return html.length > 200 ? { html, url: r.url || url } : null;
  } catch { return null; }
}

async function jinaHtml(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Return-Format': 'html', 'X-Timeout': '25' };
    if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
    let r = await fetch('https://r.jina.ai/', { method: 'POST', headers, body: JSON.stringify({ url }), signal: AbortSignal.timeout(40000) });
    // 付费额度用完（402）就走免费额度再试一次
    if (r.status === 402 && headers.Authorization) { delete headers.Authorization; r = await fetch('https://r.jina.ai/', { method: 'POST', headers, body: JSON.stringify({ url }), signal: AbortSignal.timeout(40000) }); }
    if (!r.ok) return null;
    const html = await r.text();
    return html.length > 200 ? { html, url } : null;
  } catch { return null; }
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(v => v != null)?.trim() || '';

function abs(src: string, base: string): string | null {
  if (!src || src.startsWith('data:')) return null;
  try { const u = new URL(src.replace(/&amp;/g, '&'), base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}

/** 从 HTML 里挑候选，按优先级排好；strong = JSON-LD / 页面 logo 图 / meta 的个数，其后是站点图标 */
export function logoCandidates(html: string, base: string): { list: string[]; strong: number } {
  const out: string[] = [];
  const push = (s: string | null) => { if (s && !out.includes(s)) out.push(s); };

  // 1. JSON-LD
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const hit = m[1].match(/"logo"\s*:\s*(?:"([^"]+)"|\{[^}]*?"url"\s*:\s*"([^"]+)")/);
    if (hit) push(abs(hit[1] || hit[2], base));
  }
  // 2. 带 logo 字样的 <img>：页头里的排前面；排除合作伙伴 / 客户 / 友情链接墙
  const header = html.match(/<header[\s\S]*?<\/header>/i)?.[0] || html.slice(0, Math.min(html.length, 40000));
  const imgs = (scope: string) => Array.from(scope.matchAll(/<img\b[^>]*>/gi)).map(m => m[0]);
  for (const scope of [header, html]) {
    for (const tag of imgs(scope)) {
      const src = attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'data-original');
      const hay = `${src} ${attr(tag, 'class')} ${attr(tag, 'alt')} ${attr(tag, 'id')}`;
      if (!/logo/i.test(hay) || /partner|client|customer|friend|footer-?logo|other-logo|share|qr|wechat|wechart|weixin|weibo|sina|facebook|twitter|linkedin|youtube|douyin|tiktok|gongan|beian|icp/i.test(hay)) continue;
      push(abs(src, base));
    }
  }
  // <a class="logo"><img></a> 这类：logo 写在外层
  for (const m of header.matchAll(/<(?:a|div|h1|span)\b[^>]*(?:class|id)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>([\s\S]{0,600}?)<\/(?:a|div|h1|span)>/gi)) {
    const img = m[1].match(/<img\b[^>]*>/i)?.[0];
    if (img) push(abs(attr(img, 'src') || attr(img, 'data-src'), base));
  }
  // 3. meta
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (/(property|name|itemprop)\s*=\s*["'](og:logo|logo)["']/i.test(tag)) push(abs(attr(tag, 'content'), base));
  }
  const strong = out.length;
  // 4. link icon：apple-touch-icon（大图）先于普通 icon
  const links = (html.match(/<link\b[^>]*>/gi) || []).filter(t => /rel\s*=\s*["'][^"']*icon/i.test(t));
  for (const t of links.filter(t => /apple-touch-icon/i.test(t))) push(abs(attr(t, 'href'), base));
  for (const t of links.filter(t => !/apple-touch-icon|mask-icon/i.test(t))) push(abs(attr(t, 'href'), base));
  return { list: out, strong };
}

/** 图片地址能打开、而且确实是图片 */
async function isImage(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const ct = r.headers.get('content-type') || '';
    return r.ok && (/^image\//i.test(ct) || (/octet-stream/i.test(ct) && /\.(png|jpe?g|svg|gif|webp|ico)(\?|$)/i.test(url)));
  } catch { return false; }
}

/** 官网 → logo 地址；找不到返回 null */
export async function findLogoUrl(website: string | null | undefined): Promise<string | null> {
  if (!website || !/^https?:\/\//i.test(website)) return null;
  // 直连只拿到站点图标（logo 是 JS 渲染出来的）时，再用 Jina 渲染一遍找真正的 logo 图
  const direct = await directHtml(website);
  let found = direct ? logoCandidates(direct.html, direct.url) : { list: [] as string[], strong: 0 };
  if (!found.strong) {
    const rendered = await jinaHtml(website);
    const r = rendered ? logoCandidates(rendered.html, rendered.url) : null;
    if (r && (r.strong || !found.list.length)) found = r;
  }
  // 前三个候选里第一个能打开的；都打不开（防盗链 / 墙）也照样记第一个，地址本身是对的
  for (const c of found.list.slice(0, 3)) if (await isImage(c)) return c;
  if (found.list.length) return found.list[0];
  const fav = abs('/favicon.ico', website);
  return fav && (await isImage(fav)) ? fav : null;
}

// ────────────────────────────────────────────
// 官网找不到 / 只拿到站点图标时的兜底来源（数据部门 10-11：中国企业先看百科，海外企业看维基）
// ────────────────────────────────────────────

export const isFaviconOnly = (u: string | null | undefined) => !!u && /favicon|\.ico(\?|$)/i.test(u);

/** 招聘站（moka / 北森 / hotjob 页头一般挂公司 logo）：只认页面里明确的 logo 图，不要站点图标（那是招聘平台自己的） */
export async function careersLogo(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const page = (await directHtml(url)) || (await jinaHtml(url));
  if (!page) return null;
  const { list, strong } = logoCandidates(page.html, page.url);
  return list.slice(0, Math.min(strong, 3)).find(Boolean) || null;
}

const norm = (s: string) => s.replace(/[（(].*?[)）]|股份|有限|责任|公司|集团|控股|科技|技术|中国|\s/g, '');

/**
 * 百度百科词条卡片接口（公开 API，不过网页的安全验证）：词条标题要和企业名对得上，描述得像企业。
 * 返回词条标题（企业词条的标题就是工商全称，如「立讯精密」→「立讯精密工业股份有限公司」）、概述图、描述。
 */
export async function baikeCard(names: (string | null | undefined)[]): Promise<{ title: string; image: string | null; desc: string; key: string } | null> {
  for (const key of Array.from(new Set(names.filter((n): n is string => !!n && /[\u4e00-\u9fa5]/.test(n))))) {
    try {
      const r = await fetch(`https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_length=80&bk_key=${encodeURIComponent(key)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      const d: any = await r.json().catch(() => null);
      if (!d?.title) continue;
      const a = norm(d.title), b = norm(key);
      if (!a || !b || !(a.includes(b) || b.includes(a))) continue;
      if (d.desc && /(人物|演员|歌手|作家|电影|电视剧|小说|游戏|歌曲|地名|城市|河流)/.test(d.desc) && !/(公司|企业|集团|品牌)/.test(d.desc)) continue;
      return { title: String(d.title), image: d.image ? String(d.image) : null, desc: String(d.desc || ''), key };
    } catch { /* 下一个名字 */ }
  }
  return null;
}

export async function baikeLogo(names: (string | null | undefined)[]): Promise<string | null> {
  return (await baikeCard(names))?.image || null;
}

const WD_UA = { 'User-Agent': 'companydata-logo/1.0 (company logo lookup)' };
const rootOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').split('.').slice(-2).join('.'); } catch { return ''; } };

/** 维基数据 P154（logo 图片）→ 维基共享资源的文件地址。官网（P856）对得上的条目优先；没官网可比时要求条目名 / 别名和企业名一致、描述像企业（防「诺和诺德基金会」这类同名机构） */
export async function wikidataLogo(name: string | null | undefined, website?: string | null): Promise<string | null> {
  if (!name) return null;
  try {
    const s: any = await (await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=5&search=${encodeURIComponent(name)}`, { headers: WD_UA, signal: AbortSignal.timeout(15000) })).json();
    const ids: string[] = (s?.search || []).map((x: any) => x.id).slice(0, 5);
    if (!ids.length) return null;
    const e: any = await (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|descriptions|labels|aliases&languages=en&ids=${ids.join('|')}`, { headers: WD_UA, signal: AbortSignal.timeout(15000) })).json();
    const want = website ? rootOf(website) : '';
    let fallback: string | null = null;
    for (const id of ids) {
      const ent = e?.entities?.[id];
      const file = ent?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
      if (!file) continue;
      const fileUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(file).replace(/ /g, '_'))}`;
      const sites: string[] = (ent.claims.P856 || []).map((c: any) => c?.mainsnak?.datavalue?.value).filter(Boolean);
      if (want && sites.some(u => rootOf(u) === want)) return fileUrl;
      const desc = ent?.descriptions?.en?.value || '';
      const key = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|ag|sa|se|nv|gmbh|group|holdings?)$/g, '');
      const labels = [ent?.labels?.en?.value, ...(ent?.aliases?.en || []).map((a: any) => a?.value)].filter(Boolean).map(key);
      if (!fallback && (!want || !sites.length) && labels.includes(key(name)) && /(company|corporation|manufacturer|conglomerate|enterprise|business|bank|group|firm|maker|retailer|brand)/i.test(desc)) fallback = fileUrl;
    }
    return fallback;
  } catch { return null; }
}

/** 让 Gemini 看一眼：这张图是不是这家企业的 logo（百科给小公司自动生成的「公司名 + 楼房插画」卡片、招聘平台自己的 logo 都要排除） */
export async function looksLikeLogo(url: string, company: string): Promise<boolean> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return false;
    const ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const buf = Buffer.from(await r.arrayBuffer());
    if (ct.includes('svg') || /\.svg(\?|$)/i.test(r.url)) return buf.length > 200;   // 矢量图基本都是正式 logo，模型也看不了
    const mime = /^image\/(png|jpeg|webp|heic|heif)$/.test(ct) ? ct : buf.subarray(0, 4).toString('hex') === '89504e47' ? 'image/png' : buf.subarray(0, 2).toString('hex') === 'ffd8' ? 'image/jpeg' : '';
    if (!mime || buf.length < 300) return false;
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '').getGenerativeModel({ model: 'gemini-3.8-flash', generationConfig: { responseMimeType: 'application/json' } });
    const res = await model.generateContent([
      { inlineData: { mimeType: mime, data: buf.toString('base64') } },
      `Is this image the brand logo (logo mark and/or wordmark) of the company "${company}"? Answer false for: auto-generated placeholder cards that just print the company name over a generic illustration, photos of buildings / people / products, logos of a different company or of a recruiting platform. Return JSON {"logo": true|false}.`,
    ]);
    const u = res.response.usageMetadata;
    const { logTokenUsage } = await import('@/lib/token-logger');
    await logTokenUsage({ tool_name: 'company-profile', task_name: 'Logo 识图', institution: company, model_id: 'gemini-3.8-flash', usageMetadata: { promptTokenCount: u?.promptTokenCount || 0, candidatesTokenCount: u?.candidatesTokenCount || 0, totalTokenCount: u?.totalTokenCount || 0 } }).catch(() => {});
    return /"logo"\s*:\s*true/.test(res.response.text());
  } catch { return false; }
}

/** 兜底找 logo：中国企业 百科 → 招聘站 → 维基；海外企业 维基 → 招聘站 → 百科。每个候选过一遍 looksLikeLogo */
export async function findLogoFallback(c: { name: string; name_en?: string | null; brief_name?: string | null; segment?: string | null; official_website?: string | null; campus_url?: string | null; careers_url?: string | null }): Promise<{ url: string; source: string } | null> {
  const overseas = c.segment === 'overseas_top' || !/[一-龥]/.test(c.name);
  const baike = async () => baikeLogo([c.name, c.brief_name]);
  const wiki = async () => wikidataLogo(c.name_en || (overseas ? c.name : null), c.official_website);
  const careers = async () => (await careersLogo(c.campus_url)) || (await careersLogo(c.careers_url));
  const order: [string, () => Promise<string | null>][] = overseas
    ? [['wikidata', wiki], ['careers', careers], ['baike', baike]]
    : [['baike', baike], ['careers', careers], ['wikidata', wiki]];
  const label = [c.name, c.name_en].filter(Boolean).join(' / ');
  for (const [source, get] of order) {
    const u = await get().catch(() => null);
    if (u && (await looksLikeLogo(u, label))) return { url: u, source };
  }
  return null;
}
