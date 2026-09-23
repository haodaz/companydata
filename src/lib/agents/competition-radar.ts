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

export interface RadarParams { query: string; company?: string | null; kinds?: string[]; region?: string; rewards?: string[]; onlyOpen?: boolean; count?: number }
export interface Candidate {
  name: string; organizer: string | null; official_url: string | null; registration_url: string | null; kind: string | null; level: string | null;
  brief: string | null; registration_deadline_str: string | null; status: string | null; prizes: string | null; reward_types: string[]; source_url: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const url = (v: any) => { const s = str(v); return s && /^https?:\/\//i.test(s) ? s : null; };

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
${p.onlyOpen !== false ? 'Only include editions that are still open for registration or upcoming (deadline on/after today), or whose next edition is announced. Skip ended editions.' : 'Include recent past editions too (they recur yearly).'}

Search in Chinese and English (e.g. "${p.company || p.query} 大赛 报名 ${new Date().getFullYear()}", "hackathon ${new Date().getFullYear()} prizes laptop", "校园 创新 大赛 offer 直通").
Sources to prefer: official competition sites, company campus-recruiting / developer portals, Devpost, Kaggle, 天池, 牛客, 掘金, MLH, university career sites.

Return up to ${p.count || 15} candidates as JSON:
{
  "candidates": [ { "name", "organizer", "official_url", "registration_url", "kind" (one of ${Object.keys(COMPETITION_KIND_LABELS).join('|')}), "level" (one of ${Object.keys(COMPETITION_LEVEL_LABELS).join('|')}), "brief" (1–2 sentences 中文), "registration_deadline_str" (YYYY-MM-DD if known), "status" (open|upcoming|closed|ended|unknown), "prizes" (中文 one line: 奖金 / 设备 / 实习 / offer), "reward_types" (array from ${Object.keys(REWARD_LABELS).join('|')}), "source_url" } ],
  "summary": 3–5 sentences in Chinese: what you searched, which candidates look most valuable for students (设备 / 奖金 / offer 角度), what could not be confirmed.
}
Rules: only real competitions you actually found; official_url must be the competition's own page (not a news article) when available; never invent deadlines or prizes — use null.
`;
  const { parsed, searchQueries } = await searchJson(prompt, modelId, { tool_name: TOOL, task_name: 'Search Competitions', institution: p.company || p.query, batch_id: batchId });
  const candidates: Candidate[] = (Array.isArray(parsed.candidates) ? parsed.candidates : []).map((c: any) => ({
    name: str(c.name) || '', organizer: str(c.organizer), official_url: url(c.official_url), registration_url: url(c.registration_url),
    kind: str(c.kind) && c.kind in COMPETITION_KIND_LABELS ? c.kind : null, level: str(c.level) && c.level in COMPETITION_LEVEL_LABELS ? c.level : null,
    brief: str(c.brief), registration_deadline_str: str(c.registration_deadline_str), status: str(c.status), prizes: str(c.prizes),
    reward_types: (Array.isArray(c.reward_types) ? c.reward_types : []).filter((r: any) => typeof r === 'string' && r in REWARD_LABELS), source_url: url(c.source_url),
  })).filter((c: Candidate) => c.name);
  return { candidates, summary: str(parsed.summary), searchQueries, raw: parsed };
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
