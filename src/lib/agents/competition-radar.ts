/**
 * 赛事雷达 Agent（服务端）
 *   searchCompetitions — 联网检索企业赛事候选（可按主办企业 / 类型 / 地域 / 奖励导向）
 *   enrichCompetition  — 抓官方页面原文，按 COMPETITION_FIELDS 提取完整字段；抓不到就联网补
 * 只返回找到的值；入库、去重交给 competition-store。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose, searchJson } from '@/lib/agents/search-llm';
import { fetchJinaUrl } from '@/lib/agents/fetcher';
import { COMPETITION_FIELDS, COMPETITION_KIND_LABELS, COMPETITION_LEVEL_LABELS, OFFER_TRACK_LABELS, REWARD_LABELS, SPONSOR_TIER_LABELS, sanitizeCompetition } from '@/lib/competition-fields';

const TOOL = 'competition-radar' as const;

/** 常驻信源：比赛平台的「正在进行」列表页，一页就是一批在报名的比赛。每次批量扫都直接抓，不靠搜索碰运气 */
export const PLATFORM_SOURCES: { name: string; url: string; region: 'china' | 'overseas' }[] = [
  { name: '阿里云天池', url: 'https://tianchi.aliyun.com/competition/activeList', region: 'china' },
  { name: '和鲸社区', url: 'https://www.heywhale.com/home/competition', region: 'china' },
  { name: 'DataFountain', url: 'https://www.datafountain.cn/competitions', region: 'china' },
  { name: '讯飞开放平台', url: 'https://challenge.xfyun.cn/', region: 'china' },
  { name: '百度飞桨 AI Studio', url: 'https://aistudio.baidu.com/competition', region: 'china' },
  { name: '华为云大赛', url: 'https://competition.huaweicloud.com/competitions', region: 'china' },
  { name: '魔搭 ModelScope', url: 'https://www.modelscope.cn/competition', region: 'china' },
  { name: '赛氪', url: 'https://www.saikr.com/vs', region: 'china' },
  { name: '牛客竞赛', url: 'https://ac.nowcoder.com/acm/contest/vip-index', region: 'china' },
  { name: '腾讯云开发者', url: 'https://cloud.tencent.com/developer/competition', region: 'china' },
  { name: 'Devpost', url: 'https://devpost.com/hackathons?status[]=open', region: 'overseas' },
  { name: 'Kaggle', url: 'https://www.kaggle.com/competitions', region: 'overseas' },
];

