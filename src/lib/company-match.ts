/**
 * 企业名称 → companies.id
 * 匹配顺序：名称（忽略大小写）→ 英文名 → 别名。找不到时可按需自动建档（企业库没有预置名单，靠采集逐步沉淀）。
 * 仅在服务端使用。
 */
import { supabaseAdmin } from '@/lib/supabase';

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
  return data.id;
}
