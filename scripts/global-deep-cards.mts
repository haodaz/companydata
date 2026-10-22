/**
 * 智囊团报告附录的「深度画像卡」（2026-10-23，用户：上次那批企业画像整得特别好，附录也做好一些）
 *   npx tsx --env-file=.env.local scripts/global-deep-cards.mts <jobId> [--no-research] [--only-missing]
 * 1) 报告附录里的企业（global_entities 有 appendix_code、已回链 companydata）→ 没跑过深度尽调的，调本地 companydata 接口补跑（3 家并行）
 * 2) 各专题里的出处网址编号，交给千问压成一张卡（关键数字 / 产品 / 团队 / 近期 / 风险 / 结对价值），只能引用编号
 * 3) 卡写回 datasquare：global_entities.profile.deep_card + 报告 content 附录同一条
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { topicsFor, DEEP_TOPICS, DEEP_TOPICS_VC } from '@/lib/company-deep-topics';

const jobId = process.argv[2]; const NO_RESEARCH = process.argv.includes('--no-research'); const ONLY_MISSING = process.argv.includes('--only-missing');   // 只补还没有画像卡的（比如上次被限流 429 的）
if (!jobId) { console.error('need jobId'); process.exit(1); }
const dsEnv = Object.fromEntries(fs.readFileSync('../datasquare/.env.local', 'utf8').split('\n').map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m![1], m![2].trim().replace(/^"|"$/g, '')]));
const ds = createClient(dsEnv.SUPABASE_URL, dsEnv.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cd = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const B = 'http://localhost:3003', TOKEN = fs.readFileSync('.preview-token', 'utf8').trim();
const LABEL = Object.fromEntries([...DEEP_TOPICS, ...DEEP_TOPICS_VC].map(t => [t.key, t.label]));
const t0 = Date.now(); const log = (...a: any[]) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s]`, ...a);

const { data: ents } = await ds.from('global_entities').select('id, kind, side, name, name_en, appendix_code, profile, external_ids, recommend_reason, summary').eq('job_id', jobId).not('appendix_code', 'is', null);
const list = (ents || []).filter(e => e.external_ids?.companydata && (e.kind === 'company' || e.kind === 'transfer') && !(ONLY_MISSING && e.profile?.deep_card));
log(`附录企业 ${list.length} 家（已回链 companydata）`);

// 1) 补跑深度尽调
async function research(cid: number, name: string) {
  const { data: c } = await cd.from('companies').select('id, name, industry').eq('id', cid).single();
  const { data: done } = await cd.from('company_deep_research').select('topic').eq('company_id', cid);
  const have = new Set((done || []).map(d => d.topic));
  const topics = topicsFor(c).map(t => t.key).filter(k => !have.has(k));
  for (const topic of topics) {
    for (let k = 0; k < 2; k++) {
      try {
        const r = await (await fetch(`${B}/api/db/companies/${cid}/deep-research`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `auth_token=${TOKEN}` }, body: JSON.stringify({ topic, createdBy: 'global-thinktank' }) })).json();
        if (r.success) break; log(name, topic, 'FAIL', String(r.error).slice(0, 100));
      } catch (e: any) { log(name, topic, 'ERR', String(e?.message).slice(0, 100)); }
    }
  }
  log('尽调', name, `补跑 ${topics.length} 个专题`);
}
if (!NO_RESEARCH) {
  const q = [...list];
  await Promise.all([0, 1, 2].map(async () => { while (q.length) { const e = q.shift()!; await research(Number(e.external_ids.companydata), e.name); } }));
}

// 2) 压成卡片
function collectSources(v: any, out: Map<string, string>, title = '') {
  if (!v) return;
  if (typeof v === 'string') { if (/^https?:\/\//.test(v) && !out.has(v)) out.set(v, title); return; }
  if (Array.isArray(v)) { v.forEach(x => collectSources(x, out, title)); return; }
  if (typeof v === 'object') for (const [k, x] of Object.entries(v)) collectSources(x, out, k === 'source' || k === 'sources' || k === 'url' ? (v.name || v.title || title) : title);
}
let ok = 0;
for (const e of list) {
  const cid = Number(e.external_ids.companydata);
  const { data: topics } = await cd.from('company_deep_research').select('topic, data').eq('company_id', cid);
  if (!topics?.length) { log('没有尽调数据，跳过', e.name); continue; }
  const srcMap = new Map<string, string>();
  for (const t of topics) collectSources(t.data, srcMap);
  const sources = [...srcMap.entries()].slice(0, 40).map(([url, title], i) => ({ n: i + 1, url, title: String(title || '').slice(0, 80) }));
  const material = topics.map(t => `### ${LABEL[t.topic] || t.topic}\n${JSON.stringify(t.data).slice(0, 3500)}`).join('\n').slice(0, 26000);
  const prompt = `下面是企业「${e.profile?.name_native || e.name}${e.profile?.name_cn ? `（${e.profile.name_cn}）` : ''}」的深度尽调结果（各专题 JSON，联网检索，带出处网址）和出处编号表。把它压成一张给决策者看的画像卡，中文，专有名词保留原文。
规则：只用材料里有的，不编；数字原样保留；每条尽量带出处编号 cite（只能用下面编号表里的编号，对不上就不写 cite）；没有的部分给空数组。
这家企业在报告里的定位：${String(e.recommend_reason || e.summary || '').slice(0, 300)}
## 出处编号表
${sources.map(s => `[${s.n}] ${s.url}`).join('\n')}
## 尽调材料
${material}
## 输出 JSON
{"one_liner":"一句话：做什么、多大、处在什么位置",
"facts":[{"k":"指标名（如 成立 / 员工 / 营收 / 融资 / 用户 / 覆盖国家）","v":"数值","cite":[1]}],
"products":[{"t":"产品或服务，一句话","cite":[2]}],"team":[{"t":"姓名 · 职务 · 背景一句","cite":[3]}],
"recent":[{"t":"近 24 个月动态，带年月","cite":[4]}],"risks":[{"t":"风险或不确定","cite":[5]}],
"pairing":"和中方结对的价值与可能的合作形式（一两句，基于材料）"}
facts 最多 6 条，products / team / recent / risks 各最多 4 条。`;
  try {
    const r = await generateContent(prompt, 'qwen-plus', { jsonMode: true, temperature: 0 });
    const card = parseJsonLoose(r.text);
    if (!card || typeof card !== 'object') throw new Error('不是 JSON');
    const used = new Set<number>(); const walk = (v: any) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (Array.isArray(v.cite)) v.cite = v.cite.filter((n: any) => sources.some(s => s.n === n)).map((n: number) => (used.add(n), n)); Object.values(v).forEach(walk); } };
    walk(card);
    const deep_card = { ...card, sources: sources.filter(s => used.has(s.n)), topics_n: topics.length, company_id: cid, generated_at: new Date().toISOString() };
    await ds.from('global_entities').update({ profile: { ...(e.profile || {}), deep_card } }).eq('id', e.id);
    e.profile = { ...(e.profile || {}), deep_card };
    ok++; log('卡片', e.appendix_code, e.name, `出处 ${deep_card.sources.length}`);
  } catch (err: any) { log('卡片失败', e.name, String(err?.message).slice(0, 100)); }
}

// 3) 报告附录补丁
const byCode = new Map(list.filter(e => e.profile?.deep_card).map(e => [e.appendix_code, e.profile.deep_card]));
const { data: reps } = await ds.from('global_reports').select('id, content').eq('job_id', jobId);
for (const rep of reps || []) {
  const c = JSON.parse(rep.content); let n = 0;
  for (const x of c.appendix?.entities || []) { const d = byCode.get(x.code || x.appendix_code); if (d) { x.deep_card = d; n++; } }
  await ds.from('global_reports').update({ content: JSON.stringify(c), updated_at: new Date().toISOString() }).eq('id', rep.id);
  log(`报告 ${rep.id}：附录 ${n} 家挂上深度画像卡`);
}
log(`done：卡片 ${ok} / ${list.length}`);
process.exit(0);
