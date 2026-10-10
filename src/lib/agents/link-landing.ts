/**
 * 链接落地检查（数据部门 2026-10-10）：不渲染，直接请求一次、跟着跳转走，看最后落在哪。
 *   - 跳回网站首页：大疆 careers.dji.com/campus 会 302 到 /zh-CN 首页——填在「校招官网」里等于没填，算失效。
 *   - https 打不开、http 能开：追光动画 https://www.zhuiguang.com 超时，http://zhuiguang.com 正常——换成 http。
 * 连不上（超时、被墙、被拦）不当成失效，交给渲染那一层（link-health）再看。
 */
export interface Landing { ok: boolean; status?: number; finalUrl?: string; homeRedirect?: boolean; httpFallback?: string; error?: string }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
/** 只有语言前缀 / index 的路径都算首页：/、/zh-CN、/en-us/、/cn、/index.html */
const HOME_PATH = /^\/?((zh|en|cn|us|hk|tw|jp|ja|ko|de|fr)([-_][a-z]{2,4})?\/?)?((index|default|home)(\.\w+)?)?\/?$/i;

async function get(url: string, ms: number): Promise<{ status: number; finalUrl: string } | { error: string }> {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: AbortSignal.timeout(ms) });
    res.body?.cancel().catch(() => {});
    return { status: res.status, finalUrl: res.url || url };
  } catch (e: any) {
    return { error: String(e?.cause?.code || e?.name || e?.message || e) };
  }
}

export async function linkLanding(url: string, ms = 12000): Promise<Landing> {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, error: 'bad url' }; }
  let r = await get(url, ms);
  let httpFallback: string | undefined;
  if ('error' in r && u.protocol === 'https:') {
    const alt = await get(url.replace(/^https:/i, 'http:'), ms);
    // http 能开但最后又跳回 https：只是刚才那次 https 偶尔超时，不算「只支持 http」，链接不用改
    if (!('error' in alt) && alt.status < 400) { r = alt; if (/^http:/i.test(alt.finalUrl)) httpFallback = alt.finalUrl; }
  }
  if ('error' in r) return { ok: false, error: r.error };
  let homeRedirect = false;
  try {
    const f = new URL(r.finalUrl);
    const deep = !HOME_PATH.test(u.pathname) || !!u.hash.replace(/^#\/?$/, '');
    homeRedirect = deep && HOME_PATH.test(f.pathname) && !f.hash.replace(/^#\/?$/, '') && (f.pathname !== u.pathname || f.hostname !== u.hostname);
  } catch { /* 跳到奇怪的地址：不判 */ }
  return { ok: r.status < 400, status: r.status, finalUrl: r.finalUrl, homeRedirect, httpFallback };
}
