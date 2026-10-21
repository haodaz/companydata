/**
 * 本机 Chrome 渲染：Jina 被限流（免 key 按 IP 限速，429）或拿不到时的退路。
 * 只在本地跑（Vercel 上没有浏览器，自动跳过）；LOCAL_RENDER=0 可关。
 * 2026-10-18 批量补岗位时 Jina 一直 429，十分钟才跑 3 家，加上这条退路。
 */
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const localRenderAvailable = () => process.env.LOCAL_RENDER !== '0' && !process.env.VERCEL && fs.existsSync(CHROME);

/**
 * 读页面：正文、链接、大图。
 * 「了解详情 / Learn more」这类链接文字看不出是哪个产品：往上找卡片里的标题当链接文字（科研产品库 10-21，聚光的列表页全是「了解详情」）
 * 大图 ≥ 200px、去掉 logo / 图标：产品图要用（仪器图片很重要——用户 10-21）
 */
const PAGE_SCRIPT = `(() => {
  var GENERIC = /^(了解详情|查看详情|详情|了解更多|查看更多|更多|more|learn more|read more|view details?|details?|>+|→)$/i;
  var clean = function (x) { return (x || '').replace(/\\s+/g, ' ').trim(); };
  var labelOf = function (a) {
    var t = clean(a.textContent);
    if (t && !GENERIC.test(t)) return t;
    var e = a;
    for (var i = 0; i < 5 && e; i++, e = e.parentElement) {
      var h = e.querySelector('h1,h2,h3,h4,h5,strong,[class*=title],[class*=name]');
      var ht = clean(h && h.textContent);
      if (ht && !GENERIC.test(ht)) return ht;
    }
    return a.getAttribute('title') || t;
  };
  var links = Array.prototype.slice.call(document.querySelectorAll('a[href]')).map(function (a) { return { t: labelOf(a).slice(0, 80), h: a.href }; }).filter(function (l) { return /^https?:/.test(l.h) && l.t; });
  var images = Array.prototype.slice.call(document.querySelectorAll('img')).map(function (i) { return { alt: (i.alt || i.title || '').trim().slice(0, 80), src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight }; })
    .filter(function (i) { return /^https?:/.test(i.src) && i.w >= 200 && i.h >= 150 && !/logo|icon|ewm|qrcode|banner|sprite/i.test(i.src); });
  return { title: document.title, text: (document.body && document.body.innerText) || '', links: links, images: images, finalUrl: location.href };
})()`;

let browserP: Promise<any> | null = null;
let open = 0;
const MAX_TABS = Number(process.env.LOCAL_RENDER_TABS || 6);
const waiters: (() => void)[] = [];

async function browser() {
  if (!browserP) {
    browserP = import('puppeteer-core').then(m => (m.default || m).launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=zh-CN', '--disable-dev-shm-usage'] }))
      .then(b => { b.on('disconnected', () => { browserP = null; }); return b; })
      .catch(e => { browserP = null; throw e; });
  }
  return browserP;
}

/**
 * 打开页面、等渲染、往下滚两屏，返回「正文 + 页面链接」拼成的 Markdown；打不开 / 4xx 返回 null。
 * expand：页签 / 折叠按钮的文字（正则源码），先点开再读——产品页的「技术参数」「资料下载」常藏在页签里（科研产品库 10-21）
 */
export async function renderMarkdown(url: string, opts: { expand?: string } = {}): Promise<string | null> {
  if (!localRenderAvailable()) return null;
  if (open >= MAX_TABS) await new Promise<void>(r => waiters.push(r));
  open++;
  let page: any = null;
  try {
    page = await (await browser()).newPage();
    await page.setViewport({ width: 1366, height: 900 });
    let status = 0;
    try { const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }); status = res?.status() || 0; }
    catch { /* 超时也读一下已经渲染出来的部分 */ }
    if (status >= 400) return null;
    await new Promise(r => setTimeout(r, 1500));
    for (let i = 0; i < 3; i++) { await page.evaluate(() => window.scrollBy(0, window.innerHeight)).catch(() => {}); await new Promise(r => setTimeout(r, 500)); }
    let hidden = '';
    if (opts.expand) {
      // 依次点开匹配的页签，每点一个把新露出来的文字记下来（页签切换后上一个会被藏起来）
      const n = await page.evaluate((src: string) => {
        const re = new RegExp(src, 'i');
        const els = [...document.querySelectorAll('button, [role=tab], a, li, span, div, h2, h3, summary')]
          .filter(e => { const t = (e.textContent || '').trim(); return t.length <= 24 && re.test(t) && (e as HTMLElement).offsetParent !== null; });
        (window as any).__expand = els.slice(0, 8);
        return (window as any).__expand.length;
      }, opts.expand).catch(() => 0);
      for (let i = 0; i < n; i++) {
        await page.evaluate((k: number) => { const e = (window as any).__expand[k]; const a = e?.closest('a'); if (a && /^https?:/.test(a.href) && !a.href.includes('#')) return; e?.click(); }, i).catch(() => {});
        await new Promise(r => setTimeout(r, 900));
        hidden += '\n' + (await page.evaluate(() => document.body?.innerText || '').catch(() => ''));
      }
    }
    // 页面里跑的脚本用字符串传：tsx 会给具名函数包一层 __name()，传函数进页面会报「__name is not defined」，整页拿不到（10-21 聚光 0 个产品就是这个）
    const { title, text, links, images, finalUrl } = await page.evaluate(PAGE_SCRIPT);
    if (text.trim().length < 50) return null;
    const uniq = [...new Map(links.map((l: any) => [l.h, l])).values()].slice(0, 400) as { t: string; h: string }[];
    // 点开页签后新露出来的行补在正文后面（去掉和正文重复的行）
    const seenLines = new Set(text.split('\n').map((l: string) => l.trim()));
    const extra = [...new Set(hidden.split('\n').map(l => l.trim()).filter(l => l && !seenLines.has(l)))].join('\n');
    return `Title: ${title}\nURL Source: ${finalUrl}\n\nMarkdown Content:\n${(text + (extra ? `\n\n## 页签里的内容\n${extra}` : '')).slice(0, 120000)}\n\n## 页面链接\n${uniq.map(l => `[${l.t.replace(/[\[\]]/g, '')}](${l.h})`).join('\n')}\n${images.length ? `\n## 页面图片\n${[...new Map(images.map((i: any) => [i.src, i])).values()].slice(0, 40).map((i: any) => `![${i.alt.replace(/[\[\]]/g, '')}](${i.src}) ${i.w}x${i.h}`).join('\n')}\n` : ''}`;
  } catch (e: any) {
    console.warn(`[local-render] ${url.slice(0, 80)}：${String(e?.message || e).slice(0, 100)}`);
    return null;
  } finally {
    await page?.close().catch(() => {});
    open--;
    waiters.shift()?.();
  }
}
