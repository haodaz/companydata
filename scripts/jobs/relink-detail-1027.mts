/**
 * 岗位链接不是详情页（数据部门周赞灵 10-27 #52：很多链接是「全部在招岗位」页，按岗位名搜不到）。
 * 对象：同一个链接挂了 ≥ 2 个岗位的（列表页 / 被错挂到别家详情页），以及链接打得开但页面里找不到岗位名的（suspect）。审核已定论、人工锁定 link 的不动。
 * 每个链接用本机 Chrome 打开一次，取页面里的「文字 → 链接」，按岗位名找它自己的详情链接：
 *   - 找到且不是当前链接 → 换成详情链接，link_status 清空待重新检测，link_issue 记「已从列表页找回详情链接」
 *   - 找不到 → link_issue 记「列表页，未找到该岗位详情」，留给人工 / 外采篮
 * 不调大模型。  npx tsx scripts/jobs/relink-detail-1027.mts [--limit 链接数] [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { renderMarkdown, localRenderAvailable } = await import('@/lib/agents/local-render');
const { FROZEN_REVIEW_STATUSES } = await import('@/lib/review-status');
const { atsOf, hotjobMarkdown, beisenMarkdown, siteAdapterMarkdown, siteKey } = await import('@/lib/agents/ats-adapters');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = Number(opt('limit', '0')), APPLY = process.argv.includes('--apply'), HOST = opt('host');   // --host hotjob.cn：只跑这类站
if (!localRenderAvailable()) { console.error('本机 Chrome 不可用'); process.exit(1); }

const { data } = await selectAll(() => db.from('jobs').select('id, name, link, link_status, human_review_status, human_locked_fields').not('if_delete', 'is', true).order('id'));
const count = new Map<string, number>(); for (const j of data as any[]) if (j.link) count.set(j.link, (count.get(j.link) || 0) + 1);
const todo = (data as any[]).filter(j => j.link && !FROZEN_REVIEW_STATUSES.has(j.human_review_status || '') && !(j.human_locked_fields || []).includes('link') && (count.get(j.link)! >= 2 || j.link_status === 'suspect'));
const groups = new Map<string, any[]>(); for (const j of todo) groups.set(j.link, [...(groups.get(j.link) || []), j]);
let links = [...groups.keys()].filter(u => !HOST || u.includes(HOST)); if (LIMIT) links = links.slice(0, LIMIT);
console.log(`待处理岗位 ${todo.length}，链接 ${groups.size}${LIMIT ? `（这次 ${links.length} 个）` : ''}`);

/**
 * 拿「岗位名 → 详情链接」：hotjob / 北森走它们前端用的公开明文接口（ats-adapters，每个岗位带自己的详情链接）；
 * 有专门适配的站点（vivo、好未来）用适配；其余本机 Chrome 渲染。moka 接口是加密的，不破解，走渲染。
 * 同一个站点只取一次（一个站点的很多列表链接是同一份岗位）。
 */
const siteCache = new Map<string, string | null>();
async function pageOf(url: string): Promise<string | null> {
  const ats = atsOf(url), key = ats === 'hotjob' || ats === 'beisen' ? siteKey(url) : url;
  if (siteCache.has(key)) return siteCache.get(key)!;
  let md: string | null = null;
  try {
    if (ats === 'hotjob') md = (await hotjobMarkdown(url, 'all'))?.markdown || null;
    else if (ats === 'beisen') md = (await beisenMarkdown(url, 'all'))?.markdown || null;
    else md = (await siteAdapterMarkdown(url))?.markdown || await renderMarkdown(url);
  } catch { md = null; }
  siteCache.set(key, md);
  return md;
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[（(][^）)]*[）)]/g, '').replace(/[\s\-–—_·|/、，,。.:：【】\[\]]+/g, '');
let found = 0, missed = 0, failed = 0, confirmed = 0;
for (const [n, link] of links.entries()) {
  const jobs = groups.get(link)!;
  const md = await pageOf(link);
  if (!md) { failed += jobs.length; console.log(`[${n + 1}] ✗ 打不开 ${link}`); continue; }
  const anchors: { t: string; u: string }[] = [];
  for (const m of md.matchAll(/\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g)) anchors.push({ t: norm(m[1]), u: m[2] });
  const hits: { id: number; u: string }[] = [], miss: number[] = [], same: number[] = [];
  for (const j of jobs) {
    const k = norm(j.name);
    // 站点上同名的有好几个（不同城市 / 批次）就分不清是哪一个，不换
    const exact = [...new Set(anchors.filter(x => x.t === k).map(x => x.u))];
    const near = [...new Set(anchors.filter(x => x.t.startsWith(k) && x.t.length <= k.length + 12).map(x => x.u))];
    const pick = exact.length ? exact : near;
    const a = k.length >= 2 && pick.length === 1 ? { u: pick[0] } : (pick.includes(link) ? { u: link } : null);
    // 找到的就是它现在的链接：本来就是详情页（多是 hotjob 这类渲染不出岗位名、被误判「找不到」的），确认一下
    if (a && a.u === link && count.get(link) === 1) same.push(j.id);
    else if (a && a.u !== link) hits.push({ id: j.id, u: a.u }); else miss.push(j.id);
  }
  // 同一个详情链接被找给了好几个岗位 = 没分清（同名岗位），这几个不换
  const dup = new Map<string, number>(); for (const h of hits) dup.set(h.u, (dup.get(h.u) || 0) + 1);
  const good = hits.filter(h => dup.get(h.u) === 1); miss.push(...hits.filter(h => dup.get(h.u)! > 1).map(h => h.id));
  found += good.length; missed += miss.length; confirmed += same.length;
  console.log(`[${n + 1}/${links.length}] ${jobs.length} 个岗位 → 找回 ${good.length}，确认本来就是详情页 ${same.length}，没找到 ${miss.length}  ${link.slice(0, 90)}`);
  if (APPLY) {
    for (const h of good) await db.from('jobs').update({ link: h.u, link_status: null, link_issue: '已从列表页找回详情链接', link_checked_at: null }).eq('id', h.id);
    if (same.length) await db.from('jobs').update({ link_status: 'ok', link_issue: '招聘平台接口确认是该岗位详情页', link_checked_at: new Date().toISOString() }).in('id', same);
    for (let i = 0; i < miss.length; i += 200) await db.from('jobs').update({ link_issue: '列表页，未找到该岗位详情' }).in('id', miss.slice(i, i + 200));
  }
}
console.log(`\n找回 ${found}，确认本来就是详情页 ${confirmed}，没找到 ${missed}，打不开 ${failed}`);
