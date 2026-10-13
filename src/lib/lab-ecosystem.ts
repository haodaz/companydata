/** 产业链环节 → 企业库里的真实公司（「我的行当」页和「和我聊」的知识包共用） */
import { supabaseAdmin } from '@/lib/supabase';

/**
 * 拿环节关键词去企业库里捞真实公司。
 * 字段不同可信度不同：行业 / 产品领域里写着「半导体」是真做半导体，
 * 经营范围那种长文本里提一口就不算——所以打分排序，分不够的宁可不给。
 */
export async function matchCompanies(keywords: string[], limit = 4) {
  const kws = [...new Set(keywords.filter(k => k && k.length >= 2).slice(0, 5))];
  if (!kws.length) return [];
  const FIELDS: [string, number][] = [['industry', 3], ['sub_industry', 3], ['product_area', 3], ['name', 2.5], ['company_specialties', 2], ['business_range', 1]];
  const or = kws.flatMap(k => FIELDS.map(([f]) => `${f}.ilike.%${k}%`)).join(',');
  const { data } = await supabaseAdmin.from('companies')
    .select('id, name, industry, sub_industry, product_area, company_specialties, business_range, one_sentence, city, province')
    .or(or).limit(60);
  const scored = (data || []).map((c: any) => {
    let sc = 0, strong = false;
    for (const k of kws) {
      // 一个词只算它命中的最可信那个字段，别让同一个词在五个字段里重复计分
      let best = 0;
      for (const [f, w] of FIELDS) if (String(c[f] || '').includes(k)) best = Math.max(best, w);
      if (best >= 2.5) strong = true;
      sc += best;
    }
    return { c, sc, strong };
  })
    // 必须有一个词落在行业 / 产品领域 / 公司名上——只是简介里提过一口的不算同行
    .filter(x => x.strong && x.sc >= 3)
    .sort((a, b) => b.sc - a.sc);
  const seen = new Set<string>();
  return scored.filter(x => { if (seen.has(x.c.name)) return false; seen.add(x.c.name); return true; })
    .slice(0, limit)
    .map(x => ({ id: x.c.id, name: x.c.name, industry: x.c.industry || x.c.sub_industry, city: x.c.city || x.c.province, one_sentence: x.c.one_sentence }));
}
