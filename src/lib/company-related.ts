/**
 * 关联企业：不用大模型，纯靠库里已有字段做交集打分。
 *   industry   同行业（行业 / 细分行业相同）
 *   products   同类产品（核心产品的品类 / 技术关键词重合）
 *   investors  共同投资方（融资记录的投资方交集）
 *   people     关联人（管理团队里出现同一个人 → 母子公司 / 关联企业）
 *   local      同城同标签（城市相同且类型标签 / 自定义标签重合）
 * 前后端共用的纯函数；数据由 API 一次性拉出来喂进来。
 */
import { TYPE_LABEL_LABELS } from '@/lib/company-fields';

export interface RelatedInput {
  companies: { id: number; name: string; industry: string | null; sub_industry: string | null; city: string | null; type_label: string[] | null; tags: string[] | null; segment: string | null; completeness_score?: number | null }[];
  products: { company_id: number; category: string | null; tech_keywords: string[] | null }[];
  executives: { company_id: number; name: string }[];
  financings: { company_id: number; finance_enterprise: string | null }[];
}
export type RelationKind = 'industry' | 'products' | 'investors' | 'people' | 'local';
export interface RelatedCompany { id: number; name: string; industry: string | null; city: string | null; score: number; reasons: string[] }
export type RelatedResult = Record<RelationKind, RelatedCompany[]>;

export const RELATION_LABELS: Record<RelationKind, { label: string; desc: string; color: string }> = {
  industry: { label: '同行业', desc: '行业或细分行业相同', color: 'blue' },
  products: { label: '同类产品', desc: '核心产品的品类 / 技术关键词重合', color: 'purple' },
  investors: { label: '共同投资方', desc: '融资记录里有同一家投资机构', color: 'gold' },
  people: { label: '关联人', desc: '管理团队里出现同一个人，多为母子公司或关联企业', color: 'red' },
  local: { label: '同城同标签', desc: '同一城市且类型标签重合', color: 'cyan' },
};

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/\s+/g, '').replace(/[（(].*?[)）]/g, '').replace(/[，,。.;；:：、\-—_/&]/g, '');
const splitInvestors = (s: string | null) => (s || '').split(/[\/、,，;；]/).map(x => norm(x)).filter(x => x.length >= 2 && !/^(公开发行|未披露|不详|未知)$/.test(x));
/** 技术关键词去掉太泛的词 */
const GENERIC = new Set(['ai', '人工智能', '软件', '硬件', '互联网', '云计算', '大数据', 'saas', '平台', '技术', '服务', '系统', '数据', '智能', '解决方案']);
const kw = (s: string) => { const n = norm(s); return n && !GENERIC.has(n) ? n : ''; };

const labelText = (x: string) => TYPE_LABEL_LABELS[x] || x;

