/**
 * 潜历标签打标（数据部门 10-20 #15 #17，提示词和他们线下脚本同步，见 src/data/qianli-prompts.ts）：
 *   职能标签 qianli_job_labels：一个岗位一个 value（26 选 1，「无匹配」留空）
 *   特色标签 一级 qianli_job_specialty_labels / 二级 qianli_specialty_labels_reason：value 数组（10-22 起，原来「|」隔开）；
 *     最小颗粒是二级，一级由二级反推（这里在代码里再按 tags.xlsx 推一遍，层级一定一致）
 * 一次最多 10 个岗位，temperature 0。只认清单里的 value。
 * 模型用调用方给的（不先试便宜模型）：10-20 对比，特色标签 qwen-flash 偏松（原文没写也给「AI 重度应用」），qwen-plus 更守原文证据。
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { checkSpecialty } from '@/lib/qianli-evidence';
import { JOB_FUNCTION_PROMPT, JOB_FUNCTION_TAGS, SPECIALTY_BATCH, SPECIALTY_EXAMPLES, SPECIALTY_SYSTEM, SPECIALTY_USER } from '@/data/qianli-prompts';

export type QianliInput = { id: number; name: string; company?: string | null; responsibilities?: string | null; overview?: string | null; summary_cn?: string | null };
export type QianliLabels = { qianli_job_labels: string[] | null; qianli_job_labels_reason: string | null; qianli_job_specialty_labels: string[] | null; qianli_specialty_labels_reason: string[] | null };
export type JobFunction = { value: string | null; reason: string };


export { QIANLI_FUNCTION_NAMES, QIANLI_SPECIALTY_L1_NAMES, QIANLI_SPECIALTY_L2_NAMES } from '@/lib/qianli-tags';

const flat = (v: any, n: number) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * 职能标签：提示词照 prompt.md，用它的「带 id 的岗位数组」输入格式。
 * 只改一处输出：让模型填中文职能名（照抄标签体系里的名称），代码再换成 value。
 * 原因（2026-10-20 回刷后抽查）：value 和名称的对应是历史口径、字面意思错位，提示词再三强调不许按语义纠正，模型还是被带跑——
 *   教师岗被打成 edu_training（=网络安全）、兽医 / 临床医师打成 healthcare（=项目经理）、安全工程师 / 纪检打成 legal_compliance（=数据工程师）。
 */
/**
 * 陈彩瑛 10-21：
 *   1.2 没 JD 的凭岗位名判断（模型按 prompt 第 14 条给「低」也收下），理由记「仅凭岗位名称判断」；
 *   3   有 JD 但匹配度低的不硬塞——留空、记原因（qianli_job_labels_reason），不拿「管理」兜底：「管理」只给岗位名里真有管理头衔的。
 */
const JD_MIN = 20;
const MGMT_TITLE = /总监|总经理|副总|总裁|VP|负责人|主管|经理|厂长|店长|主任|部长|director|head of|manager|chief|CEO|COO|CFO|CTO|lead/i;
const normName = (s: any) => String(s || '').replace(/\s+/g, '').toLowerCase();
const jdOf = (j: QianliInput) => flat(j.responsibilities || j.summary_cn || j.overview, 2500);

