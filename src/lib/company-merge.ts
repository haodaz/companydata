/**
 * 企业画像流水线的纯函数：值清洗、子实体去重键、多来源合并。
 * 前端（流水线编排）和服务端（入库）共用，不依赖 supabase / LLM。
 */
import { ARRAY_FIELDS, INT_FIELDS, FINANCE_ROUND_LABELS, EDUCATION_LABELS, GENDER_LABELS, NEWS_KIND_LABELS, SEGMENT_LABELS, COMPANY_TYPE_LABELS, KIND_LABELS, CONTINENT_LABELS, TYPE_LABEL_LABELS, hasValue } from '@/lib/company-fields';

export interface Financing { finance_round: string | null; finance_round_str: string | null; finance_amount: string | null; finance_enterprise: string | null; publish_date: string | null; publish_date_str: string | null; source_url: string | null }
export interface NewsItem { description: string; publish_date: string | null; publish_date_str: string | null; publish_source: string | null; source_url: string | null; kind: string | null }
export interface Executive { name: string; title: string | null; description: string | null; education: string | null; gender: string | null; age: number | null; is_founder: boolean; salary: string | null; share_holding: number | null; share_ratio: number | null; start_date: string | null; start_date_str: string | null; source_url: string | null }

export interface ProfileBundle {
  profile: Record<string, any>;
  financings: Financing[];
  news: NewsItem[];
  executives: Executive[];
  sources: Record<string, string>;
}

export const str = (v: any): string | null => (typeof v === 'string' && v.trim() && !/^(null|none|n\/a|未知|不详|无)$/i.test(v.trim()) ? v.trim() : (typeof v === 'number' ? String(v) : null));
export const url = (v: any): string | null => { const s = str(v); return s && /^https?:\/\/\S+$/i.test(s) ? s : null; };
export const int = (v: any): number | null => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
export const num = (v: any): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const bool = (v: any): boolean => v === true || /^(true|yes|是|1)$/i.test(String(v ?? ''));
const enumOf = (v: any, labels: Record<string, any>): string | null => { const s = str(v); return s && s in labels ? s : null; };
const list = (v: any): string[] => Array.isArray(v) ? v.map(x => str(x)).filter((x): x is string => !!x) : (str(v) ? String(v).split(/[,，;；/]/).map(x => x.trim()).filter(Boolean) : []);

/** 日期：接受 2024-03-15 / 2024-03 / 2024 / 2024年3月15日 → { date: 'YYYY-MM-DD' | null, raw } */
export function parseDate(v: any): { date: string | null; raw: string | null } {
  const raw = str(v);
  if (!raw) return { date: null, raw: null };
  const m = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/) || raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; return validDate(d) ? { date: d, raw } : { date: null, raw }; }
  const ym = raw.match(/(\d{4})\D+(\d{1,2})(?!\d)/);
  if (ym) { const d = `${ym[1]}-${ym[2].padStart(2, '0')}-01`; return validDate(d) ? { date: d, raw } : { date: null, raw }; }
  const y = raw.match(/(19|20)\d{2}/);
  if (y) return { date: `${y[0]}-01-01`, raw };
  return { date: null, raw };
}
function validDate(d: string) { const t = new Date(d); return !isNaN(t.getTime()) && t.getFullYear() >= 1800 && t.getFullYear() <= 2100; }

/** 融资轮次原文 → 对方枚举 */
export function normalizeRound(v: any): { round: string | null; raw: string | null } {
  const raw = str(v);
  if (!raw) return { round: null, raw: null };
  if (raw in FINANCE_ROUND_LABELS) return { round: raw, raw };
  const s = raw.toLowerCase().replace(/\s+/g, '');
  const table: [RegExp, string][] = [
    [/pre[-_]?ipo|上市前/, 'preipo'], [/种子|seed/, 'seed'], [/天使|angel/, 'angel'],
    [/pre[-_]?a/, 'pre_a'], [/pre[-_]?b/, 'pre_b'],
    [/^(series)?[-_]?a\+?(轮|round)?$|a\+?轮|seriesa/, 'series_a'], [/b\+?轮|seriesb|^b\+?$/, 'series_b'], [/c\+?轮|seriesc|^c\+?$/, 'series_c'],
    [/d\+?轮|seriesd|^d\+?$/, 'series_d'], [/e\+?轮|seriese|^e\+?$/, 'series_e'], [/f\+?轮|seriesf|^f\+?$/, 'series_f'],
  ];
  for (const [re, val] of table) if (re.test(s)) return { round: val, raw };
  return { round: null, raw };
}

/** companies 字段值清洗（按字段类型 / 枚举） */
export function normalizeProfileValue(key: string, v: any): any {
  if (v === null || v === undefined) return null;
  if (ARRAY_FIELDS.has(key)) {
    const arr = list(v);
    if (key === 'type_label') return arr.filter(x => x in TYPE_LABEL_LABELS);
    return arr;
  }
  if (INT_FIELDS.has(key)) return int(v);
  if (/_url$|^official_website$|^year_report_address$/.test(key)) return url(v);
  if (key === 'segment') return enumOf(v, SEGMENT_LABELS);
  if (key === 'company_type') return enumOf(v, COMPANY_TYPE_LABELS);
  if (key === 'kind') return enumOf(v, KIND_LABELS);
  if (key === 'continent') return enumOf(v, CONTINENT_LABELS);
  if (key === 'unified_social_credit_code') { const s = str(v); return s && /^[0-9A-Z]{18}$/.test(s) ? s : null; }
  return str(v);
}