export function computeRelated(targetId: number, input: RelatedInput, limit = 8): RelatedResult {
  const me = input.companies.find(c => c.id === targetId);
  // 太普遍的标签（超过 20% 的企业都有，如整批导入的「高企名单」）不算关联依据
  const labelFreq = new Map<string, number>();
  for (const c of input.companies) for (const l of new Set([...(c.type_label || []), ...(c.tags || [])].map(norm).filter(Boolean))) labelFreq.set(l, (labelFreq.get(l) || 0) + 1);
  const common = new Set([...labelFreq.entries()].filter(([, n]) => n > input.companies.length * 0.2).map(([l]) => l));
  const labelsOf = (c: RelatedInput['companies'][number]) => { const m = new Map<string, string>(); for (const l of [...(c.type_label || []), ...(c.tags || [])]) { const n = norm(l); if (n && !common.has(n)) m.set(n, labelText(l)); } return m; };
  const empty: RelatedResult = { industry: [], products: [], investors: [], people: [], local: [] };
  if (!me) return empty;

  const byCompany = <T extends { company_id: number }>(rows: T[]) => { const m = new Map<number, T[]>(); for (const r of rows) { if (!m.has(r.company_id)) m.set(r.company_id, []); m.get(r.company_id)!.push(r); } return m; };
  const prodMap = byCompany(input.products);
  const exeMap = byCompany(input.executives);
  const finMap = byCompany(input.financings);

  const myCats = new Set((prodMap.get(targetId) || []).map(p => norm(p.category)).filter(Boolean));
  const myKws = new Set((prodMap.get(targetId) || []).flatMap(p => (p.tech_keywords || []).map(kw)).filter(Boolean));
  const myExecs = new Set((exeMap.get(targetId) || []).map(e => norm(e.name)).filter(x => x.length >= 2));
  const myInvestors = new Set((finMap.get(targetId) || []).flatMap(f => splitInvestors(f.finance_enterprise)));
  const myLabels = labelsOf(me);
  const myInd = norm(me.industry), mySub = norm(me.sub_industry), myCity = norm(me.city);

  const out: RelatedResult = { industry: [], products: [], investors: [], people: [], local: [] };
  const push = (kind: RelationKind, c: RelatedInput['companies'][number], score: number, reasons: string[]) => {
    if (score <= 0) return;
    out[kind].push({ id: c.id, name: c.name, industry: c.industry, city: c.city, score: Math.round(score * 100) / 100, reasons });
  };

  for (const c of input.companies) {
    if (c.id === targetId) continue;
    // 同行业
    const ind = norm(c.industry), sub = norm(c.sub_industry);
    if (myInd && ind === myInd) {
      const sameSub = mySub && sub === mySub;
      push('industry', c, sameSub ? 2 : 1, [sameSub ? `同细分行业 · ${c.sub_industry}` : `同行业 · ${c.industry}`]);
    } else if (mySub && sub && sub === mySub) push('industry', c, 1.5, [`同细分行业 · ${c.sub_industry}`]);

    // 同类产品
    const ps = prodMap.get(c.id) || [];
    if (ps.length && (myCats.size || myKws.size)) {
      const cats = new Set(ps.map(p => norm(p.category)).filter(Boolean));
      const kws = new Set(ps.flatMap(p => (p.tech_keywords || []).map(kw)).filter(Boolean));
      const catHit = [...cats].filter(x => myCats.has(x));
      const kwHit = [...kws].filter(x => myKws.has(x));
      const score = catHit.length * 2 + kwHit.length * 0.5;
      if (score >= 1) push('products', c, score, [catHit.length ? `同品类 · ${catHit.slice(0, 3).join('、')}` : '', kwHit.length ? `技术重合 · ${kwHit.slice(0, 4).join('、')}` : ''].filter(Boolean));
    }

    // 共同投资方
    if (myInvestors.size) {
      const inv = new Set((finMap.get(c.id) || []).flatMap(f => splitInvestors(f.finance_enterprise)));
      const hit = [...inv].filter(x => myInvestors.has(x));
      if (hit.length) push('investors', c, hit.length, [`共同投资方 · ${hit.slice(0, 3).join('、')}`]);
    }

    // 关联人
    if (myExecs.size) {
      const hit = (exeMap.get(c.id) || []).map(e => norm(e.name)).filter(n => myExecs.has(n));
      if (hit.length) push('people', c, hit.length * 3, [`同一管理者 · ${Array.from(new Set(hit)).slice(0, 3).join('、')}`]);
    }

    // 同城同标签
    if (myCity && norm(c.city) === myCity && myLabels.size) {
      const labels = labelsOf(c);
      const hit = [...labels.keys()].filter(x => myLabels.has(x));
      if (hit.length) push('local', c, hit.length, [`同城 ${c.city} · ${hit.slice(0, 3).map(x => labels.get(x)).join('、')}`]);
    }
  }

  for (const k of Object.keys(out) as RelationKind[]) {
    out[k].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh'));
    out[k] = out[k].slice(0, limit);
  }
  return out;
}
