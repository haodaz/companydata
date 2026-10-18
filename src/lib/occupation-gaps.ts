/**
 * 职业库缺口：岗位库里常见的岗位名，职业库里找不到对应职业的，归成「新职业建议」。
 * 飞轮每次检测跑一遍（只看近期新进的岗位），建议放在看板上由人决定建不建；脚本 occupation-gaps.mts 可全量跑。
 *
 * 三步，每步都把关（2026-10-18 第一版清单太杂：泛岗位名被塞进新职业、「招聘共1个职位」这种也进来了）：
 *   1. 清洗：去编号 / 城市 / 届别 / 级别；挡掉不是岗位名的（招聘公告、地区、其他）和太泛的（研发工程师、算法工程师…）
 *   2. 归并：模型只把「确实就是这个职业」的岗位名归进去，拿不准的不归
 *   3. 核对：逐条再问一次——职业库里有没有同义 / 近义的（有就不算缺，记成别名建议）、每个岗位名是不是真属于它
 *   岗位数只按核对通过的岗位名算。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { findOccupation } from '@/lib/occupation-store';
import { logTokenUsage } from '@/lib/token-logger';

export type OccupationGap = { name: string; name_en?: string; aliases: string[]; titles: string[]; jobs: number; why: string };
export type AliasHint = { occupation: string; titles: string[]; jobs: number };

/** 岗位名归一：去括号说明、「XX-」前缀、分隔符后面的部门 / 城市、届别和级别词 */
export const coreTitle = (n: string) => String(n || '')
  .replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '').replace(/^[一-龥]{2,4}[-－—]/, '').replace(/[-－—｜|·/].*$/, '')
  .replace(/20\d\d届?|\d{2}届|校招|校园招聘|实习生?|应届生?|管培生?|秋招|春招|提前批|储备|初级|中级|高级|资深|岗位?$/g, '')
  .replace(/\s+/g, '').trim();

/** 不是岗位名的：招聘公告、地区、学历身份、凑数的 */
const JUNK = /招聘|职位|岗位|启事|简章|地区|其他|不限|博士生|硕士生|本科生|毕业生|同学|计划|项目$|^年|^\d|共\d+/;
/** 太泛、对不上任何具体职业的岗位名（只有这几个字，没有方向） */
const GENERIC = new Set(['工程师', '研发工程师', '算法工程师', '软件工程师', '开发工程师', '技术工程师', '专员', '助理', '经理', '主管', '研究员', '设计师', '运营', '销售', '技术员', '操作员', '管培', '培训生', '技术培训生', '销售培训生', '应用工程师', '系统工程师', '项目工程师', '研发', '技术', '工艺工程师', '质量工程师', '产品', '职能', '业务岗', '综合岗']);

const LLM_LOG = (task: string, model: string, usage: any) => logTokenUsage({ tool_name: 'occupation', task_name: task, institution: '', model_id: model, usageMetadata: usage, success: true }).catch(() => {});