export function normalizeFinancing(x: any): Financing | null {
  if (!x || typeof x !== 'object') return null;
  // 已经清洗过的行再过一遍也不能丢信息（finance_round 为 null 时原文在 finance_round_str）
  const { round, raw } = normalizeRound(x.finance_round ?? x.finance_round_str ?? x.round);
  const d = parseDate(x.publish_date ?? x.publish_date_str ?? x.date);
  const amount = str(x.finance_amount ?? x.amount);
  const investors = Array.isArray(x.finance_enterprise) ? x.finance_enterprise.map(str).filter(Boolean).join(' / ') : str(x.finance_enterprise ?? x.investors);
  if (!round && !raw && !amount && !investors) return null;
  return { finance_round: round, finance_round_str: raw, finance_amount: amount, finance_enterprise: investors, publish_date: d.date, publish_date_str: d.raw, source_url: url(x.source_url ?? x.source) };
}

export function normalizeNews(x: any): NewsItem | null {
  if (!x || typeof x !== 'object') return null;
  const description = str(x.description ?? x.summary ?? x.title);
  if (!description) return null;
  const d = parseDate(x.publish_date ?? x.publish_date_str ?? x.date);
  return { description, publish_date: d.date, publish_date_str: d.raw, publish_source: str(x.publish_source ?? x.source_name), source_url: url(x.source_url ?? x.url), kind: enumOf(x.kind, NEWS_KIND_LABELS) || 'other' };
}

export function normalizeExecutive(x: any): Executive | null {
  if (!x || typeof x !== 'object') return null;
  const name = str(x.name);
  if (!name || name.length > 40) return null;
  const d = parseDate(x.start_date ?? x.start_date_str);
  return {
    name, title: str(x.title ?? x.position), description: str(x.description ?? x.bio), education: enumOf(x.education, EDUCATION_LABELS), gender: enumOf(x.gender, GENDER_LABELS),
    age: int(x.age), is_founder: bool(x.is_founder), salary: str(x.salary), share_holding: num(x.share_holding), share_ratio: num(x.share_ratio),
    start_date: d.date, start_date_str: d.raw, source_url: url(x.source_url ?? x.source),
  };
}

// ── 去重键 ──
const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/\s+/g, '').replace(/[，,。.;；:：、\-—_()（）【】\[\]"'“”]/g, '');
export const financingKey = (companyId: number, f: Financing) => `${companyId}|${f.finance_round || norm(f.finance_round_str)}|${f.publish_date || norm(f.publish_date_str) || norm(f.finance_amount)}`;
export const newsKey = (companyId: number, n: NewsItem) => `${companyId}|${n.source_url ? n.source_url.replace(/[#?].*$/, '') : norm(n.description).slice(0, 60)}`;
export const executiveKey = (companyId: number, e: Executive) => `${companyId}|${norm(e.name)}`;

/**
 * 同一实体多来源合并：先到先得，空字段由后来的补上；
 * richer 里列出的文本字段（职务 / 简介 / 投资方）后来的明显更详细时取后者（官网页面常只给「博士」这种残缺职务）。
 */
function mergeRows<T extends Record<string, any>>(rows: (T | null)[], keyOf: (r: T) => string, richer: string[] = []): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    if (!r) continue;
    const k = keyOf(r);
    const cur = map.get(k);
    if (!cur) { map.set(k, { ...r }); continue; }
    for (const [f, v] of Object.entries(r)) {
      if (!hasValue(v)) continue;
      if (!hasValue(cur[f])) { (cur as any)[f] = v; continue; }
      if (richer.includes(f) && typeof v === 'string' && typeof cur[f] === 'string' && v.length > cur[f].length * 1.5) (cur as any)[f] = v;
    }
  }
  return Array.from(map.values());
}

/**
 * 把多个来源（官方页面提取、各主题检索）合并为一份 bundle。
 * profile 字段先到先得（调用方按可信度排序：官方页面 > 检索）。
 */
export function mergeBundles(parts: Partial<ProfileBundle>[]): ProfileBundle {
  const profile: Record<string, any> = {};
  const sources: Record<string, string> = {};
  const financings: (Financing | null)[] = [];
  const news: (NewsItem | null)[] = [];
  const executives: (Executive | null)[] = [];
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.profile || {})) {
      const nv = normalizeProfileValue(k, v);
      if (hasValue(nv) && !hasValue(profile[k])) { profile[k] = nv; if (p.sources?.[k]) sources[k] = p.sources[k]; }
    }
    financings.push(...(p.financings || []).map(normalizeFinancing));
    news.push(...(p.news || []).map(normalizeNews));
    executives.push(...(p.executives || []).map(normalizeExecutive));
  }
  return {
    profile, sources,
    financings: mergeRows(financings, f => financingKey(0, f), ['finance_enterprise']),
    news: mergeRows(news, n => newsKey(0, n)),
    executives: mergeRows(executives, e => executiveKey(0, e), ['title', 'description']),
  };
}
