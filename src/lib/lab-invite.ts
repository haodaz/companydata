import { SignJWT, jwtVerify } from 'jose';

/**
 * 「请一位老师傅来教」的邀请链接。
 *
 * 一张签了名、带过期时间的票：凭它不登录也能进这一位数字职人的空间，
 * 但只能做「向上学习」——走一遍、被追问、交给 AI 核心吸收。
 *
 * 钥匙从登录密钥派生出一把单独的：要是同一把，邀请票塞进登录 cookie 里
 * 也能通过会话校验，就成了越权。audience 再锁一道。
 */
const KEY = new TextEncoder().encode(`${process.env.JWT_SECRET || 'companydata_dev_only_secret_change_me'}::lab-invite`);
const AUD = 'lab-invite';

/** 代理层验过签之后才会给请求带上这两个头；客户端自己带来的会先被剥掉 */
export const INVITED = 'x-lab-invited';
export const INVITED_BY = 'x-lab-invited-by';

export const INVITE_DAYS = 14;

export async function signInvite(spaceId: string, by: string): Promise<{ token: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + INVITE_DAYS * 86400;
  const token = await new SignJWT({ s: spaceId, by })
    .setProtectedHeader({ alg: 'HS256' }).setAudience(AUD).setIssuedAt().setExpirationTime(exp).sign(KEY);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function readInvite(token: string | null | undefined): Promise<{ spaceId: string; by: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, KEY, { audience: AUD });
    return typeof payload.s === 'string' ? { spaceId: payload.s, by: String(payload.by || '') } : null;
  } catch {
    return null;
  }
}
