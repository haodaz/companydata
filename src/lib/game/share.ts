/**
 * 分享这一生（用户 11-07：分享出去的链接要能显示标题和副标题，学 80 亿分之一）：
 * 链接 1job1life.com/s/<code> 里只装这一局的摘要（卡 id、名字、起止年龄、最后一级、怎么离开、语言），
 * 打开的页面按它生成标题 / 副标题给微信、X 的链接卡片，页面本身是游戏首页加一条「某某的一生」。
 */
import type { Lang } from './i18n';

export interface Shared { c: string; n: string; a: number; b: number; s: number; d: 'retire' | 'burnout' | 'end'; l: Lang }

export const encodeShare = (x: Shared) => {
  const json = JSON.stringify(x);
  const b64 = typeof window === 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function decodeShare(code: string): Shared | null {
  try {
    const x = JSON.parse(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (typeof x?.c !== 'string' || typeof x.n !== 'string' || !['retire', 'burnout', 'end'].includes(x.d)) return null;
    return { c: x.c, n: x.n.slice(0, 24), a: +x.a || 0, b: +x.b || 0, s: +x.s || 0, d: x.d, l: x.l === 'en' ? 'en' : 'zh' };
  } catch { return null; }
}

export const SITE = { zh: '入一行，过一生 - 随机体验中国职业的一生', en: 'One Job, One Life - Live a random career in China' };

/** 链接卡片上的两行（用户 11-07：分享一律用英文）：标题「Name's working life: 身份, 城市」，副标题「几岁入行，做到什么，几岁怎么离开」；页面上的摘要跟玩的语言走 */
export function shareLines(x: Shared, card: { role: string; city: string; ladder: { title: string }[] }, lang: Lang, name: string) {
  const top = card.ladder[x.s]?.title || card.role;
  if (lang === 'en') {
    const how = x.d === 'burnout' ? 'left the front line' : x.d === 'end' ? 'walked away for something else' : 'retired';
    return { title: `${name}'s working life: ${card.role}, ${card.city}`, sub: `Started at ${x.a}, rose to ${top}, ${how} at ${x.b}.` };
  }
  const how = x.d === 'burnout' ? '离开一线' : x.d === 'end' ? '转身去了别处' : '退休';
  return { title: `${name}的一生：${card.city} · ${card.role}`, sub: `${x.a} 岁入行，做到${top}，${x.b} 岁${how}。` };
}
