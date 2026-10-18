/**
 * 本机 Chrome 渲染：Jina 被限流（免 key 按 IP 限速，429）或拿不到时的退路。
 * 只在本地跑（Vercel 上没有浏览器，自动跳过）；LOCAL_RENDER=0 可关。
 * 2026-10-18 批量补岗位时 Jina 一直 429，十分钟才跑 3 家，加上这条退路。
 */
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const localRenderAvailable = () => process.env.LOCAL_RENDER !== '0' && !process.env.VERCEL && fs.existsSync(CHROME);

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

/** 打开页面、等渲染、往下滚两屏，返回「正文 + 页面链接」拼成的 Markdown；打不开 / 4xx 返回 null */
export async function renderMarkdown(url: string): Promise<string | null> {
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
    const { title, text, links, finalUrl } = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText || '',
      links: [...document.querySelectorAll('a[href]')].map(a => ({ t: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80), h: (a as HTMLAnchorElement).href })).filter(l => /^https?:/.test(l.h) && l.t),
      finalUrl: location.href,
    }));
    if (text.trim().length < 50) return null;
    const uniq = [...new Map(links.map((l: any) => [l.h, l])).values()].slice(0, 400) as { t: string; h: string }[];
    return `Title: ${title}\nURL Source: ${finalUrl}\n\nMarkdown Content:\n${text.slice(0, 120000)}\n\n## 页面链接\n${uniq.map(l => `[${l.t.replace(/[\[\]]/g, '')}](${l.h})`).join('\n')}\n`;
  } catch (e: any) {
    console.warn(`[local-render] ${url.slice(0, 80)}：${String(e?.message || e).slice(0, 100)}`);
    return null;
  } finally {
    await page?.close().catch(() => {});
    open--;
    waiters.shift()?.();
  }
}
