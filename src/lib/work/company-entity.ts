/**
 * 真活出题遇到库里没有的企业（2026-10-27）：出题人贴了介绍，就按单入库（make to order）。
 * 新建一条 companies（来源「真活出题」、待审核），把 AI 从介绍里解析出的画像字段写进去（只写空字段）；
 * 之后走企业库的人工审核和补画像任务（完整度低的会排进补画像）。只有名字、没有介绍的不建，免得错字进库。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { createCompanyEntity } from '@/lib/ws/setup';

const FIELDS = ['industry', 'city', 'company_scale', 'one_sentence', 'introduction', 'business_profile', 'product_area', 'tech_advantage', 'growth_signals', 'industry_position', 'public_sentiment'] as const;
export const WORK_SOURCE = '真活出题';

/** 返回新建（或撞名命中）的企业 id；建不成返回 null，不挡出题 */
export async function ensureWorkCompany(name: string, profile: Record<string, any> | null | undefined, email: string): Promise<number | null> {
  const n = String(name || '').trim();
  if (n.length < 2) return null;
  try {
    const id = await createCompanyEntity(n, null, email, WORK_SOURCE);
    const { data: cur } = await db.from('companies').select(['id', ...FIELDS].join(', ')).eq('id', id).maybeSingle();
    const up: Record<string, any> = {};
    for (const f of FIELDS) { const v = profile?.[f]; if (typeof v === 'string' && v.trim() && !(cur as any)?.[f]) up[f] = v.trim().slice(0, 4000); }
    if (Object.keys(up).length) {
      up.updated_at = new Date().toISOString();
      const { error } = await db.from('companies').update(up).eq('id', id);
      // 某个字段在库里类型不对：逐个写，能写的写进去
      if (error) for (const [k, v] of Object.entries(up)) await db.from('companies').update({ [k]: v }).eq('id', id).then(() => {}, () => {});
    }
    return id;
  } catch (e: any) {
    console.warn('[work] 新企业入库失败：', String(e?.message).slice(0, 160));
    return null;
  }
}
