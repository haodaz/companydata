/**
 * 记一条需求信号，入库时就地归一（规则 + 归一词典 + 企业名匹配）。仅在服务端使用。
 *
 *   logDemand({ source: 'lab_problem', query: '焊缝气孔怎么判断' })            // 脚本 / 后台任务里直接调
 *   trackDemand(req, { source: 'admin_job_search', query: search })          // 路由里调：响应发出后再记，不拖慢接口
 *
 * 规则能把四个口径都定下来的直接标 rule；剩下的留给 normalizePending 用模型批量补（只补空的口径）。
 * 记信号永远不抛错——飞轮是旁路，不能因为它让正经接口失败。
 */
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { resolveCompanyId, resolveCompanyLoose } from '@/lib/company-match';
import { sourceWeight } from '@/lib/flywheel/sources';
import { aliasKey, cleanProfession, familyByRule, functionByRule, industryByRule, isEmployer } from '@/lib/flywheel/taxonomy';

export interface DemandInput {
  source: string;
  query?: string | null;
  actor?: string | null;
  weight?: number;
  company_id?: number | null;
  company_name?: string | null;
  industry?: string | null;
  job_function?: string | null;
  career_family?: string | null;
  profession?: string | null;
  meta?: Record<string, unknown>;
  /** 回填历史信号时用原始时间 */
  created_at?: string;
}

// ── 归一词典缓存（10 分钟）──
let aliasCache: { at: number; map: Map<string, string> } | null = null;
export async function aliasMap(): Promise<Map<string, string>> {
  if (aliasCache && Date.now() - aliasCache.at < 600_000) return aliasCache.map;
  const map = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('taxonomy_aliases').select('dim, raw, canonical').range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) map.set(`${r.dim}:${r.raw}`, r.canonical);
    if (data.length < 1000) break;
  }
  aliasCache = { at: Date.now(), map };
  return map;
}
export const invalidateAliases = () => { aliasCache = null; };

/** 企业的标准行业：词典（企业库原写法 → 标准行业）优先，其次规则 */
export function industryOfCompany(c: { industry?: string | null; sub_industry?: string | null; name?: string | null }, aliases: Map<string, string>): string | null {
  for (const raw of [c.industry, c.sub_industry]) {
    if (!raw) continue;
    const hit = aliases.get(`industry:${aliasKey(raw)}`);
    if (hit) return hit;
  }
  return industryByRule(c.industry, c.sub_industry) || null;
}

const companyCache = new Map<number, { name: string; industry: string | null; sub_industry: string | null }>();
async function companyInfo(id: number) {
  if (companyCache.has(id)) return companyCache.get(id)!;
  const { data } = await supabaseAdmin.from('companies').select('name, industry, sub_industry').eq('id', id).maybeSingle();
  const v = { name: data?.name || '', industry: data?.industry ?? null, sub_industry: data?.sub_industry ?? null };
  companyCache.set(id, v);
  return v;
}

// 同一个人短时间内重复同一个搜索只算一次（翻页、刷新、改排序都会重发请求）
const recent = new Map<string, number>();
const DEDUPE_MS = 30 * 60_000;

export async function logDemand(input: DemandInput): Promise<void> {
  try {
    const query = String(input.query || '').trim().slice(0, 1000);
    if (!query && !input.company_id && !input.company_name) return;
    const key = `${input.source}|${input.actor || ''}|${query}|${input.company_id || ''}`;
    if (!input.created_at) {
      const last = recent.get(key);
      if (last && Date.now() - last < DEDUPE_MS) return;
      recent.set(key, Date.now());
      if (recent.size > 5000) for (const [k, t] of recent) if (Date.now() - t > DEDUPE_MS) recent.delete(k);
    }

    const aliases = await aliasMap();
    let company_id = input.company_id ?? null;
    let company_name = input.company_name?.trim() || null;
    // 招聘平台 / 媒体 / 就业网站不算企业
    if (company_name && !isEmployer(company_name)) { company_name = null; if (!input.company_id) company_id = null; }
    // 搜索词本身就是企业名（「华为」「宁德时代」）：对上库里的企业
    if (!company_id && (company_name || (query && query.length <= 40 && !/\s{2,}/.test(query) && isEmployer(query)))) {
      // 有明确企业名的走宽松匹配；拿搜索词猜企业只做精确匹配，免得「华」这种词乱对
      company_id = await (company_name ? resolveCompanyLoose(company_name) : resolveCompanyId(query)).catch(() => null);
    }
    let industry = input.industry || null;
    if (company_id) {
      const c = await companyInfo(company_id);
      company_name = company_name || c.name;
      industry = industry || industryOfCompany(c, aliases);
    }
    const hint = [query, input.profession].filter(Boolean).join(' ');
    industry = industry || aliases.get(`industry:${aliasKey(query)}`) || industryByRule(hint);
    const job_function = input.job_function || aliases.get(`job_function:${aliasKey(query)}`) || functionByRule(hint);
    const career_family = input.career_family || aliases.get(`career_family:${aliasKey(query)}`) || familyByRule(hint);
    const profession = cleanProfession(input.profession);

    // 对上了企业的搜索，企业就是它的全部意思；其余的要四个口径都有才算规则归一完
    const done = !!company_id && !query.replace(company_name || '', '').trim() || !!(industry && job_function && career_family);
    await supabaseAdmin.from('demand_signals').insert({
      source: input.source,
      query,
      actor: input.actor || null,
      weight: input.weight ?? sourceWeight(input.source),
      industry, job_function, career_family, profession,
      company_id, company_name,
      normalized_by: done ? 'rule' : null,
      normalized_at: done ? new Date().toISOString() : null,
      meta: input.meta || {},
      ...(input.created_at ? { created_at: input.created_at } : {}),
    });
  } catch (e) {
    console.warn('[flywheel] logDemand failed', (e as Error)?.message);
  }
}

/** 路由里用：响应发出后再记，顺手带上当前登录账号 */
export function trackDemand(req: Request, input: DemandInput | DemandInput[]) {
  const list = (Array.isArray(input) ? input : [input]).filter(x => x && (x.query || x.company_id || x.company_name));
  if (!list.length) return;
  try {
    after(async () => {
      const user = await getSessionUser(req).catch(() => null);
      for (const x of list) await logDemand({ ...x, actor: x.actor ?? user?.email ?? null });
    });
  } catch { /* 不在请求上下文里（脚本）就跳过 */ }
}
