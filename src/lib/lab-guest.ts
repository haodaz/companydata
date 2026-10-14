/**
 * 游客模型（2026-10-12 起锁在一个便宜模型；2026-10-14 改成游客也能在 GUEST_MODELS 里挑，默认通义千问）。
 * proxy 给没登录的请求（LAB_PUBLIC 放行的游客、受邀老师傅）打上 x-lab-guest，客户端自己带的会先被剥掉；
 * 接口里取模型一律走 labModel：游客只能用 GUEST_MODELS 里的（别的落回默认），登录的人按自己选的。
 */
export const LAB_GUEST = 'x-lab-guest';
/**
 * 2026-10-14 用户：体验百业给投资人 / 国内用户演示，默认用通义千问（国内服务、中文顺），但不硬替换——
 * 游客页头也有下拉，只能在这几个便宜的里挑；接口那边同样只认这几个，传别的一律落回默认。
 */
export const GUEST_MODELS = ['qwen-plus', 'gemini-3.8-flash'];
export const GUEST_MODEL = 'qwen-plus';
export const labModel = (req: Request, model: unknown): string | undefined => {
  const m = typeof model === 'string' && model ? model : undefined;
  if (req.headers.get(LAB_GUEST) === '1') return m && GUEST_MODELS.includes(m) ? m : GUEST_MODEL;
  return m;
};
