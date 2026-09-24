/**
 * 职业探索：只给一个职业名（如「焊接工程师」「无人机飞手」「临床营养师」），AI 把它结构化——
 *   典型岗位（一份虚构但典型的 JD，喂给后面的空间构建流水线）+ 生涯地图（做什么、一天怎么过、技能树、进入路径、成长阶梯、相关职业、适不适合你）。
 * 面向高中生 / 大学生的生涯了解，不是招聘。
 */
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import type { JdInput } from '@/lib/agents/skill-lab';

export interface CareerMap {
  profession: string;
  one_liner: string;
  what_they_do: string[];
  day_in_life: { time: string; activity: string }[];
  skills: { name: string; kind: 'hard' | 'soft'; why: string; how_to_build: string }[];
  entry_paths: { path: string; detail: string }[];
  ladder: { stage: string; years: string; title: string; focus: string }[];
  salary_note: string;
  related: { name: string; difference: string }[];
  fit_signs: string[];
  misfit_signs: string[];
  typical_employer: string;
}

export interface CareerStructure { jd: JdInput & { location: string }; career: CareerMap }

export async function structureCareer(profession: string, modelId = 'gemini-3.8-flash'): Promise<CareerStructure> {
  const result = await generateContent(`
    一位高中生 / 大学生想了解「${profession}」这个职业。请你以这个行业里带过很多新人的资深从业者的身份，把这个职业结构化。
    只写公开的、行业里公认的常识；薪酬只给大致区间并注明「因城市 / 行业差异大」；不要编造具体企业的内部信息。全部中文。

    第一部分 typical_job：一份「典型岗位」——虚构一家有代表性的雇主（写成「某……（虚构）」），给出这个职业校招 / 初级岗位最典型的岗位职责（6–9 条，每条一句，像真实 JD）和任职要求（4–6 条）。它会被用来构建一个可操作的技能空间。
    第二部分 career：生涯地图。
      - what_they_do：这个职业到底在做什么，4–6 条大白话
      - day_in_life：典型的一天，6–8 个时间点
      - skills：核心技能 5–7 项，每项标 hard / soft，说清「为什么需要」和「在校 / 现在就能怎么练」
      - entry_paths：进入路径 3–5 条（专业、证书、作品集、实习、转行……）
      - ladder：成长阶梯 4 级（阶段、年限、头衔、这一阶段的重点）
      - related：相邻职业 3–4 个，各一句和本职业的区别
      - fit_signs / misfit_signs：各 3–4 条，帮学生判断适不适合自己（写具体的行为特征，不写素质词）

    返回 JSON：
    {
      "typical_job": { "employer": "<某……（虚构）>", "title": "<岗位名>", "location": "<典型城市 / 场所>", "responsibilities": "<职责，换行分隔>", "qualifications": "<要求，换行分隔>" },
      "career": {
        "one_liner": "<一句话说清这个职业>",
        "what_they_do": [""], "day_in_life": [ { "time": "", "activity": "" } ],
        "skills": [ { "name": "", "kind": "hard" | "soft", "why": "", "how_to_build": "" } ],
        "entry_paths": [ { "path": "", "detail": "" } ],
        "ladder": [ { "stage": "", "years": "", "title": "", "focus": "" } ],
        "salary_note": "", "related": [ { "name": "", "difference": "" } ],
        "fit_signs": [""], "misfit_signs": [""]
      }
    }
  `, modelId, { jsonMode: true });
  await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Career · Structure', institution: '', model_id: modelId, usageMetadata: result.usageMetadata, success: true }).catch(() => {});
  const p = parseJsonLoose(result.text);
  const tj = p.typical_job || {}; const c = p.career || {};
  const list = (v: any, n = 10) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, n) : []);
  const objs = <T,>(v: any, f: (x: any) => T | null, n = 10): T[] => (Array.isArray(v) ? v.map(f).filter((x): x is T => !!x).slice(0, n) : []);
  const jd = { company: String(tj.employer || `某企业（虚构）`), title: String(tj.title || profession), location: String(tj.location || ''), responsibilities: String(tj.responsibilities || ''), qualifications: String(tj.qualifications || '') };
  if (!jd.responsibilities) throw new Error('没有生成出典型岗位职责，请换个说法再试');
  const career: CareerMap = {
    profession, one_liner: String(c.one_liner || ''), typical_employer: jd.company,
    what_they_do: list(c.what_they_do), day_in_life: objs(c.day_in_life, x => x?.activity ? { time: String(x.time || ''), activity: String(x.activity) } : null),
    skills: objs(c.skills, x => x?.name ? { name: String(x.name), kind: x.kind === 'hard' ? 'hard' : 'soft', why: String(x.why || ''), how_to_build: String(x.how_to_build || '') } : null, 8),
    entry_paths: objs(c.entry_paths, x => x?.path ? { path: String(x.path), detail: String(x.detail || '') } : null, 6),
    ladder: objs(c.ladder, x => x?.stage || x?.title ? { stage: String(x.stage || ''), years: String(x.years || ''), title: String(x.title || ''), focus: String(x.focus || '') } : null, 5),
    salary_note: String(c.salary_note || ''), related: objs(c.related, x => x?.name ? { name: String(x.name), difference: String(x.difference || '') } : null, 5),
    fit_signs: list(c.fit_signs, 5), misfit_signs: list(c.misfit_signs, 5),
  };
  return { jd, career };
}