export async function findOccupationGaps(opts: { model: string; sinceDays?: number; top?: number; log?: (s: string) => void }) {
  const log = opts.log || (() => {});
  const since = opts.sinceDays ? new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString() : null;
  const { data: jobs } = await selectAll(() => {
    let q = supabaseAdmin.from('jobs').select('name').not('if_delete', 'is', true);
    if (since) q = q.gte('created_at', since);
    return q.order('id');
  });
  const cnt = new Map<string, number>();
  for (const j of jobs as any[]) {
    const k = coreTitle(j.name);
    if (k.length < 3 || k.length > 18 || JUNK.test(k) || GENERIC.has(k)) continue;
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  // 只出现一次的不看（多半是某家公司自己的叫法）
  const titles = [...cnt.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, opts.top || 900);
  const { data: occ } = await selectAll(() => supabaseAdmin.from('occupations').select('name, aliases').not('if_delete', 'is', true).order('id'));
  const occNames = new Map((occ as any[]).map(o => [String(o.name).replace(/\s+/g, ''), String(o.name)]));
  const occText = (occ as any[]).map(o => o.name + ((o.aliases || []).length ? `（${o.aliases.slice(0, 4).join('/')}）` : '')).join('、');
  log(`职业缺口：岗位 ${(jobs as any[]).length} 个 → 有效岗位名 ${titles.length} 种；职业库 ${(occ as any[]).length} 个`);
  if (!titles.length) return { gaps: [] as OccupationGap[], aliasHints: [] as AliasHint[] };

  // 2. 归并
  const raw: any[] = [];
  for (let i = 0; i < titles.length; i += 120) {
    const chunk = titles.slice(i, i + 120);
    const r = await generateContent(`职业库现有职业（括号里是别名）：
${occText}

下面是招聘岗位名（后面是岗位数）。找出职业库里没有对应职业的岗位名，归并成「新职业建议」。
规则：
- 职业库里已有同一个职业、近义职业或别名能覆盖的，不算缺（如「售前工程师」已被「数字化解决方案设计师」覆盖，「AI 应用开发」已被「生成式人工智能系统应用员」覆盖）。
- 一个岗位名只有在「做的就是这个职业」时才归进去；方向不明、拿不准的不要归，宁缺毋滥。不要把泛泛的「研发工程师」「算法工程师」塞进具体职业。
- 新职业名用行业通行的规范叫法，不带公司、城市、级别、届别；至少要有一个明确的专业方向（如「数字 IC 验证工程师」「药物警戒专员」）。
- 公司内部的项目名、产品名、团队名不是职业。
只返回 JSON：{"items":[{"name":"新职业名","name_en":"English name","titles":["归进来的岗位名，原样照抄"],"why":"现有职业为什么覆盖不了（一句话）"}]}

岗位名：
${chunk.map(([t, n]) => `${t}（${n}）`).join('\n')}`, opts.model, { jsonMode: true });
    await LLM_LOG('Occupation Gaps · Group', r.model || opts.model, r.usageMetadata);
    raw.push(...(parseJsonLoose(r.text)?.items || []));
  }
  const merged = new Map<string, any>();
  for (const p of raw) {
    if (!p?.name) continue;
    const k = String(p.name).replace(/\s+/g, '').toLowerCase();
    const m = merged.get(k) || { name: String(p.name).trim(), name_en: p.name_en, why: p.why, titles: [] as string[] };
    m.titles = [...new Set([...m.titles, ...(p.titles || []).map(String).filter((t: string) => cnt.has(t))])];
    merged.set(k, m);
  }
  const cands: any[] = [];
  for (const m of merged.values()) if (m.titles.length && !(await findOccupation({ name: m.name }))) cands.push(m);
  log(`职业缺口：初步建议 ${cands.length} 个，逐条核对`);

  // 3. 核对：近义职业、岗位名归属
  const gaps: OccupationGap[] = [];
  const aliasHints: AliasHint[] = [];
  for (let i = 0; i < cands.length; i += 25) {
    const chunk = cands.slice(i, i + 25);
    const r = await generateContent(`职业库现有职业（括号里是别名）：
${occText}

下面是「新职业建议」，每条带归进来的岗位名。逐条核对：
1. same_as：职业库里如果已有「同一个职业」（只是换个叫法、职责基本一样），填那个职业的名称，必须从上面清单里原样照抄；只是同一大类的不算（如「人工智能工程技术人员」不算覆盖「SLAM 算法工程师」），没有就填 null。
2. keep_titles：只留下确实属于这个职业的岗位名；方向不明、属于别的职业的去掉。
3. valid：是不是一个真实存在、有明确专业方向的职业（公司项目名、泛称、凑数的都是 false）。
4. aliases：这个职业常见的其他叫法（最多 4 个）。
只返回 JSON：{"items":[{"n":序号,"same_as":null,"keep_titles":[],"valid":true,"aliases":[]}]}

${chunk.map((c, j) => `${j + 1}. ${c.name}：${c.titles.join('、')}`).join('\n')}`, opts.model, { jsonMode: true });
    await LLM_LOG('Occupation Gaps · Verify', r.model || opts.model, r.usageMetadata);
    for (const v of parseJsonLoose(r.text)?.items || []) {
      const c = chunk[Number(v.n) - 1];
      if (!c) continue;
      const keep = (v.keep_titles || []).map(String).filter((t: string) => c.titles.includes(t));
      const jobs = keep.reduce((s: number, t: string) => s + (cnt.get(t) || 0), 0);
      // 「库里已有」只认职业库里真有的名字（模型会编一个同名的出来），对不上就照样当缺口
      const same = v.same_as ? occNames.get(String(v.same_as).replace(/（.*$/, '').replace(/\s+/g, '')) : null;
      if (same) { if (keep.length) aliasHints.push({ occupation: same, titles: keep, jobs }); continue; }
      if (v.valid === false || !keep.length || jobs < 3) continue;
      gaps.push({ name: c.name, name_en: c.name_en, aliases: (v.aliases || []).map(String).slice(0, 4), titles: keep, jobs, why: c.why || '' });
    }
  }
  gaps.sort((a, b) => b.jobs - a.jobs);
  aliasHints.sort((a, b) => b.jobs - a.jobs);
  log(`职业缺口：核对后建议新增 ${gaps.length} 个职业，另有 ${aliasHints.length} 组岗位名可记成现有职业的别名`);
  return { gaps, aliasHints };
}
