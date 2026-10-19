/**
 * 游客标记（simulator 版，2026-10-19 同步自 companydata）。
 * proxy 给没登录的请求（LAB_PUBLIC 放行的游客、受邀老师傅）打上 x-lab-guest，客户端自己带的会先被剥掉；
 * 「和我聊」、昵称接口靠它认游客。
 * 模型：companydata 那边游客能在几个便宜模型里挑；simulator 全站走 model-config——游客只能在 GUEST_MODELS（放行的便宜模型）里挑，别的落回主力；登录的人选的也要过 pickModel。
 */
import { ALLOWED, CHEAP_MODEL, LLM_MODEL, pickModel } from '@/lib/model-config';

export const LAB_GUEST = 'x-lab-guest';
export const GUEST_MODELS = [CHEAP_MODEL, LLM_MODEL].filter((m, i, a) => ALLOWED(m) && a.indexOf(m) === i);
export const GUEST_MODEL = GUEST_MODELS[0] || LLM_MODEL;
export const labModel = (req: Request, model: unknown): string | undefined => {
  const m = typeof model === 'string' && model ? model : undefined;
  if (req.headers.get(LAB_GUEST) === '1') return m && GUEST_MODELS.includes(m) ? m : GUEST_MODEL;
  return pickModel(m ?? null);
};
