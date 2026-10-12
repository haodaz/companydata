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
    const r = await fetch('https://r.jina.ai/', { method: 'POST', headers, body: JSON.stringify({ url }), signal: AbortSignal.timeout(40000) });
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
