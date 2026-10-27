/**
 * 岗位字段的默认值与规整（数据部门 10-14 口径）。入库（job-store）和存量回填（scripts/fix-1014.mts）共用。
 *   主办方 organizer：空的就填这个岗位所属企业的名字
 *   年级要求 grade：空的、且学历说明有值时，按学历说明推（「本科及以上」→ college_student|master_student|phd_student）
 *   工作地址 address：空的就和工作地点 location 一样
 *   四个标签 skill_labels / skill_labels_jd / exp_labels / exp_labels_jd：标签之间统一用中文「；」（10-19 起都是文本）
 *   国家 / 省份 / 城市：存数据部门选项集的编码（10-19），见 region-codes.ts
 */
import { resolveRegion } from '@/lib/region-codes';

const UP: Record<string, string[]> = {
  college: ['college_student', 'master_student', 'phd_student'],
  master: ['master_student', 'phd_student'],
  phd: ['phd_student'],
};

/** 学历说明 → 年级要求（对方 grade 枚举）。推不出来返回 null，不乱填 */
export function gradeFromEducation(desc: string | null | undefined): string[] | null {
  // 「博士研究生」「硕士研究生」先收成「博士」「硕士」，免得「研究生」被当成硕士那一档
  const t = String(desc || '').replace(/\s+/g, ' ').trim().replace(/博士研究生/g, '博士').replace(/硕士研究生/g, '硕士');
  if (!t) return null;
  const s = t.toLowerCase();
  const out = new Set<string>();
  // 「本/硕/博」「本硕博」这种直接列出来的
  if (/本\s*[\/、,，]?\s*硕\s*[\/、,，]?\s*博/.test(t)) return [...UP.college];
  if (/硕\s*[\/、,，]\s*博/.test(t)) return [...UP.master];
  if (/本\s*[\/、,，]?\s*硕/.test(t)) { out.add('college_student'); out.add('master_student'); }
  // 「大二及以上在校生」这种直接说年级的
  const yr = t.match(/大([一二三四])及以上/);
  if (yr) return ['college_freshman', 'college_sophomore', 'college_junior', 'college_senior'].slice('一二三四'.indexOf(yr[1]));
  const above = /(及以上|以上|或以上|及更高|起|or above|or higher|and above|\+)/i.test(t);
  // 中文：取说到的最低一档
  const cn = /(大专|专科|高职)/.test(t) ? 'college' : /(本科|学士|大学生|一本|二本)/.test(t) ? 'college' : /(硕士|研究生)/.test(t) ? 'master' : /博士/.test(t) ? 'phd' : null;
  // 英文：bachelor / master / phd
  const en = /\b(bachelor|bs|ba|b\.s\.|undergraduate)\b/.test(s) ? 'college' : /\b(master|ms|m\.s\.|mba|graduate student)\b/.test(s) ? 'master' : /\b(phd|ph\.d|doctoral|doctorate)\b/.test(s) ? 'phd' : null;
  const lv = cn || en;
  if (lv) {
    if (above) UP[lv].forEach(g => out.add(g));
    else out.add(UP[lv][0]);
    // 英文常见「BS/MS」「Bachelor's or Master's」：两档都算
    if (en && /\b(ms|master)\b/.test(s) && lv === 'college') out.add('master_student');
    if (/\b(phd|ph\.d)\b/.test(s) && !above && lv !== 'phd') out.add('phd_student');
    if (cn === 'college' && /硕士|研究生/.test(t) && !above) out.add('master_student');
    if (cn && cn !== 'phd' && /博士/.test(t) && !above) out.add('phd_student');
  }
  return out.size ? [...out] : null;
}

/** 技能标签（JD 原文）：标签之间统一中文「；」。不拆 C/C++、Pro/E 这种自带斜杠的；只认「 / 」两边带空格的那种当分隔 */
export function normalizeSkillTags(v: string | null | undefined): string | null {
  if (!v) return v ?? null;
  const parts = String(v).split(/\s*[;；、|，,]\s*|\s+\/\s+/).map(x => x.trim()).filter(Boolean);
  return parts.length ? parts.join('；') : null;
}

/**
 * 中英文字段（*_lang_cn / *_lang_en）对应哪个原文字段——按数据部门 10-16《查企业、岗位反馈》的对照表。
 * schedule（流程/日程安排）用我们的「招聘流程」recruit_process（数据部门 10-16 确认）。
 */
