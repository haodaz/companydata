/**
 * 百业工厂 · 生成要求（2026-11-06，用户：借鉴真活，出空间分两层——先定位到一个东西，再定细节）。
 *
 * 第一层「定位」Anchor：这个空间到底是哪一个——职业库里的一个职业 / 岗位库里的一条 JD / 粘贴的 JD / 一个学科研究领域。
 *   中间对上职业实体、企业实体；粒度跟着受众走（高中生落到「程序员」「前端 / 后端」这一级，不落到「高级 SRE」）。
 * 第二层「生成要求」GenSpec：都是自然语言——给谁看、要多深、考核多难（操作要不要精准）、参考资料、必须放进去的、不要的。
 *
 * 两样都存在 skill_tasks.jd_snapshot（anchor / spec 两个键，不用加列），从出故事线、设计工位、美术、排一天、每一章、评分到评审都读它
 * （以前只有职业探索写死的一句，而且只进了第一步）。用户的要求排在固定口径之后、明确写「冲突时以用户要求为准」。
 */

export type AnchorKind = 'occupation' | 'job' | 'pasted' | 'career' | 'discipline';
export type Anchor = {
  kind: AnchorKind;
  label: string;                 // 定位到的名字：职业名 / 岗位名 / 学科名
  occupation_id?: number | null; // 职业库
  job_id?: number | null;        // 岗位库
  company?: string | null;       // 企业名（JD / 粘贴的 JD）
  company_id?: number | null;
  from?: string;                 // 用户最开始输入的原话（比如「高级 SRE」），定位后落到 label
};

export type SpecRef = { name: string; text: string };
export type GenSpec = {
  preset?: string;               // 用了哪个预设（只做记录）
  audience?: string;             // 给谁看
  depth?: string;                // 要多深：职业讲到哪一级、日常任务要多有代表性
  difficulty?: string;           // 考核多难：操作精准度、评分严不严
  must?: string;                 // 必须放进去的（场景、设备、流程、某段文案）
  avoid?: string;                // 不要的
  refs?: SpecRef[];              // 参考资料（上传 / 粘贴，已抽成文字）
  updated_at?: string;
};

/** 常用组合：点一下填好四项，人再改。说法都是给模型看的自然语言 */
export const PRESETS: { key: string; label: string; spec: Omit<GenSpec, 'preset' | 'refs' | 'updated_at'> }[] = [
  {
    key: 'highschool', label: '高中生涯体验',
    spec: {
      audience: '高中生，还没选专业，对这个职业只有模糊印象；要让他们看懂这一行每天在干什么、适不适合自己。',
      depth: '职业讲到大家都认得的那一级（如「程序员」，最多分前端 / 后端），不下钻到资深或细分岗位；一天里的任务挑这一行最普遍、最有代表性的，不挑冷门的专项。术语一出现就用一句大白话解释。',
      difficulty: '难度低：看懂、做对方向、说出理由就算过。工位操作只要大致在合理范围内就给分，不要求每一步精细准确；红线只留这一行真会出安全事故的。评分重理解和判断，不重操作精度和速度。',
    },
  },
  {
    key: 'college', label: '大学生职业探索',
    spec: {
      audience: '本科生，在想毕业去哪一行、或者在找第一份实习。',
      depth: '落到具体岗位（如「后端开发工程师」），任务贴近入职第一年真实会做的事；术语适当解释。',
      difficulty: '中等：比校招笔试低一档。工位要做对关键操作，允许小的偏差；评分看判断和关键操作是否到位。',
    },
  },
  {
    key: 'newhire', label: '校招 / 新人上岗',
    spec: {
      audience: '刚入职或即将入职的新人，要尽快上手这个岗位。',
      depth: '按真实岗位的日常来，覆盖新人最常做、最容易出错的事。',
      difficulty: '接近岗位真实要求：关键操作要准，违规就扣分；评分看结果和过程是否规范。',
    },
  },
  {
    key: 'pro', label: '在职提升',
    spec: {
      audience: '已经在这一行工作几年的人，想补短板或往上走一级。',
      depth: '挑这一行有难度、有取舍的场景，可以细分到专项。',
      difficulty: '高：操作要精准、要处理突发；评分严格。',
    },
  },
];

