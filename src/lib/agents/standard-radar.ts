/**
 * 行业标准与操作规程获取 Agent（服务端，迁移 022）
 *   searchStandards — 按职业 / 工序 / 设备联网检索相关的国标、行标、团标、企业规程、国际标准、法规
 *   enrichStandard  — 抓官方题录页补题录（号、名称、单位、状态、日期），再把操作要求转述成「要点」
 * 版权口径：要点是转述（每条一句，自己的话），不抄原文；全文给官方链接。只返回找到的值，入库交给 standard-store。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose, searchJson } from '@/lib/agents/search-llm';
import { fetchJinaUrl } from '@/lib/agents/fetcher';
import { POINT_KIND_LABELS, STANDARD_DOC_TYPE_LABELS, STANDARD_FIELDS, STANDARD_KIND_LABELS, STANDARD_STATUS_LABELS, normalizeCode, sanitizeStandard } from '@/lib/standard-fields';

const TOOL = 'standard-radar' as const;

export interface StdParams { query: string; profession?: string | null; industry?: string | null; kinds?: string[]; docTypes?: string[]; count?: number }
export interface StdCandidate { code: string | null; title: string; issuer: string | null; kind: string | null; doc_type: string | null; status: string | null; official_url: string | null; why: string | null; source_url: string | null }

const today = () => new Date().toISOString().slice(0, 10);
const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const url = (v: any) => { const s = str(v); return s && /^https?:\/\//i.test(s) ? s : null; };

const OFFICIAL_SITES = `Authoritative sources to prefer (题录 / 全文):
- 全国标准信息公共服务平台 std.samr.gov.cn（国标、行标、地标、团标题录与状态）
- 国家标准全文公开系统 openstd.samr.gov.cn（国标全文公开）
- 行业标准信息服务平台 hbba.sacinfo.org.cn；地方标准 dbba.sacinfo.org.cn；全国团体标准信息平台 ttbz.org.cn
- 行业主管部门官网：应急管理部（AQ 安全标准）、国家能源局 / 中电联（DL/T 电力）、交通运输部（JTG 公路）、国家卫健委（WS 卫生）、国家药监局（YY 医疗器械）、工信部、农业农村部（NY/T）、文旅部（WH/T）、国防科工局（QJ 航天）
- 国际：iso.org、iec.ch、ieee.org、ul.com、nfpa.org、PADI / RSTC（潜水）、WHO 手术安全核查表等
- 操作手册：设备 / 仪器厂商官网的产品文档、下载中心、技术支持页（如 西门子、施耐德、ABB、徐工、中联、维特根 Vögele、La Marzocco、迈瑞、美敦力、Keysight、Synopsys / Cadence 文档门户），不要用文库 / 网盘转载`;

// ────────────────────────────────────────────
// 1. 检索候选
// ────────────────────────────────────────────
export async function searchStandards(p: StdParams, modelId: string, batchId: number) {
  const kinds = (p.kinds || []).filter(k => k in STANDARD_KIND_LABELS);
  const docTypes = (p.docTypes || []).filter(k => k in STANDARD_DOC_TYPE_LABELS);
  const prompt = `
You are building a library of industry standards and operating procedures (行业标准与操作规程库) for a vocational simulation platform. Every operating rule in a simulated workstation must be traceable to a real standard clause.

Today: ${today()}
Profession / job: ${p.profession || '(not given)'}
Industry: ${p.industry || '(infer from the profession)'}
Focus (process / equipment / scenario): ${p.query || '(the core daily operations of this job)'}
${kinds.length ? `Only these levels: ${kinds.map(k => `${k} = ${STANDARD_KIND_LABELS[k].label} (${STANDARD_KIND_LABELS[k].hint})`).join('; ')}` : `Levels: ${Object.entries(STANDARD_KIND_LABELS).map(([k, v]) => `${k} = ${v.label}`).join(', ')}`}
${docTypes.length ? `Only these document types: ${docTypes.map(k => `${k} = ${STANDARD_DOC_TYPE_LABELS[k].label}`).join(', ')}` : `Document types: ${Object.entries(STANDARD_DOC_TYPE_LABELS).map(([k, v]) => `${k} = ${v.label}`).join(', ')}`}

Find the standards / safety rules / operating procedures / construction codes / clinical guidelines that actually GOVERN how this job is done day to day:
equipment OPERATING MANUALS (设备操作手册 / 使用说明书 / 作业指导书 published by the equipment maker or the employer — doc_type "manual", kind "vendor"; give model numbers when known), safety rules for the equipment, process specifications with numeric windows (temperatures, pressures, times, tolerances), step-by-step operating procedures, inspection / acceptance criteria, PPE, emergency handling, professional service-quality norms. Prefer CURRENT (现行) versions; if an old one was replaced, return the new one.
${OFFICIAL_SITES}

Search in Chinese and English (e.g. "${p.profession || p.query} 安全规程 标准", "${p.profession || p.query} 操作规程 GB", "${p.query || p.profession} 技术规范 行业标准 现行").

Return up to ${p.count || 10} candidates as JSON:
{
  "candidates": [ { "code" (standard number exactly as published, e.g. "GB 26860-2011", "AQ 2001-2018", "JTG F40-2004"; null for un-numbered procedures), "title" (official name), "issuer", "kind" (one of ${Object.keys(STANDARD_KIND_LABELS).join('|')}), "doc_type" (one of ${Object.keys(STANDARD_DOC_TYPE_LABELS).join('|')}), "status" (one of ${Object.keys(STANDARD_STATUS_LABELS).join('|')}), "official_url" (official catalogue / full-text page if found), "why" (中文一句：它管到这个岗位的哪些操作), "source_url" } ],
  "summary": "3–5 sentences in Chinese: what you searched, which standards are the backbone for this job, what could not be confirmed"
}
Rules: only real standards you actually found; never invent codes or years — use null; do not include generic management-system standards (ISO 9001 etc.) unless they directly govern the job's operations.
`;
  const { parsed, searchQueries } = await searchJson(prompt, modelId, { tool_name: TOOL, task_name: 'Search Standards', institution: p.profession || p.query, batch_id: batchId });
  const candidates: StdCandidate[] = (Array.isArray(parsed.candidates) ? parsed.candidates : []).map((c: any) => ({
    code: normalizeCode(c.code), title: str(c.title) || '', issuer: str(c.issuer),
    kind: str(c.kind) && c.kind in STANDARD_KIND_LABELS ? c.kind : null, doc_type: str(c.doc_type) && c.doc_type in STANDARD_DOC_TYPE_LABELS ? c.doc_type : null,
    status: str(c.status) && c.status in STANDARD_STATUS_LABELS ? c.status : null, official_url: url(c.official_url), why: str(c.why), source_url: url(c.source_url),
  })).filter((c: StdCandidate) => c.title);
  return { candidates, summary: str(parsed.summary), searchQueries, raw: parsed };
}

// ────────────────────────────────────────────
// 2. 抓官方页 + 补题录与要点
// ────────────────────────────────────────────
const PAGE_CAP = 40000;
const SCHEMA = STANDARD_FIELDS.filter(f => !['note', 'tags', 'key_points'].includes(f.key)).map(f => `  "${f.key}": ${f.kind === 'tags' ? '[string]' : f.kind === 'bool' ? 'boolean|null' : 'string|null'}${f.enum ? ` // one of ${Object.keys(f.enum).join('|')}` : ''}${f.desc ? ` // ${f.desc}` : ''}`).join('\n');
const POINTS_RULE = `"key_points": up to 10 items [{ "clause": "条款号 like 5.2.3 or null", "kind": one of ${Object.keys(POINT_KIND_LABELS).join('|')}, "point": "中文一句，用自己的话转述这一条对操作的要求，带上关键数值（温度 / 压力 / 时间 / 距离 / 次数）" }].
Focus on requirements a person performs or checks on the job (steps, numeric limits / windows, prohibitions, confirmations, PPE, emergency actions).
COPYRIGHT: paraphrase in your own words, one sentence each, at most 60 Chinese characters; never copy clause text verbatim.`;

export async function enrichStandard(c: StdCandidate, ctx: { profession?: string | null; industry?: string | null }, modelId: string, batchId: number) {
  const target = c.official_url || c.source_url;
  let markdown = '';
  if (target) markdown = ((await fetchJinaUrl(target)) || '').trim().slice(0, PAGE_CAP);
  const pageOk = markdown.length > 300;
  const base = `Standard: ${c.code ? `${c.code} ` : ''}${c.title}${c.issuer ? ` · ${c.issuer}` : ''}
Profession it should serve: ${ctx.profession || '(general)'}${ctx.industry ? ` · industry ${ctx.industry}` : ''}
Known from search: ${JSON.stringify({ kind: c.kind, doc_type: c.doc_type, status: c.status, why: c.why })}`;
  const tail = `
Return ONLY a JSON object:
{
${SCHEMA}
  ${POINTS_RULE}
  "page_matches": boolean, // only for page mode: true if the page is about this same standard
  "sources": { "<field>": "<url>" },
  "summary": "2–4 sentences in Chinese: what was confirmed (code / status / dates), where the key points come from, what is missing"
}
All free text in Chinese. "operation_relevance": which operations of the profession this standard constrains. "professions": 2–6 job titles it applies to (中文). null when unknown; never invent codes, dates or numbers.`;

  let parsed: any, mode: 'page' | 'search' = pageOk ? 'page' : 'search', mismatch = false, searchQueries: string[] = [];
  if (pageOk) {
    const res = await generateContent(`You extract a standard's catalogue data and operating key points. Use the OFFICIAL page below first; where the page lacks the key points (catalogue pages often do), use your knowledge of this standard's content but keep numbers only if you are confident.\n\n${base}\n${tail}\n\nPage Markdown:\n${markdown}`, modelId, { jsonMode: true, fast: true });
    await logTokenUsage({ tool_name: TOOL, task_name: 'Extract Standard Page', institution: c.code || c.title, model_id: modelId, usageMetadata: res.usageMetadata, batch_id: batchId }).catch(() => {});
    parsed = parseJsonLoose(res.text);
    if (parsed?.page_matches === false) { mismatch = true; mode = 'search'; }
  }
  if (mode === 'search') {
    const r = await searchJson(`Use web search to confirm this standard's catalogue data (code, official title, issuer, status 现行/废止/被代替, publish / implement dates, what replaced it) and its key operating requirements.${mismatch ? ` The URL ${target} was a DIFFERENT document; do not reuse it.` : ''}\n${OFFICIAL_SITES}\n\n${base}\n${tail}`, modelId, { tool_name: TOOL, task_name: 'Search Standard Detail', institution: c.code || c.title, batch_id: batchId });
    parsed = r.parsed; searchQueries = r.searchQueries;
  }
  const fields = sanitizeStandard({ code: c.code, title: c.title, issuer: c.issuer, kind: c.kind, doc_type: c.doc_type, status: c.status, official_url: mismatch ? null : c.official_url, source_url: c.source_url, ...Object.fromEntries(Object.entries(parsed || {}).filter(([, v]) => v !== null && v !== undefined)) });
  if (!fields.title) fields.title = c.title;
  if (!fields.code && c.code) fields.code = c.code;
  return {
    fields,
    sources: parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
    summary: str(parsed?.summary),
    page: { url: target, ok: pageOk, len: markdown.length, markdown, mismatch },
    mode, mismatch, searchQueries,
  };
}

// ────────────────────────────────────────────
// 3. 答题人模式（scripts/agent-research.mts 的 standards 步骤）：一题里同时「找」和「补全」——
//    由能自己联网检索的 agent 作答（不调大模型接口），找到的每条标准直接给完整题录 + 转述要点，写库走 upsertStandards
// ────────────────────────────────────────────
export function buildAgentStandardsPrompt(o: { name: string; aliases?: string[] | null; intro?: string | null; responsibility?: string | null; places?: string[]; items?: string[] }, count = 8) {
  return `
你在给职业知识图谱的「行业标准与操作规程库」找资料：一个职业日常怎么干活，要能追到真实的标准条款、规程、操作手册上。今天是 ${today()}。
职业：${o.name}${o.aliases?.length ? `（也叫：${o.aliases.slice(0, 6).join('、')}）` : ''}
${o.intro ? `简介：${o.intro}\n` : ''}${o.responsibility ? `工作内容：${String(o.responsibility).slice(0, 500)}\n` : ''}${o.places?.length ? `工作场所：${o.places.slice(0, 8).join('、')}\n` : ''}${o.items?.length ? `常用仪器设备 / 软件：${o.items.slice(0, 25).join('、')}\n` : ''}
找真正约束这个职业日常操作的（最多 ${count} 条，宁缺毋滥）：
- 国标 / 行标 / 地标 / 团标里管这些操作的安全规程、技术规范、工艺规范（带数值窗口：温度、压力、时间、公差）、检验验收标准、服务规范；
- 法规与主管部门规章（安全生产、职业卫生、行业准入）；
- **仪器设备的操作手册 / 使用说明书**：上面那些常用设备的厂商官方手册（doc_type "manual"，kind "vendor"，写清型号；只要厂商官网 / 文档中心的，不要文库 / 网盘转载）；
- 国际参考（kind "international"）：ISO / IEC / IEEE；美国劳工部 OSHA 法规（29 CFR 1910 通用行业、1926 建筑业，如 1910.147 上锁挂牌）、NIOSH、ANSI——只在它确实管到这个职业的操作时才列，国内标准优先。
${OFFICIAL_SITES}
- 美国：osha.gov（29 CFR 条文）、cdc.gov/niosh、ansi.org；O*NET（onetonline.org）只用来核对这个职业用哪些工具，它本身不是标准，不要列进来。

每条返回完整题录 + 要点，JSON：
{
  "standards": [ {
${SCHEMA.split('\n').map(l => '    ' + l).join('\n')}
    ${POINTS_RULE.replace(/\n/g, '\n    ')}
    "sources": { "<字段名>": "<你实际打开过的链接>" }
  } ],
  "summary": "中文 2–4 句：查了哪些地方、这一行的骨干标准是哪几条、哪些没查实"
}
规则：只列你这次真的查到的标准 / 手册，标准号和年份照官方原样写，查不到就 null，**绝不编号、编年份、编数值**；优先现行版本，被代替的写 replaced_by；
不要列通用管理体系标准（ISO 9001 之类）除非它直接管操作；要点用自己的话转述，不抄原文；professions 里写上「${o.name}」。
`.trim();
}

export function parseAgentStandards(parsed: any) {
  const list = Array.isArray(parsed?.standards) ? parsed.standards : [];
  const rows: Record<string, any>[] = [];
  const sources: Record<string, Record<string, string>> = {};
  for (const s of list) {
    const r = sanitizeStandard(s || {});
    if (!r.title) continue;
    rows.push(r);
    const src = s?.sources && typeof s.sources === 'object' ? Object.fromEntries(Object.entries(s.sources).filter(([, v]) => typeof v === 'string' && /^https?:\/\//.test(v as string))) as Record<string, string> : {};
    sources[r.code || r.title] = src;
  }
  return { rows, sources, summary: str(parsed?.summary) };
}
