/**
 * AI 百业 · 证书与成绩单（前后端共用）。
 * 成绩单仿雅思：总分和每个维度换算成 1–9 的等级（0.5 一档），配一句等级描述。
 * 访客编号：浏览器第一次来时随机生成存本地；登录用户用 u:<账号>，换设备也找得回。
 */
export const band = (score: number | null | undefined, full = 100): number => {
  if (score == null || !full) return 0;
  return Math.min(9, Math.max(1, Math.round((score / full) * 9 * 2) / 2));
};
export const bandText = (b: number) => b.toFixed(1);
export const bandLevel = (b: number): string =>
  b >= 8.5 ? '可独当一面' : b >= 7.5 ? '熟练' : b >= 6.5 ? '胜任' : b >= 5.5 ? '基本胜任' : b >= 4.5 ? '需要带教' : '入门';

/** 证书编号：AI100-XXXX-XXXX（取作答编号前 8 位，查得到就是真的） */
export const certNo = (id: string) => `AI100-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}-${id.replace(/-/g, '').slice(4, 8).toUpperCase()}`;

const KEY = 'lab:visitor';
/** 本浏览器的访客编号 + 登录账号的编号（都可能有：登录前做过的也算自己的） */
export function visitorIds(userId?: string | number | null): string[] {
  const out: string[] = [];
  if (userId) out.push(`u:${userId}`);
  try {
    let v = localStorage.getItem(KEY);
    if (!v) { v = `v:${(crypto as any).randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)}`; localStorage.setItem(KEY, v); }
    out.push(v);
  } catch { /* 无痕模式：只能靠登录账号 */ }
  return out;
}