/** 局部改的常用说法（工作室里做成可点的小标签） */
export const REVISE_CHIPS = {
  step: ['难度降一档', '难度升一档', '换个更常见的场景', '术语加一句大白话解释', '说法更口语', '选项更有迷惑性', '缩短一点'],
  opening: ['开场更有画面感', '说清楚这一章要干什么', '更口语', '缩短一点'],
  bench: ['操作不用那么精准，大致合理就给分', '红线只留真会出事故的', '换一台这一行更常见的设备', '加一个中途突发'],
} as const;

/** 一份生成要求有没有填东西 */
export const hasSpec = (s?: GenSpec | null) => !!s && !!(s.audience || s.depth || s.difficulty || s.must || s.avoid || s.refs?.length);

/** 参考资料进提示词时的总长度上限（太长会挤掉正事） */
const REF_BUDGET = 5000;

/** 生成要求 → 一段给模型看的话。每一个生成环节都拼在自己的提示词里 */
export function renderSpec(spec?: GenSpec | null, anchor?: Anchor | null): string {
  if (!hasSpec(spec) && !anchor?.from) return '';
  const s = spec || {};
  const lines: string[] = ['【用户的生成要求（每一步都要遵守；和上面的固定口径冲突时，以这里为准）】'];
  if (anchor?.from && anchor.from !== anchor.label) lines.push(`· 用户最初说的是「${anchor.from}」，已经定位到「${anchor.label}」这一级：就按「${anchor.label}」来做，不要回到更细、更资深的岗位上。`);
  if (s.audience) lines.push(`· 给谁看：${s.audience}`);
  if (s.depth) lines.push(`· 深度：${s.depth}`);
  if (s.difficulty) lines.push(`· 考核难度：${s.difficulty}`);
  if (s.must) lines.push(`· 必须放进去：${s.must}`);
  if (s.avoid) lines.push(`· 不要：${s.avoid}`);
  if (s.refs?.length) {
    let left = REF_BUDGET;
    const parts: string[] = [];
    for (const r of s.refs) { if (left <= 200) break; const t = r.text.slice(0, Math.min(left, 2500)); left -= t.length; parts.push(`《${r.name}》\n${t}`); }
    lines.push(`· 参考资料（照着它的场景、流程、说法来，不要照抄成题目原文）：\n${parts.join('\n---\n')}`);
  }
  return lines.join('\n');
}

/** 从空间的 jd_snapshot 读出要求文字（没有就空串） */
export function specTextOf(jdSnapshot: any): string {
  return renderSpec(jdSnapshot?.spec || null, jdSnapshot?.anchor || null);
}

/** 用户 / 前端传来的要求做清洗：只留认识的键、截长度 */
export function cleanSpec(raw: any): GenSpec {
  const t = (v: any, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const refs = Array.isArray(raw?.refs) ? raw.refs.slice(0, 6).map((r: any) => ({ name: t(r?.name, 80) || '参考资料', text: t(r?.text, 12000) })).filter((r: SpecRef) => r.text.length > 20) : [];
  const out: GenSpec = { preset: t(raw?.preset, 40) || undefined, audience: t(raw?.audience, 600), depth: t(raw?.depth, 800), difficulty: t(raw?.difficulty, 800), must: t(raw?.must, 1500), avoid: t(raw?.avoid, 800), refs, updated_at: new Date().toISOString() };
  for (const k of Object.keys(out) as (keyof GenSpec)[]) if (out[k] === '' || (Array.isArray(out[k]) && !(out[k] as any[]).length)) delete out[k];
  return out;
}

export function cleanAnchor(raw: any): Anchor | null {
  const kinds: AnchorKind[] = ['occupation', 'job', 'pasted', 'career', 'discipline'];
  if (!raw || !kinds.includes(raw.kind)) return null;
  const label = String(raw.label || '').trim().slice(0, 60);
  if (!label) return null;
  const n = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return { kind: raw.kind, label, occupation_id: n(raw.occupation_id), job_id: n(raw.job_id), company: raw.company ? String(raw.company).slice(0, 60) : null, company_id: n(raw.company_id), from: raw.from ? String(raw.from).trim().slice(0, 60) : undefined };
}
