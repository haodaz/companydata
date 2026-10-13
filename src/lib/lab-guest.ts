/**
 * 游客模型锁（2026-10-12，用户：「游客不要看到模型切换，默认锁在 Gemini 3.8 Flash」）。
 * proxy 给没登录的请求（LAB_PUBLIC 放行的游客、受邀老师傅）打上 x-lab-guest，客户端自己带的会先被剥掉；
 * 接口里取模型一律走 labModel：游客不管传什么都用默认模型，登录的人按自己选的。
 */
export const LAB_GUEST = 'x-lab-guest';
export const GUEST_MODEL = 'gemini-3.8-flash';
export const labModel = (req: Request, model: unknown): string | undefined =>
  req.headers.get(LAB_GUEST) === '1' ? GUEST_MODEL : (typeof model === 'string' && model ? model : undefined);