export async function tagJobFunctions(jobs: QianliInput[], model: string): Promise<Map<number, JobFunction>> {
  const input = jobs.map(j => ({ id: String(j.id), 岗位名称: j.name, JD: flat(j.responsibilities || j.summary_cn || j.overview, 2500) }));
  const names = JOB_FUNCTION_TAGS.map(t => t.name);
  const prompt = `${JOB_FUNCTION_PROMPT}

# 输出要求的调整（以这里为准）
上面「输出格式」里的 value 一律改为填写**中文职能名**，只能是这 26 个之一、原样照抄：${names.join('、')}；无匹配填 "无匹配"。不要填编码，程序会换成编码。
带 id 的岗位数组时返回：{"results": [{"id": "<原样返回>", "岗位名称": "<原样抄回>", "label": "<中文职能名>", "confidence": "高|中|低", "reason": "<不超过30字>"}]}
每个岗位单独判断，id 和岗位名称必须原样对应同一个输入岗位。

# 输入（带 id 的岗位数组）
${JSON.stringify(input)}`;
  const r = await generateContent(prompt, model, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'job-tagging', task_name: 'Qianli Job Function', institution: jobs[0]?.company || '', model_id: r.model || model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const byName = new Map(JOB_FUNCTION_TAGS.map(t => [t.name.replace(/\s+/g, '').toLowerCase(), t.value]));
  const out = new Map<number, JobFunction>();
  for (const it of parseJsonLoose(r.text)?.results || []) {
    // 按抄回的岗位名对齐（10-21 发现按 id 会错位：A 岗位拿到 B 岗位的理由）；id 和名字对不上时以名字为准，名字在本批里不唯一 / 找不到就不收
    const nm = normName(it['岗位名称']);
    const byId = jobs.find(x => x.id === Number(it.id));
    const sameName = jobs.filter(x => normName(x.name) === nm);
    const j = byId && normName(byId.name) === nm ? byId : sameName.length === 1 ? sameName[0] : null;
    if (!j || out.has(j.id)) continue;
    const id = j.id;
    const why = flat(it.reason, 40);
    const titleOnly = jdOf(j).length < JD_MIN;
    const label = String(it.label || '').replace(/\s+/g, '');
    // 只认中文名（模型要是填了编码，宁可留空也不照收——编码正是被字面意思带跑的来源）
    const value = byName.get(label.toLowerCase()) || null;
    if (!value) { out.set(id, { value: null, reason: titleOnly ? '没有 JD，岗位名也看不出职能' : `26 个职能都对不上${why ? `：${why}` : ''}` }); continue; }
    if (value === 'exec_mgmt' && !MGMT_TITLE.test(j.name)) { out.set(id, { value: null, reason: `匹配度低（岗位名没有管理头衔，不拿「管理」兜底）${why ? `：${why}` : ''}` }); continue; }
    if (titleOnly) { out.set(id, { value, reason: '仅凭岗位名称判断' }); continue; }
    if (it.confidence === '低') { out.set(id, { value: null, reason: `匹配度低${why ? `：${why}` : ''}` }); continue; }
    out.set(id, { value, reason: why || '' });
  }
  return out;
}

/** 特色标签：SYSTEM + 标签体系与判定标准 + 示例 + 批量模式（≤10 个岗位） */
export async function tagJobSpecialties(jobs: QianliInput[], model: string): Promise<Map<number, { l1: string[]; l2: string[] }>> {
  // USER 模板里的「标签体系与判定标准」「判定流程」原样用；输入段换成批量格式
  const standards = SPECIALTY_USER.slice(SPECIALTY_USER.indexOf('【标签体系与判定标准】'), SPECIALTY_USER.indexOf('【输出格式】'));
  const batchHead = SPECIALTY_BATCH.slice(0, SPECIALTY_BATCH.indexOf('（判定标准同上）'));
  const batchOut = SPECIALTY_BATCH.slice(SPECIALTY_BATCH.indexOf('【输出格式】'));
  const lines = jobs.map((j, i) => `${i + 1}) 岗位ID：${j.id}｜岗位名称：${j.name}｜公司：${j.company || ''}｜岗位职责描述：${flat(j.responsibilities || j.summary_cn, 2500) || '（空）'}｜要求描述：${flat(j.overview, 1500) || '（空）'}`).join('\n');
  const prompt = `${SPECIALTY_SYSTEM}

${batchHead.replace('{n}', String(jobs.length)).replace(/1\) 岗位ID：\{id1\}[\s\S]*$/, lines)}

${standards}
${SPECIALTY_EXAMPLES}

${batchOut}
为了能用 JSON 模式返回，请把数组放在 {"items": [...]} 里。`;
  const r = await generateContent(prompt, model, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'job-tagging', task_name: 'Qianli Specialty', institution: jobs[0]?.company || '', model_id: r.model || model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const parsed = parseJsonLoose(r.text);
  const items: any[] = Array.isArray(parsed) ? parsed : parsed?.items || parsed?.results || [];
  const out = new Map<number, { l1: string[]; l2: string[] }>();
  for (const it of items) {
    const id = Number(it['岗位ID'] ?? it.id);
    if (!jobs.some(j => j.id === id)) continue;
    // 只认清单里的二级，再过原文证据关（原文找不到字眼的去掉、只有 AI 类的不算培养新人、JD 空的全清）；一级按二级反推
    const j = jobs.find(x => x.id === id)!;
    const { l1, l2 } = checkSpecialty((it['二级标签'] || []).map(String), j);
    out.set(id, { l1, l2 });
  }
  return out;
}

/** 「岗位名称 + 岗位职责」完全相同的算同一个岗位（陈彩瑛 2：标签要一致）——只问一次，结果复制给其余的 */
export const sameJobKey = (j: { name?: string | null; responsibilities?: string | null }) => `${String(j.name || '').replace(/\s+/g, '')}|${String(j.responsibilities || '').replace(/\s+/g, '')}`;

/** 一批岗位打两种潜历标签，返回要写库的字段（没结果的岗位不在里面） */
export async function qianliLabels(all: QianliInput[], model: string): Promise<Map<number, QianliLabels>> {
  const out = new Map<number, QianliLabels>();
  const rep = new Map<string, QianliInput>();
  for (const j of all) if (!rep.has(sameJobKey(j))) rep.set(sameJobKey(j), j);
  const jobs = [...rep.values()];
  for (let i = 0; i < jobs.length; i += 10) {
    const chunk = jobs.slice(i, i + 10);
    const [fn, sp] = await Promise.all([
      tagJobFunctions(chunk, model).catch(e => { console.warn('[qianli] 职能标签失败', String(e?.message || e).slice(0, 100)); return new Map<number, JobFunction>(); }),
      tagJobSpecialties(chunk, model).catch(e => { console.warn('[qianli] 特色标签失败', String(e?.message || e).slice(0, 100)); return new Map<number, { l1: string[]; l2: string[] }>(); }),
    ]);
    for (const j of chunk) {
      if (!fn.has(j.id) && !sp.has(j.id)) continue;
      const s = sp.get(j.id);
      const f = fn.get(j.id);
      out.set(j.id, {
        qianli_job_labels: f?.value ? [f.value] : null,   // 数组（数据部门 10-23 #34），一般只有一个值
        qianli_job_labels_reason: f ? (f.reason || null) : null,
        qianli_job_specialty_labels: s ? (s.l1.length ? s.l1 : null) : null,
        qianli_specialty_labels_reason: s ? (s.l2.length ? s.l2 : null) : null,
      });
    }
  }
  // 同名同职责的照抄代表岗位的结果
  for (const j of all) { const r = rep.get(sameJobKey(j))!; if (r.id !== j.id && out.has(r.id)) out.set(j.id, { ...out.get(r.id)! }); }
  return out;
}
