/**
 * 企业名称 → companies.id
 * 匹配顺序：名称（忽略大小写）→ 英文名 → 别名。找不到时可按需自动建档（企业库没有预置名单，靠采集逐步沉淀）。
 * 仅在服务端使用。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { ensureCompanyFloraId } from '@/lib/company-flora-id';

const cache = new Map<string, number>();

/** PostgREST 的 or() 过滤里逗号 / 括号 / 点号有特殊含义，统一用双引号包起来 */
const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** ilike 精确匹配时转义通配符 */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`);

export async function resolveCompanyId(company?: string | null): Promise<number | null> {
  const name = (company || '').trim();
  if (!name) return null;
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  const like = quote(escapeLike(name));
  const { data } = await supabaseAdmin
    .from('companies')
    .select('id')
    .or(`name.ilike.${like},name_en.ilike.${like}`)
    .order('id', { ascending: true })
    .limit(1);

  let id: number | null = data?.[0]?.id ?? null;
  if (id === null) {
    const { data: byAlias } = await supabaseAdmin.from('companies').select('id').contains('aliases', [name]).limit(1);
    id = byAlias?.[0]?.id ?? null;
  }
  if (id !== null) cache.set(key, id);
  return id;
}

const HAS_CJK = /[一-鿿]/;

/** 找不到就建档：只写名称，其余字段留给「AI 补全」 */
export async function resolveOrCreateCompany(company?: string | null): Promise<number | null> {
  const name = (company || '').trim();
  if (!name) return null;
  const found = await resolveCompanyId(name);
  if (found !== null) return found;

  const { data, error } = await supabaseAdmin
    .from('companies')
    .insert({ name, name_en: HAS_CJK.test(name) ? null : name })
    .select('id')
    .single();

  if (error) {
    // 并发下被别的请求抢先建档（lower(name) 唯一索引冲突）→ 再查一次
    return resolveCompanyId(name);
  }
  cache.set(name.toLowerCase(), data.id);
  // 刚建档还没有官网：先按「国家代码.拼音首字母」给编号，之后补上官网由触发器升级成域名那一档
  await ensureCompanyFloraId(data.id).catch(() => {});
  return data.id;
}

/**
 * 宽松匹配：去掉「股份有限公司 / 科技 / 中国 / 城市名 / 括号」这类后缀前缀再比，
 * 「华为技术有限公司」对上「华为」、「北京月之暗面科技有限公司」对上「月之暗面」。
 * 子公司会落到母公司（「腾讯云计算」→「腾讯」）——看热度时这正是想要的。精确匹配优先，对不上才走这里。
 */
const CORE_STRIP = /[（(][^）)]*[)）]|股份有限公司|有限责任公司|有限公司|集团|控股|公司|科技|技术|信息|网络|软件|中国|北京|上海|深圳|广州|杭州|苏州|南京|成都|武汉|合肥|西安|天津|\s|·/g;
const coreName = (s: string) => s.replace(CORE_STRIP, '').toLowerCase();
let looseIndex: { at: number; rows: { id: number; cores: string[] }[] } | null = null;

export async function resolveCompanyLoose(company?: string | null): Promise<number | null> {
  const name = (company || '').trim();
  if (!name) return null;
  const exact = await resolveCompanyId(name);
  if (exact !== null) return exact;
  const k = coreName(name);
  if (k.length < 2) return null;
  if (!looseIndex || Date.now() - looseIndex.at > 10 * 60_000) {
    const rows: { id: number; cores: string[] }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabaseAdmin.from('companies').select('id, name, brief_name, aliases').order('id').range(from, from + 999);
      for (const c of data || []) rows.push({ id: c.id, cores: [c.name, c.brief_name, ...((c.aliases as string[]) || [])].filter(Boolean).map((n: string) => coreName(n)).filter(x => x.length >= 2) });
      if (!data || data.length < 1000) break;
    }
    looseIndex = { at: Date.now(), rows };
  }
  const hit = (o: string) => o === k || (o.length >= 3 && k.startsWith(o)) || (k.length >= 3 && o.startsWith(k)) || (o.length === 2 && k.length <= 4 && k.startsWith(o));
  // 先找完全相同的核心名，再退到前缀包含；同等情况下取 id 最小（最早建档的那家）
  const same = looseIndex.rows.find(r => r.cores.includes(k));
  const pre = same || looseIndex.rows.find(r => r.cores.some(hit));
  if (pre) cache.set(name.toLowerCase(), pre.id);
  return pre?.id ?? null;
}

/** 宽松匹配也对不上才建档 */
export async function resolveLooseOrCreateCompany(company?: string | null): Promise<{ id: number | null; created: boolean }> {
  const found = await resolveCompanyLoose(company);
  if (found !== null) return { id: found, created: false };
  const id = await resolveOrCreateCompany(company);
  if (id !== null && looseIndex) looseIndex.rows.push({ id, cores: [coreName(String(company))] });
  return { id, created: id !== null };
}
