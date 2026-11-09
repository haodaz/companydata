/**
 * /invest 接 datasquare 的人才关系：只做查人和找路径，只读，不做图谱展示（用户 11-09）。
 * 节点和边全量读一次缓存 10 分钟，路径在服务端算好，前端只拿结果。家庭关系也算（用户 11-09 确认要）。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cachedStats } from '@/lib/db-stats';

type Node = { id: number; node_key: string; name_cn: string | null; name_en: string | null; institution: string | null; kind: string | null; research_fields: string[] | null; h_index: number | null };
type Edge = { id: number; source_node_id: number; target_node_id: number; relation_type: string };
const META: Record<string, { label: string; weight: number }> = {
  co_author: { label: '论文合著', weight: 8 }, advisor: { label: '师生', weight: 10 }, student: { label: '师生', weight: 10 }, project: { label: '项目合作', weight: 6 }, colleague: { label: '同事', weight: 5 },
  alumni: { label: '校友', weight: 3 }, same_org: { label: '同机构', weight: 2 }, affiliated_institution: { label: '任职 / 就读', weight: 2 }, affiliated_company: { label: '任职于企业', weight: 2 }, member_of: { label: '成员', weight: 4 }, part_of: { label: '隶属', weight: 3 },
  spouse: { label: '配偶', weight: 14 }, parent: { label: '父母子女', weight: 13 }, grandparent: { label: '祖辈', weight: 12 }, sibling: { label: '兄弟姐妹', weight: 11 },
  co_founder: { label: '联合创办', weight: 9 }, business_partner: { label: '商业伙伴', weight: 6 }, investor: { label: '投资', weight: 6 }, same_company: { label: '同企业', weight: 2 }, co_investor: { label: '联合投资', weight: 4 },
};
// 校友 / 同机构 / 同企业是由共同机构派生的两两边，不当路径的一跳；走「人 → 机构 ← 人」更明白
const PAIRWISE = new Set(['alumni', 'same_org', 'same_company']);
const HUB = new Set(['institution', 'company', 'organization']);
const MAX_DEPTH = 6;

let client: SupabaseClient | null = null;
function db() {
  const url = process.env.DATASQUARE_SUPABASE_URL, key = process.env.DATASQUARE_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('人才图谱还没接上（缺 DATASQUARE_SUPABASE_URL / DATASQUARE_SUPABASE_SERVICE_KEY）');
  return client ||= createClient(url, key, { auth: { persistSession: false } });
}
async function all<T>(table: string, cols: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(table).select(cols).order('id').range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}
const graph = () => cachedStats('invest:graph', async () => {
  const [nodes, edges0] = await Promise.all([all<Node>('talent_graph_nodes', 'id, node_key, name_cn, name_en, institution, kind, research_fields, h_index'), all<Edge>('talent_graph_edges', 'id, source_node_id, target_node_id, relation_type')]);
  const edges = edges0.filter(e => META[e.relation_type]);   // 系统关系（me_connection）不在 META 里，不要
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map<number, { to: number; type: string; edge: number }[]>();
  for (const e of edges) {
    if (PAIRWISE.has(e.relation_type)) continue;
    (adj.get(e.source_node_id) || adj.set(e.source_node_id, []).get(e.source_node_id)!).push({ to: e.target_node_id, type: e.relation_type, edge: e.id });
    (adj.get(e.target_node_id) || adj.set(e.target_node_id, []).get(e.target_node_id)!).push({ to: e.source_node_id, type: e.relation_type, edge: e.id });
  }
  return { nodes, byId, adj };
}, 600_000);

const nameOf = (n: Node) => n.name_cn || n.name_en || n.node_key;
const brief = (n: Node) => ({ id: n.id, name: nameOf(n), name_en: n.name_en && n.name_en !== n.name_cn ? n.name_en : undefined, institution: n.institution || undefined, type: HUB.has(n.kind || '') ? '机构' : '人', fields: n.research_fields?.slice(0, 4) });

function match(g: Awaited<ReturnType<typeof graph>>, q: string) {
  const k = q.trim().toLowerCase(); if (!k) return [];
  const hits = g.nodes.filter(n => (n.name_cn || '').toLowerCase().includes(k) || (n.name_en || '').toLowerCase().includes(k));
  const exact = hits.filter(n => (n.name_cn || '').toLowerCase() === k || (n.name_en || '').toLowerCase() === k);
  return exact.length ? exact : hits;
}

/** 查人：同名的分开列；只有一位时带上直接关系 */
export async function searchPerson(name: string) {
  const g = await graph(), hits = match(g, name).sort((a, b) => (g.adj.get(b.id)?.length || 0) - (g.adj.get(a.id)?.length || 0));
  if (!hits.length) return { found: 0, people: [] };
  const people = hits.slice(0, 8).map(n => ({ ...brief(n), relations: g.adj.get(n.id)?.length || 0 }));
  if (hits.length > 1) return { found: hits.length, people };
  const seen = new Set<string>(), direct = [...(g.adj.get(hits[0].id) || [])].sort((a, b) => META[b.type].weight - META[a.type].weight).filter(r => { const k = `${r.to}|${META[r.type].label}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12).map(r => ({ who: nameOf(g.byId.get(r.to)!), institution: g.byId.get(r.to)!.institution || undefined, relation: META[r.type].label }));
  return { found: 1, people, direct };
}

type Path = { nodes: string[]; ids: number[]; steps: { from: string; to: string; relation: string; edge: number; evidence?: string }[]; depth: number; score: number; via_hub: boolean };
function shortest(g: Awaited<ReturnType<typeof graph>>, from: number, to: number, hubs: boolean, limit: number): Path[] {
  const parents = new Map<number, { prev: number; type: string; edge: number }[]>([[from, []]]);
  let frontier = [from], found = false;
  for (let d = 1; d <= MAX_DEPTH && !found && frontier.length; d++) {
    const next: number[] = [], fresh = new Set<number>();
    for (const u of frontier) for (const r of g.adj.get(u) || []) {
      if (!hubs && r.to !== to && HUB.has(g.byId.get(r.to)?.kind || '')) continue;
      if (!parents.has(r.to)) { parents.set(r.to, []); fresh.add(r.to); next.push(r.to); }
      if (fresh.has(r.to)) parents.get(r.to)!.push({ prev: u, type: r.type, edge: r.edge });
      if (r.to === to) found = true;
    }
    frontier = next;
  }
  if (!found) return [];
  const out: Path[] = [];
  const walk = (n: number, rev: { from: number; to: number; type: string; edge: number }[]) => {
    if (out.length >= 40) return;
    if (n === from) {
      const s = [...rev].reverse();
      out.push({ nodes: [from, ...s.map(x => x.to)].map(i => nameOf(g.byId.get(i)!)), ids: [from, ...s.map(x => x.to)], steps: s.map(x => ({ from: nameOf(g.byId.get(x.from)!), to: nameOf(g.byId.get(x.to)!), relation: META[x.type].label, edge: x.edge })), depth: s.length, score: s.reduce((a, x) => a + META[x.type].weight, 0), via_hub: s.slice(1).some(x => HUB.has(g.byId.get(x.from)?.kind || '')) });
      return;
    }
    for (const p of parents.get(n) || []) walk(p.prev, [...rev, { from: p.prev, to: n, type: p.type, edge: p.edge }]);
  };
  walk(to, []);
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** 找路径：先找只经过人的路径，再补经过共同机构的；名字对上多位时返回候选，让人选 */
export async function findPath(q: { from?: string; to?: string; from_id?: number; to_id?: number }) {
  const g = await graph();
  const pick = (id?: number, name?: string) => id && g.byId.has(id) ? [g.byId.get(id)!] : match(g, name || '');
  const a = pick(q.from_id, q.from), b = pick(q.to_id, q.to);
  if (!a.length || !b.length) return { status: 'not_found' as const, missing: [!a.length && (q.from || q.from_id), !b.length && (q.to || q.to_id)].filter(Boolean) };
  if (a.length > 1 || b.length > 1) return { status: 'ambiguous' as const, from: a.slice(0, 8).map(brief), to: b.slice(0, 8).map(brief) };
  if (a[0].id === b[0].id) return { status: 'same' as const };
  const people = shortest(g, a[0].id, b[0].id, false, 3), hub = shortest(g, a[0].id, b[0].id, true, 2).filter(p => p.via_hub);
  const paths = [...people, ...hub];
  if (!paths.length) return { status: 'no_path' as const, from: brief(a[0]), to: brief(b[0]) };
  const ids = [...new Set(paths.flatMap(p => p.steps.map(s => s.edge)))];
  const { data } = await db().from('talent_graph_edges').select('id, evidence').in('id', ids);
  const ev = new Map((data || []).map((e: any) => [e.id, Array.isArray(e.evidence) ? String(e.evidence[0] || '').slice(0, 140) : '']));
  for (const p of paths) for (const s of p.steps) s.evidence = ev.get(s.edge) || undefined;
  return { status: 'ok' as const, from: brief(a[0]), to: brief(b[0]), paths: paths.map(({ ids: _i, ...p }) => ({ ...p, steps: p.steps.map(({ edge: _e, ...s }) => s) })) };
}
