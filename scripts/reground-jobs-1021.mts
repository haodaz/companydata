/**
 * 疑似编造的岗位职责 / 要求重新对原文（数据部门 10-21：商汤算法工程师-SCG 的职责是模型编的）。
 * 名单 = reports/jd-grounding.json（audit-jd-grounding 按列表页原文查出来对不上的 2,495 条，是上限：有些是当时从详情页补进来的真内容）。
 * 每条：
 *   1. 打开岗位自己的详情页（招聘系统用本机 Chrome，其他 Jina，打不开再换另一个）
 *   2. 库里现有的职责 / 要求在详情页里找得到 → 是真的，不动（标记 grounded）
 *   3. 找不到 → 模型从详情页逐字照抄这个岗位的职责 / 要求；抄回来的和原文重合 ≥ 0.6 才写
 *   4. 对不上的分开处理（用户 10-21 选 C）：
 *      - 岗位名本身是大类（「研发类」「职能」「博士招聘」「CTP 专项」，宁德时代那种）→ 清掉、打「详情待补」
 *      - 具体岗位、只是链接指向总页面 / 列表页（美团「北斗」那种）→ 内容先留着、打「待核实」，人工确认是编的再清
 * 人工锁定的字段、审核已定论的岗位不动。
 *   npx tsx scripts/reground-jobs-1021.mts --model qwen-plus [--limit N] [--par 3] [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { fetchJinaUrl } = await import('@/lib/agents/fetcher');
const { renderMarkdown, localRenderAvailable } = await import('@/lib/agents/local-render');
const { generateContent } = await import('@/lib/llm-client');
const { parseJsonLoose } = await import('@/lib/agents/search-llm');
const { logTokenUsage } = await import('@/lib/token-logger');
const { isKnownModel } = await import('@/lib/model-options');
const { groundedRatio } = await import('@/lib/jd-grounding');
const { FROZEN_REVIEW_STATUSES } = await import('@/lib/review-status');

const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', '');
if (!MODEL || !isKnownModel(MODEL)) { console.error(`--model 要用模型选单里的（现在：${MODEL || '空'}）`); process.exit(1); }
const LIMIT = Number(opt('limit', '0')), PAR = Number(opt('par', '3')), APPLY = process.argv.includes('--apply');
const COPY_MIN = 0.6;
/** 岗位名是大类 / 项目名，不是具体岗位 */
const CATEGORY_NAME = /^(.{0,6}类|职能|技术|研发|产品|运营|市场|销售|设计|职能岗|管培生|博士招聘|博士后|.{0,8}专项|.{0,10}(校园)?招聘|.{0,10}多岗位|.{0,10}计划|.{0,8}岗位|.{0,6}方向)$/;   // 照抄回来的内容和详情页的重合度下限（真照抄接近 1）
const SPA = /(^|\.)(mokahr\.com|zhiye\.com|hotjob\.cn|feishu\.cn|jobs\.bytedance\.com|dayee\.com|myworkdayjobs\.com|italent\.cn|beisen\.com|job\.tal\.com|talent\.baidu\.com|campus\.jd\.com|careers\.tencent\.com|join\.qq\.com|zhaopin\.meituan\.com)$/i;

const ids = (JSON.parse(fs.readFileSync('reports/jd-grounding.json', 'utf8')).items as any[]).map(x => x.id);
const todo = LIMIT ? ids.slice(0, LIMIT) : ids;
console.log(`疑似编造 ${ids.length} 条，这次看 ${todo.length} 条，模型 ${MODEL}，并发 ${PAR}${APPLY ? '' : '（试跑不写库）'}`);

async function page(url: string) {
  let host = '';
  try { host = new URL(url).hostname; } catch { return ''; }
  const first = SPA.test(host) && localRenderAvailable() ? () => renderMarkdown(url) : () => fetchJinaUrl(url);
  const second = SPA.test(host) || !localRenderAvailable() ? () => fetchJinaUrl(url) : () => renderMarkdown(url);
  let md = (await first().catch(() => null)) || '';
  if (md.length < 300) md = (await second().catch(() => null)) || '';
  return md.split('\n## 页面链接')[0];
}

// 一个链接挂着 ≥ 3 个不同名岗位 = 总页面 / 列表页（美团北斗：页面上每个岗位只露一段愿景预告，照抄出来比原来的还差）
const { selectAll } = await import('@/lib/supabase-all');
const { data: allJobs } = await selectAll(() => db.from('jobs').select('name, link, source_url').not('if_delete', 'is', true).order('id'));
const namesByUrl = new Map<string, Set<string>>();
for (const x of allJobs as any[]) { const u = x.link || x.source_url; if (u) (namesByUrl.get(u) || namesByUrl.set(u, new Set()).get(u)!).add(x.name); }
const isLanding = (u?: string | null) => !!u && (namesByUrl.get(u)?.size || 0) >= 3;