export interface RadarParams { query: string; company?: string | null; kinds?: string[]; region?: string; rewards?: string[]; onlyOpen?: boolean; count?: number }
export interface Candidate {
  name: string; organizer: string | null; official_url: string | null; registration_url: string | null; kind: string | null; level: string | null;
  brief: string | null; registration_deadline_str: string | null; status: string | null; prizes: string | null; reward_types: string[]; source_url: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const url = (v: any) => { const s = str(v); return s && /^https?:\/\//i.test(s) ? s : null; };
/** 按名称和来源标题的二字片段重合度挑最像的来源；一点都不像就不给 */
const grams = (s: string) => { const t = s.toLowerCase().replace(/[\s·•\-—_()（）【】\[\]「」“”"'：:，,!！|]/g, ''); const g = new Set<string>(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
function bestSource(name: string, sources: { title: string; url: string }[]) {
  const a = grams(name); let best: string | null = null, top = 0;
  for (const x of sources) { const b = grams(x.title); let n = 0; for (const g of a) if (b.has(g)) n++; const sc = a.size ? n / a.size : 0; if (sc > top) { top = sc; best = x.url; } }
  return top >= 0.35 ? best : null;
}

// ────────────────────────────────────────────
// 1. 检索候选
// ────────────────────────────────────────────
export async function searchCompetitions(p: RadarParams, modelId: string, batchId: number) {
  const kinds = (p.kinds || []).filter(k => k in COMPETITION_KIND_LABELS);
  const rewards = (p.rewards || []).filter(r => r in REWARD_LABELS);
  const regionLine = p.region === 'china' ? 'Focus on competitions open to students in mainland China (国内赛事优先，含大厂开发者大赛 / 校园赛 / 商业案例赛).'
    : p.region === 'overseas' ? 'Focus on global / overseas competitions that accept online participation from anywhere (Devpost, Kaggle, company-hosted global hackathons, MLH, etc.).'
    : 'Cover both mainland-China competitions and global online ones.';
  const rewardLine = rewards.length
    ? `PRIORITISE competitions whose rewards include: ${rewards.map(r => `${r} (${REWARD_LABELS[r].hint})`).join('; ')}. Drop candidates that clearly offer none of these.`
    : 'Any reward type is fine, but always record what the prizes are.';
  const prompt = `
You are a "competition radar" for university students in China (国内高校在校生 / 应届生 / 留学生). Use web search to find CURRENT company-hosted competitions.

Today: ${today()}
Search focus: ${p.query || '(none)'}${p.company ? `\nHost company (must be organised or sponsored by this company): ${p.company}` : ''}
${kinds.length ? `Competition kinds: ${kinds.map(k => `${k} = ${COMPETITION_KIND_LABELS[k].label}`).join(', ')}` : 'Competition kinds: hackathon, developer contest, business case competition, data / algorithm competition, campus innovation contest, design contest'}
${regionLine}
${rewardLine}
${p.onlyOpen !== false ? 'Include editions that are open for registration, upcoming, or whose status you cannot confirm yet (status "unknown" — a later step opens the page and verifies). Skip only editions that clearly ended.' : 'Include recent past editions too (they recur yearly).'}

Search in Chinese and English (e.g. "${p.company || p.query} 大赛 报名 ${new Date().getFullYear()}", "hackathon ${new Date().getFullYear()} prizes laptop", "校园 创新 大赛 offer 直通").
Sources to prefer: official competition sites, company campus-recruiting / developer portals, Devpost, Kaggle, 天池, 牛客, 掘金, MLH, university career sites.

Return up to ${p.count || 15} candidates as JSON:
{
  "candidates": [ { "name", "organizer", "official_url", "registration_url", "kind" (one of ${Object.keys(COMPETITION_KIND_LABELS).join('|')}), "level" (one of ${Object.keys(COMPETITION_LEVEL_LABELS).join('|')}), "brief" (1–2 sentences 中文), "registration_deadline_str" (YYYY-MM-DD if known), "status" (open|upcoming|closed|ended|unknown), "prizes" (中文 one line: 奖金 / 设备 / 实习 / offer), "reward_types" (array from ${Object.keys(REWARD_LABELS).join('|')}), "source_url" } ],
  "summary": 3–5 sentences in Chinese: what you searched, which candidates look most valuable for students (设备 / 奖金 / offer 角度), what could not be confirmed.
}
Rules: list EVERY relevant competition that appears in your search results — news articles, WeChat posts and portal listings count as evidence; do not drop a real competition just because details are missing. "source_url" = the search-result URL where you saw it; "official_url" only if you actually saw that URL, otherwise null. Never invent URLs, deadlines or prizes — use null.
`;
  // 千问：长英文提示词 + 一堆限制它会一个都不报（只写一段「未发现」），换成中文短提示词，宽进、补全那步再核实
  const zh = `今天是 ${today()}。联网搜索：${p.query || ''}${p.company ? `（主办或赞助企业：${p.company}）` : ''}
${p.region === 'overseas' ? '找面向全球、可以线上参加的比赛。' : '找面向国内高校学生（在校生 / 应届生）的比赛。'}${kinds.length ? `类型：${kinds.map(k => COMPETITION_KIND_LABELS[k].label).join('、')}。` : ''}${rewards.length ? `优先奖励里有：${rewards.map(r => `${REWARD_LABELS[r].label}（${REWARD_LABELS[r].hint}）`).join('；')}。` : ''}
把搜索结果里出现的企业 / 机构主办的比赛都列出来（新闻、公众号文章、赛事平台列表都算），最多 ${p.count || 15} 个；${p.onlyOpen !== false ? '明确已经结束的不要，报名状态不确定的标 unknown。' : '往届也可以。'}
只返回 JSON：
{"candidates":[{"name":"含年份 / 届次的完整名称","organizer","official_url","registration_url","kind":"${Object.keys(COMPETITION_KIND_LABELS).join('|')}","level":"${Object.keys(COMPETITION_LEVEL_LABELS).join('|')}","brief":"一两句中文","registration_deadline_str":"YYYY-MM-DD","status":"open|upcoming|closed|ended|unknown","prizes":"一行中文：奖金 / 设备 / 实习 / offer","reward_types":[${Object.keys(REWARD_LABELS).map(k => `"${k}"`).join(',')} 里选],"source_url":"你看到它的那条搜索结果的网址"}],"summary":"3–5 句中文：搜了什么、哪些最值得（设备 / 奖金 / offer）、哪些没法确认"}
不知道的字段填 null；网址、日期、奖品都不要编。`;
  const { parsed, searchQueries, sources } = await searchJson(modelId.startsWith('qwen') ? zh : prompt, modelId, { tool_name: TOOL, task_name: 'Search Competitions', institution: p.company || p.query, batch_id: batchId });
  const candidates: Candidate[] = (Array.isArray(parsed.candidates) ? parsed.candidates : []).map((c: any) => ({
    name: str(c.name) || '', organizer: str(c.organizer), official_url: url(c.official_url), registration_url: url(c.registration_url),
    kind: str(c.kind) && c.kind in COMPETITION_KIND_LABELS ? c.kind : null, level: str(c.level) && c.level in COMPETITION_LEVEL_LABELS ? c.level : null,
    brief: str(c.brief), registration_deadline_str: str(c.registration_deadline_str), status: str(c.status), prizes: str(c.prizes),
    reward_types: (Array.isArray(c.reward_types) ? c.reward_types : []).filter((r: any) => typeof r === 'string' && r in REWARD_LABELS), source_url: url(c.source_url),
  })).filter((c: Candidate) => c.name);
  // 千问附带了真实搜索来源时，拿它校对：不在来源里的网址当作编的丢掉，出处换成标题最像的那条来源
  if (sources.length) {
    const real = new Set(sources.map(x => x.url));
    for (const c of candidates) {
      if (c.official_url && !real.has(c.official_url)) c.official_url = null;
      if (c.registration_url && !real.has(c.registration_url)) c.registration_url = null;
      if (!c.source_url || !real.has(c.source_url)) c.source_url = bestSource(c.name, sources);
    }
  }
  return { candidates, summary: str(parsed.summary), searchQueries, sources, raw: parsed };
}

// ────────────────────────────────────────────
// 2. 抓官方页 + 提取完整字段
// ────────────────────────────────────────────
const PAGE_CAP = 45000;
const SCHEMA = COMPETITION_FIELDS.filter(f => !['note', 'tags'].includes(f.key)).map(f => `  "${f.key}": ${f.kind === 'tags' ? '[string]' : f.kind === 'bool' ? 'boolean|null' : f.kind === 'number' ? 'integer|null' : 'string|null'}${f.enum ? ` // one of ${Object.keys(f.enum).join('|')}` : ''}${f.desc ? ` // ${f.desc}` : ''}`).join('\n');
const FIELD_NOTES = `
Field notes:
- All free-text fields in Chinese (中文); names / URLs / tech names stay as-is. null when not stated. Never invent dates or prizes.
- "reward_types": array from ${Object.keys(REWARD_LABELS).map(k => `${k} (${REWARD_LABELS[k].hint})`).join(', ')}; "hardware_prize" true only if physical devices are awarded, and list them in "hardware_prize_detail".
- "offer_track": ${Object.entries(OFFER_TRACK_LABELS).map(([k, v]) => `${k} = ${v}`).join(', ')}; put the exact terms in "offer_track_detail".
- "sponsor_tier": ${Object.entries(SPONSOR_TIER_LABELS).map(([k, v]) => `${k} = ${v}`).join(', ')}.
- "status": open (registration ongoing as of ${today()}), upcoming, closed (deadline passed, event not finished), ended.
- "background_value": 1–2 sentences on how much this competition counts on a CV / for 保研 / 申研 / 校招. "fit_hint": who should apply and how to prepare.
- "sources": map field name → URL the value came from.
`;

export async function enrichCompetition(c: Candidate, modelId: string, batchId: number) {
  const target = c.official_url || c.registration_url || c.source_url;
  let markdown = '';
  if (target) {
    const md = await fetchJinaUrl(target);
    markdown = (md || '').trim().slice(0, PAGE_CAP);
  }
  const pageOk = markdown.length > 400;
  const base = `Competition: ${c.name}${c.organizer ? ` · ${c.organizer}` : ''}${target ? `\nOfficial page: ${target}` : ''}\nKnown from search: ${JSON.stringify({ kind: c.kind, level: c.level, brief: c.brief, deadline: c.registration_deadline_str, prizes: c.prizes, reward_types: c.reward_types })}`;

  let parsed: any;
  let usage: any;
  let searchQueries: string[] = [];
  let mode: 'page' | 'search' = pageOk ? 'page' : 'search';
  let mismatch = false;
  if (pageOk) {
    const prompt = `
You are a data extraction engine. Extract this competition's details from its OFFICIAL page Markdown below. Prefer the page over the "known from search" hints; use hints only for fields the page does not state.

${base}

Return ONLY a JSON object:
{
${SCHEMA}
  "page_matches": boolean, // true only if this page is about the SAME competition as "Competition" above (same name / edition); false if it is a different contest or a generic listing page
  "sources": { "<field>": "<url>" },
  "summary": "3–5 sentences in Chinese: what the page contains, what was extracted, what is missing"
}
${FIELD_NOTES}
If "page_matches" is false, still fill "page_matches": false and leave the other fields null.
Markdown:
${markdown}
`;
    const res = await generateContent(prompt, modelId, { jsonMode: true, fast: true });
    usage = res.usageMetadata;
    await logTokenUsage({ tool_name: TOOL, task_name: 'Extract Competition Page', institution: c.name, model_id: modelId, usageMetadata: usage, batch_id: batchId }).catch(() => {});
    parsed = parseJsonLoose(res.text);
    if (parsed?.page_matches === false) { mismatch = true; mode = 'search'; }
  }
  if (mode === 'search') {
    const prompt = `
Use web search to collect full details of this competition (${mismatch ? `the URL ${target} turned out to be a DIFFERENT contest — find the correct official page and do not reuse that URL` : 'the official page could not be fetched'}).

${base}

Return ONLY a JSON object:
{
${SCHEMA}
  "sources": { "<field>": "<url>" },
  "summary": "3–5 sentences in Chinese: which sources you used and what could not be confirmed"
}
${FIELD_NOTES}
Rules: only report values you actually found; null otherwise.
`;
    const r = await searchJson(prompt, modelId, { tool_name: TOOL, task_name: 'Search Competition Detail', institution: c.name, batch_id: batchId });
    parsed = r.parsed; searchQueries = r.searchQueries;
  }

  const base_c = mismatch ? { ...c, official_url: null, registration_url: null } : c;
  const fields = sanitizeCompetition({ ...base_c, ...parsed });
  if (!fields.name) fields.name = c.name;
  if (!fields.official_url && !mismatch) fields.official_url = c.official_url;
  if (!fields.registration_url && !mismatch) fields.registration_url = c.registration_url;
  return {
    fields,
    sources: parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
    summary: str(parsed?.summary),
    page: { url: target, ok: pageOk, len: markdown.length, markdown, mismatch },
    mode, mismatch,
    searchQueries,
    raw: parsed,
  };
}

// ────────────────────────────────────────────
// 3. 处理信息：从一页原文里抽比赛（找信源 → 爬网站 → 处理信息 分开跑时用）
//    一页可能是单个赛事页，也可能是公众号汇总 / 赛事平台列表，里面有好几个比赛
// ────────────────────────────────────────────
export async function extractCompetitionsFromPage(page: { url: string; title?: string; markdown: string }, ctx: { query?: string; company?: string | null; onlyOpen?: boolean }, modelId: string, batchId: number) {
  const prompt = `
今天是 ${today()}。下面是一页网页原文（${page.url}${page.title ? ` · ${page.title}` : ''}），是检索「${ctx.query || ''}${ctx.company ? ` · ${ctx.company}` : ''}」时找到的。
把页面里写到的、面向学生（在校生 / 应届生 / 青年开发者）的比赛都抽出来：黑客松、开发者大赛、算法 / 数据赛、商业案例赛、创新创业赛、设计赛、学术赛。
${ctx.onlyOpen !== false ? '页面明确写了已经结束的比赛不要。' : ''}培训课、招聘会、普通活动、纯广告不算比赛。只抽页面上写着的，不要补页面没有的信息。
"official_url" / "registration_url"：页面里出现的该比赛官网 / 报名链接；这一页本身就是该比赛的官方页就填 ${page.url}；都没有填 null。

只返回 JSON：
{
  "competitions": [ {
${SCHEMA}
  } ]
}
${FIELD_NOTES}
页面原文：
${page.markdown.slice(0, PAGE_CAP)}
`;
  const res = await generateContent(prompt, modelId, { jsonMode: true, fast: true });
  await logTokenUsage({ tool_name: TOOL, task_name: 'Extract Competitions From Page', institution: ctx.company || ctx.query || '', model_id: res.model || modelId, usageMetadata: res.usageMetadata, batch_id: batchId }).catch(() => {});
  const list: any[] = parseJsonLoose(res.text)?.competitions || [];
  return list.map(c => {
    const f = sanitizeCompetition(c);
    // 链接只认这一页原文里真出现过的（或这一页本身），模型自己拼的不要
    for (const k of ['official_url', 'registration_url'] as const) if (f[k] && f[k] !== page.url && !page.markdown.includes(String(f[k]).replace(/\/$/, ''))) f[k] = null;
    return { fields: f, sources: Object.fromEntries(Object.keys(f).filter(k => f[k] != null).map(k => [k, page.url])) };
  }).filter(x => x.fields.name)
    // 只要能报名的：已截止 / 已结束的不要（提示词里说了模型也常照抽）
    .filter(x => ctx.onlyOpen === false || !['closed', 'ended'].includes(x.fields.status))
    // 校内选拔赛不是企业赛事（全国赛本身留着）
    .filter(x => x.fields.level !== 'campus' && !/校级|校内|选拔赛|校赛/.test(x.fields.name));
}
