/**
 * 「要登录才能看」的判断，健康检查、链接体检、抓岗位共用。院校申请那边以后也走这一套。
 *
 * 三种迹象，任一成立就算需登录：
 *   1. 跳转去了登录地址（/login、/signin、sso、passport、oauth、uuc…）
 *   2. 接口直接回「请登录 / TOKEN 已过期 / unauthorized」
 *   3. 页面正文很短、只剩「请登录 / 登录后查看」这类提示（或有密码框）
 * 只在导航栏有个「登录」按钮的正常页面不能误判：第 3 条要求正文短、而且提示语在正文里。
 */

const LOGIN_URL = /(^|[\/#.?&=_-])(login|signin|sign-in|sign_in|logon|sso|passport|oauth2?|cas|uuc|auth\/realms)([\/#.?&=_-]|$)/i;
const LOGIN_TEXT = /请登录|请先登录|登录后(查看|可见|才能|继续|浏览|投递)|需要登录|扫码登录|账号登录|密码登录|登录\s*\/\s*注册后|sign in to (continue|view|see|apply)|log ?in to (continue|view|see|apply)|you (need|must) (to )?(sign|log) ?in|please (sign|log) ?in|session (has )?expired/i;
const LOGIN_API = /TOKEN\s*已过期|请重新登录|未登录|登录已过期|unauthori[sz]ed|not logged in|login required|"code"\s*:\s*(401|100095)/i;

export interface LoginVerdict { login: boolean; reason?: string }

/** 跳转地址像登录页 */
export function loginByRedirect(location?: string | null): LoginVerdict {
  if (location && LOGIN_URL.test(location)) return { login: true, reason: `跳转到登录地址 ${location.slice(0, 120)}` };
  return { login: false };
}

/** 接口 / 页面原文里直接说要登录（JSON 接口最常见） */
export function loginByApiText(body?: string | null): LoginVerdict {
  const hit = body?.slice(0, 2000).match(LOGIN_API)?.[0];
  return hit ? { login: true, reason: `返回「${hit}」` } : { login: false };
}

/**
 * 渲染后的页面（Jina markdown 或 HTML）：正文短、提示语在正文里，或者有密码输入框
 * @param content 页面正文（markdown 或 html）
 */
export function loginByPage(content?: string | null): LoginVerdict {
  if (!content) return { login: false };
  const body = (content.split(/Markdown Content:/)[1] ?? content)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')            // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')          // 链接只留文字
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const hasPassword = /type=["']?password/i.test(content);
  const hit = body.match(LOGIN_TEXT)?.[0];
  if (hasPassword && body.length < 1500) return { login: true, reason: '页面是登录表单（有密码框）' };
  if (hit && body.length < 1200) return { login: true, reason: `页面只有登录提示「${hit}」` };
  return { login: false };
}

export function loginVerdict(parts: { location?: string | null; finalUrl?: string | null; api?: string | null; page?: string | null }): LoginVerdict {
  for (const v of [loginByRedirect(parts.location), loginByRedirect(parts.finalUrl), loginByApiText(parts.api), loginByPage(parts.page)]) if (v.login) return v;
  return { login: false };
}