const stat: Record<string, number> = {};
const samples: any[] = [];
let nx = 0, done = 0;
await Promise.all(Array.from({ length: PAR }, async () => {
  while (nx < todo.length) {
    const id = todo[nx++];
    const { data: j } = await db.from('jobs').select('id, name, institute_or_company_name, link, source_url, responsibilities, overview, collect_flags, human_locked_fields, human_review_status, ai_sources').eq('id', id).maybeSingle();
    let outcome = 'skip', patch: Record<string, any> | null = null, note = '';
    try {
      if (!j) outcome = 'gone';
      else if (FROZEN_REVIEW_STATUSES.has(j.human_review_status || '')) outcome = 'frozen';
      else {
        const locked = new Set<string>(j.human_locked_fields || []);
        const url = j.link || j.source_url;
        const md = url ? await page(url) : '';
        const fields = (['responsibilities', 'overview'] as const).filter(k => j[k] && !locked.has(k));
        if (!fields.length) outcome = 'locked';
        else if (md.length < 300) {
          // 打不开的：大类直接清；具体岗位先留着待核实（打不开不等于编的）
          const nm = String(j.name || '').replace(/[（(][^）)]*[）)]|\s/g, '');
          if (CATEGORY_NAME.test(nm)) { outcome = 'cleared_category'; note = '岗位名是大类、详情页也打不开'; patch = Object.fromEntries(fields.map(k => [k, null])); }
          else { outcome = 'kept_to_verify'; note = url ? '详情页打不开，原内容先留着待核实' : '没有详情链接，原内容先留着待核实'; patch = Object.fromEntries(fields.map(k => [k, j[k]])); }
        } else if (fields.every(k => groundedRatio(j[k], md) >= 0.35)) outcome = 'grounded';   // 现有内容在详情页里找得到：是真的
        else if (isLanding(url) && !CATEGORY_NAME.test(String(j.name || '').replace(/[（(][^）)]*[）)]|\s/g, ''))) {
          outcome = 'kept_to_verify'; note = '链接是总页面（挂了好几个岗位），原内容先留着待核实';
          patch = Object.fromEntries(fields.map(k => [k, j[k]]));
        } else {
          const r = await generateContent(`下面是「${j.institute_or_company_name || ''}」招聘页面的原文。找到岗位「${j.name}」，把它的岗位职责和任职要求从原文里**逐字照抄**出来（保留原来的分点和换行，不改写、不总结、不补充）。
只抄「岗位职责 / 工作内容」和「任职要求 / 岗位要求」这两段；公司介绍、团队介绍、愿景、项目介绍、福利待遇不要抄进来。
页面上没有这个岗位、或者没写职责 / 要求的，对应字段填 null。
原文：
${md.slice(0, 40000)}
只返回 JSON：{"found":true,"responsibilities":"","requirements":""}`, MODEL, { jsonMode: true, temperature: 0 });
          await logTokenUsage({ tool_name: 'structurer-job', task_name: 'Reground JD 1021', institution: j.institute_or_company_name || '', model_id: r.model || MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
          const v = parseJsonLoose(r.text) || {};
          // 有的 JD 原文在职责前面先写愿景 / 团队介绍（美团北斗）：从「岗位职责」这类小标题截起
          const cut = (t: any, re: RegExp) => { const x = String(t || ''); const m = x.search(re); return m > 20 ? x.slice(m) : x || null; };
          const got: Record<string, string | null> = {
            responsibilities: cut(v.responsibilities, /岗位职责|工作职责|职位职责|职位描述|岗位描述|工作内容|你将负责|你的职责|Responsibilities|What you('ll| will) do/i),
            overview: cut(v.requirements, /任职要求|岗位要求|职位要求|任职资格|我们希望你|你需要具备|Requirements|Qualifications/i),
          };
          patch = {};
          for (const k of fields) {
            const t = got[k];
            patch[k] = t && t.length >= 20 && groundedRatio(t, md) >= COPY_MIN ? t.trim() : null;
          }
          const fixed = fields.filter(k => patch![k]).length;
          outcome = fixed === fields.length ? 'recopied' : fixed ? 'partly_recopied' : 'not_found';
          if (outcome !== 'recopied') note = v.found === false ? '详情页上找不到这个岗位' : '照抄的内容和原文对不上';
          if (outcome !== 'recopied') {
            const nm = String(j.name || '').replace(/[（(][^）)]*[）)]|\s/g, '');
            if (CATEGORY_NAME.test(nm)) { if (outcome === 'not_found') outcome = 'cleared_category'; note = '岗位名是大类，不是具体岗位'; }
            else {
              // 具体岗位：对不上的字段先保留原内容，打「待核实」
              for (const k of fields) if (patch[k] === null) patch[k] = j[k];
              outcome = outcome === 'not_found' ? 'kept_to_verify' : 'partly_recopied_verify';
              note += '；链接多半是总页面，原内容先留着待核实';
            }
          }
        }
        if (patch) {
          const empty = Object.entries(patch).some(([, v]) => v === null);
          const flags = new Set<string>(j.collect_flags || []);
          if (empty) flags.add('详情待补'); else flags.delete('详情待补');
          if (/verify/.test(outcome)) flags.add('待核实'); else flags.delete('待核实');
          patch.collect_flags = [...flags];
          patch.ai_sources = { ...(j.ai_sources || {}), reground_1021: { url, outcome, at: new Date().toISOString() } };
          if (samples.length < 60) samples.push({ id, name: j.name, company: j.institute_or_company_name, outcome, note, before: String(j.responsibilities || '').slice(0, 120), after: String(patch.responsibilities ?? '').slice(0, 120), url });
          if (APPLY) await db.from('jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
        }
      }
    } catch (e: any) { outcome = 'error'; note = String(e?.message || e).slice(0, 80); }
    stat[outcome] = (stat[outcome] || 0) + 1;
    if (++done % 20 === 0) process.stdout.write(`\r${done}/${todo.length}：${Object.entries(stat).map(([k, n]) => `${k} ${n}`).join('，')}`);
  }
}));
console.log(`\n结果：${Object.entries(stat).map(([k, n]) => `${k} ${n}`).join('，')}`);
fs.writeFileSync(`reports/reground-jobs-1021${APPLY ? '' : '-dry'}.json`, JSON.stringify({ at: new Date().toISOString(), model: MODEL, stat, samples }, null, 1));
process.exit(0);