export const LANG_SOURCE: Record<string, string> = {
  name: 'name', description: 'summary_cn', schedule: 'recruit_process', overview: 'overview', process: 'application_website',
  organizer: 'organizer', responsibilities: 'responsibilities', welfare: 'welfare',
};
/** 活动地址 (Cn) / (En) 跟「工作地点」一致（数据部门周赞灵 10-26）：按工作地点的语言放一边——中文放 (Cn)、英文放 (En)，另一边留空（10-27 #51） */
export const ADDRESS_LANG_SOURCE = 'location';
export const isZhText = (s: string) => (s.match(/[一-鿿]/g) || []).length >= Math.max(1, s.replace(/\s/g, '').length * 0.15);

/**
 * 按对照表放中英文字段：原文是中文放 (Cn)，英文放 (En)；网址不分语言，两边都放。
 * 只补空的，已有的（人工改过 / 以前翻译过的）不覆盖，除非 overwrite（数据部门改了对照，旧值是按旧对照放的）。
 */
export function applyLangFields(job: Record<string, any>, opts: { overwrite?: string[] } = {}) {
  const patch: Record<string, string> = {};
  for (const [k, src] of Object.entries(LANG_SOURCE)) {
    const v = String(job[src] ?? '').trim();
    if (!v) continue;
    const slots = /^https?:\/\//i.test(v) ? ['cn', 'en'] : [isZhText(v) ? 'cn' : 'en'];
    for (const l of slots) {
      const key = `${k}_lang_${l}`;
      if (!job[key] || opts.overwrite?.includes(k)) { if (job[key] !== v) patch[key] = v; job[key] = v; }
    }
  }
  const want = addressLangOf(job[ADDRESS_LANG_SOURCE]);
  for (const [key, v] of Object.entries(want)) if ((job[key] ?? null) !== v) { patch[key] = v as any; job[key] = v; }
  return patch;
}

/** 工作地点 → 活动地址两栏：中文的只放 (Cn)，英文的只放 (En)；没有工作地点两边都空 */
export function addressLangOf(location: any): { address_lang_cn: string | null; address_lang_en: string | null } {
  const loc = String(location ?? '').trim() || null;
  if (!loc) return { address_lang_cn: null, address_lang_en: null };
  return isZhText(loc) ? { address_lang_cn: loc, address_lang_en: null } : { address_lang_cn: null, address_lang_en: loc };
}

/**
 * 查找名称 name_to_search：这家企业的各种叫法（全称 / 简称 / 工商名 / 英文名 / 别名），去重后用英文「;」连成文本（数据部门 10-23 #37），
 * 写在它每个岗位上，方便按任何一个叫法搜到（数据部门 10-16：「就像我们公司也可以叫申请方、平方」）。
 */
export function companySearchNames(c: { name?: string | null; brief_name?: string | null; registered_name?: string | null; name_en?: string | null; aliases?: string[] | null } | null | undefined): string | null {
  if (!c) return null;
  const all = [c.name, c.brief_name, c.registered_name, c.name_en, ...(c.aliases || [])]
    .map(x => String(x || '').trim()).filter(x => x && !/^并入#/.test(x));
  const seen = new Set<string>(), out: string[] = [];
  for (const x of all) { const k = x.replace(/\s/g, '').toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out.length ? out.join(';') : null;
}

/** 入库前补默认值。company 是这个岗位所属企业的名字 */
export function applyJobDefaults(job: Record<string, any>, company?: string | null) {
  if (!job.organizer && company) job.organizer = company;
  if (!(Array.isArray(job.grade) && job.grade.length)) { const g = gradeFromEducation(job.education_description); if (g) job.grade = g; }
  if (!job.address && job.location) job.address = job.location;
  // 四个标签（要求 / 职责 × 经验 / 技能）都是中文分号「；」隔开的文本（数据部门 10-19 #13）
  for (const k of ['skill_labels', 'skill_labels_jd', 'exp_labels', 'exp_labels_jd']) {
    if (Array.isArray(job[k])) job[k] = job[k].join('；');
    if (job[k] !== undefined) job[k] = normalizeSkillTags(job[k]);
  }
  // 国家 / 省份 / 城市存选项集编码（数据部门 10-19 #14）；认不出的（海外城市、「全国」）留空，原文在 location
  if (['country', 'province', 'city'].some(k => job[k] !== undefined)) {
    const r = resolveRegion(job);
    if (job.country !== undefined) job.country = r.country;
    if (job.province !== undefined || r.province.length) job.province = r.province;
    if (job.city !== undefined) job.city = r.city;
  }
  applyLangFields(job);   // 中英文字段按对照表放好（数据部门 10-16）
  return job;
}
