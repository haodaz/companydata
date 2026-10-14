/**
 * 游客标记（simulator 版，2026-10-14 同步自 companydata）。
 * proxy 给没登录的请求（LAB_PUBLIC 放行的游客、受邀老师傅）打上 x-lab-guest，客户端自己带的会先被剥掉；
 * 「和我聊」、昵称接口靠它认游客。
 * 模型：companydata 那边游客锁在 Gemini 3.8 Flash；simulator 全站走 model-config，游客一律用主力模型，登录的人选的也要过 pickModel。
 */
import { LLM_MODEL, pickModel } from '@/lib/model-config';

export const LAB_GUEST = 'x-lab-guest';
export const GUEST_MODEL = LLM_MODEL;
export const labModel = (req: Request, model: unknown): string | undefined =>
  req.headers.get(LAB_GUEST) === '1' ? GUEST_MODEL : pickModel(typeof model === 'string' ? model : null);
