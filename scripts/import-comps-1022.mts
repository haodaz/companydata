/**
 * 把「平方对标分析 · 数据采集 TOP10」附录里的 10 家企业画像收进企业实体库（用户 10-22）。
 * 附录按企业工厂的画像结构整理：公司概况 / 融资历史 / 创始人与团队 / 核心产品 / 商业模式与客户 / 近 24 个月事件 / 风险 / 和平方 / 信息源，每条带来源链接。
 * 每家：照附录原文转成企业字段 + 四类子实体（不补原文没有的，「—」留空）→ 建一条画像日志 → applyProfileBundle（只填空字段、子实体按去重键合并、人工锁定不动）。
 * 「和平方」那段是内部对标结论，不进企业字段，只留在日志的 ai_summary 里。
 *   npx tsx scripts/import-comps-1022.mts --model qwen-plus --txt <PDF 抽出的全文> [--only Handshake] [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');
const { resolveCompanyId } = await import('@/lib/company-match');
const { ensureCompanyFloraId } = await import('@/lib/company-flora-id');
const { applyProfileBundle } = await import('@/lib/company-store');
const { PIPELINE_FIELDS, TYPE_LABEL_LABELS } = await import('@/lib/company-fields');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const APPLY = process.argv.includes('--apply'), ONLY = opt('only');
const SOURCE_DOC = '平方对标分析 · 数据采集 TOP10（内部讨论，2026-10-22）';

// 附录 A01–A10：编号 → 库里用的名字 / 英文名 / 官网（官网以附录为准，下面只是认人用）
const COMPS = [
  { code: 'A01', name: 'Handshake', name_en: 'Handshake' },
  { code: 'A02', name: 'Mercor', name_en: 'Mercor' },
  { code: 'A03', name: 'micro1', name_en: 'micro1' },
  { code: 'A04', name: 'Turing', name_en: 'Turing' },
  { code: 'A05', name: '光轮智能', name_en: 'Lightwheel' },
  { code: 'A06', name: 'Scale AI', name_en: 'Scale AI' },
  { code: 'A07', name: 'Surge AI', name_en: 'Surge AI' },
  { code: 'A08', name: 'XDOF', name_en: 'XDOF' },
  { code: 'A09', name: 'Mecka', name_en: 'Mecka' },
  { code: 'A10', name: 'microagi', name_en: 'microagi' },
];

const txt = fs.readFileSync(opt('txt'), 'utf8')
  .replace(/平方创想 VisionSquare · 2026-10-22 \d+ \/ 43\n?/g, '').replace(/平方对标分析 · 数据采集 TOP10 内部讨\n?论 不对外\n?/g, '');
const starts = COMPS.map(c => ({ ...c, at: txt.indexOf(`附录 ${c.code}`) }));
if (starts.some(s => s.at < 0)) { console.error('附录切不开：', starts.filter(s => s.at < 0).map(s => s.code)); process.exit(1); }

const PROFILE_KEYS = PIPELINE_FIELDS.filter(k => !['campus_overview', 'study_abroad_friendly', 'company_team_abroad_signal', 'school_company_coop_exp', 'benefits_package', 'candidate_reputation', 'company_evaluate', 'ai_comprehensive_evaluate', 'ai_admission_analysis', 'segment'].includes(k));

for (let i = 0; i < starts.length; i++) {
  const c = starts[i];
  if (ONLY && c.name !== ONLY && c.name_en !== ONLY) continue;
  const section = txt.slice(c.at, i + 1 < starts.length ? starts[i + 1].at : undefined).slice(0, 60000);
  const prompt = `下面是一份企业画像（「${SOURCE_DOC}」附录 ${c.code}，从 PDF 抽出的文字，表格被拆成了多行）。把它**照原文**转成企业库的结构化数据。
规则：只用这段原文；原文写「—」或没写的留 null；数字、日期、金额照原文；每个字段 / 子实体尽量带原文里给的来源链接（表格「来源」列多是域名，信息源列表里有完整网址，能对上就用完整网址）。
「08 和平方」是内部对标结论，不要写进任何企业字段，只放进 ai_summary。

企业：${c.name}（${c.name_en}）
原文：
${section}

只返回 JSON：
{
  "profile": { ${PROFILE_KEYS.map(k => `"${k}"`).join(', ')} },
  "financings": [ { "finance_round": "种子 / 天使 / A / B / C … / 战略 / 并购", "finance_amount": "原文金额（含币种）", "finance_enterprise": "领投与跟投，用 / 隔开", "valuation": "原文估值", "publish_date": "YYYY-MM 或 YYYY-MM-DD", "source_url": "" } ],
  "executives": [ { "name", "title", "description", "is_founder": true, "source_url" } ],
  "products": [ { "name", "category", "kind": "hardware|software|service|platform|other", "status": "on_sale|discontinued|unknown", "is_flagship": true, "description", "source_url" } ],
  "news": [ { "description": "一两句中文", "publish_date": "YYYY-MM", "kind": "financing|product|partnership|personnel|risk|ma|other", "source_url" } ],
  "sources": { "<profile 字段>": "<来源网址>" },
  "ai_summary": "和平方：……（照「08 和平方」原文）"
}
profile 说明：中文为主（专名 / 网址照原文）；one_sentence ≤ 30 字；introduction 3–5 句；company_scale 写员工规模文字；operating_revenue 写原文收入口径（含时间）；
country / city 用中文；continent 只能是 asia|europe|america|south_america|africa|oceania；info_founding_year 整数；
business_profile 写「商业模式与客户」要点；public_sentiment 写「风险与争议」要点；growth_signals 写近期增长信号；
type_label 只能从这些里选：${Object.keys(TYPE_LABEL_LABELS).join('|')}（估值超 10 亿美元的未上市公司是 unicorn_company）。`;
  const r = await generateContent(prompt, MODEL, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'company-profile', task_name: 'Import Comps 1022', institution: c.name, model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const bundle = parseJsonLoose(r.text) || {};
  // 估值并进融资金额说明（库里融资表没有估值列）
  bundle.financings = (bundle.financings || []).map((f: any) => ({ ...f, finance_amount: [f.finance_amount, f.valuation ? `估值 ${f.valuation}` : null].filter(Boolean).join('，') || null }));
  bundle.sources = { ...(bundle.sources || {}), _document: SOURCE_DOC };
  const p = bundle.profile || {};
  console.log(`\n== ${c.code} ${c.name}：官网 ${p.official_website || '—'}｜${p.city || '—'}｜成立 ${p.info_founding_year || '—'}｜融资 ${(bundle.financings || []).length}、团队 ${(bundle.executives || []).length}、产品 ${(bundle.products || []).length}、动态 ${(bundle.news || []).length}`);
  console.log(`   ${String(p.one_sentence || '').slice(0, 60)}`);

  // 认人：英文名 / 中文名 / 官网域名
  let id = await resolveCompanyId(c.name) || await resolveCompanyId(c.name_en);
  if (!id && p.official_website) {
    const host = (() => { try { return new URL(p.official_website).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    // 域名要完全一致：turing.com 不能配到 data-turing.com
    if (host) { const { data } = await db.from('companies').select('id, official_website').ilike('official_website', `%${host}%`).not('if_delete', 'is', true).limit(20); id = (data || []).find(x => { try { return new URL(x.official_website).hostname.replace(/^www\./, '') === host; } catch { return false; } })?.id || null; }
  }
  console.log(`   企业库：${id ? `已有 #${id}` : '新建'}`);
  if (!APPLY) continue;
  if (!id) {
    const { data, error } = await db.from('companies').insert({ name: c.name, name_en: c.name_en, official_website: p.official_website || null, country: p.country || null, source: ['对标分析'], human_review_status: 'review' }).select('id').single();
    if (error) { console.log(`   建档失败：${error.message}`); continue; }
    id = data.id; await ensureCompanyFloraId(data.id).catch(() => {});
  }
  const { data: log, error: le } = await db.from('company_crawl_logs').insert({
    company_id: id, company: c.name, status: 'success', model_id: MODEL, raw_markdown: section, markdown_len: section.length, pages_fetched: 1,
    structured_json: bundle, started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
  }).select('id').single();
  if (le) { console.log(`   日志失败：${le.message}`); continue; }
  const applied = await applyProfileBundle(log.id, id!, bundle);
  await db.from('company_crawl_logs').update({ pushed_to_db: true, fields_filled: applied.filled, financings_saved: applied.financings_saved, news_saved: applied.news_saved, executives_saved: applied.executives_saved, products_saved: applied.products_saved, completeness_before: applied.completeness_before, completeness_after: applied.completeness_after }).eq('id', log.id);
  console.log(`   写入：字段 ${applied.filled.length}，融资 ${applied.financings_saved}、动态 ${applied.news_saved}、团队 ${applied.executives_saved}、产品 ${applied.products_saved}；完整度 ${applied.completeness_before} → ${applied.completeness_after}`);
}
process.exit(0);
