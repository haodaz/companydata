/**
 * 岗位字段的默认值与规整（数据部门 10-14 口径）。入库（job-store）和存量回填（scripts/fix-1014.mts）共用。
 *   主办方 organizer：空的就填这个岗位所属企业的名字
 *   年级要求 grade：空的、且学历说明有值时，按学历说明推（「本科及以上」→ college_student|master_student|phd_student）
 *   工作地址 address：空的就和工作地点 location 一样
 *   技能标签（JD 原文）skill_labels_jd：标签之间统一用中文「；」
 */

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

/** 入库前补默认值。company 是这个岗位所属企业的名字 */
export function applyJobDefaults(job: Record<string, any>, company?: string | null) {
  if (!job.organizer && company) job.organizer = company;
  if (!(Array.isArray(job.grade) && job.grade.length)) { const g = gradeFromEducation(job.education_description); if (g) job.grade = g; }
  if (!job.address && job.location) job.address = job.location;
  if (job.skill_labels_jd) job.skill_labels_jd = normalizeSkillTags(job.skill_labels_jd);
  return job;
}
