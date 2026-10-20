/**
 * 企业落地（2026-10-20，用户：「我们是真平台，要从 ToB 创建账号这层就真的落地」）。
 * 任何一家企业都能一步步把自己建进来，背后是平方的数据实体，公开信息反哺平方：
 *   企业：库里有 → 接上画像；库里没有 → 在平方企业库新建（官网域名编号、来源「企业工作台」、待审核），AI 联网补全画像。
 *   企业情况：公开字段（业务、产品、官网…）平方里空的直接填，已有值不一样的进 ws_contributions 待审核；内部信息只存 ws_orgs.context。
 *   岗位：勾平方岗位库里的；或贴 JD 新建——新岗位写回平方岗位库（来源「企业工作台」、待审核），对上职业库；内部备注存 ws_roles.notes。
 * 表在迁移 037 / 038。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { findCompanyProfile } from '@/lib/agents/company-profile';
import { PROFILE_FIELDS } from '@/lib/company-fields';
import { findOccupation } from '@/lib/occupation-store';
import { ensureCompanyFloraId } from '@/lib/company-flora-id';
import { withCost } from '@/lib/token-logger';
import type { WsOrg } from '@/lib/ws/org';

export const SOURCE = '企业工作台';
/**
 * Know-how：收集什么能让工作台对这家企业真正有用。每一项都写清「它让 AI 能做什么」——AI 按这张清单挑最值钱的先问，右侧企业档案按它显示完成度。
 * weight：对出真活 / 建空间 / 筛人的作用大小（3 = 没有它题就出不真）。
 */
export interface KnowItem { key: string; label: string; hint: string; why: string; weight: 1 | 2 | 3; long?: boolean }
/** 公开（回流平方企业库） */
export const PUBLIC_FIELDS: KnowItem[] = [
  { key: 'one_sentence', label: '一句话介绍', hint: '你们是做什么的', why: '所有生成的第一句背景', weight: 2 },
  { key: 'business_profile', label: '业务与客户', hint: '业务线、主要客户、市场', why: '真活的业务场景从这里取：给谁做、做什么', weight: 3, long: true },
  { key: 'product_area', label: '产品与服务', hint: '主要产品', why: '材料包里的产品、规格、术语', weight: 2, long: true },
  { key: 'introduction', label: '企业简介', hint: '主营业务、规模、位置', why: '候选人看到的企业背景', weight: 1, long: true },
  { key: 'industry', label: '行业', hint: '如 新能源 / 动力电池', why: '挂行业规范，评分标准有依据', weight: 2 },
  { key: 'official_website', label: '官网', hint: 'https://…', why: '企业编号、AI 查公开资料的入口', weight: 1 },
];
/** 内部（只留在工作台，给 AI 当上下文） */
export const PRIVATE_FIELDS: KnowItem[] = [
  { key: 'priorities', label: '眼下最想解决的事', hint: '比如：新厂爬坡供应跟不上、海外客户回款慢、新品上市要打通研产销', why: '真活「为什么是现在」的业务问题直接从这里来', weight: 3 },
  { key: 'team', label: '团队与汇报线', hint: '几个部门、多少人、谁带谁、跨部门找谁', why: '材料包里的邮件、会议纪要有真实的角色和协作关系', weight: 2 },
  { key: 'tools', label: '日常用的软件和系统', hint: 'Excel / SAP / 飞书 / CAD / 自研系统…', why: '决定操作台用哪种（表格 / 代码 / 设计），或让候选人用自己的软件录屏', weight: 2 },
  { key: 'terms', label: '内部常用说法', hint: '黑话、指标口径、缩写（比如「爬坡」「良率」「GWh 口径」）', why: '材料像你们自己写的，候选人能不能听懂也是考点', weight: 1 },
  { key: 'hiring', label: '用人偏好', hint: '看重什么、不要什么样的人', why: '适配分析和最后推荐时的取舍', weight: 2 },
  { key: 'process', label: '招聘流程与节奏', hint: '几轮面试、谁拍板、多久要到岗', why: '项目里 AI 推进到哪一步、什么时候提醒你', weight: 1 },
];
/** 每个岗位的内部备注 */
export const ROLE_NOTES: KnowItem[] = [
  { key: 'hardest', label: '这个岗位最难的地方', hint: '真实工作里最容易出错 / 最考人的环节', why: '真活就考这里，评分细则的重点', weight: 3 },
  { key: 'first90', label: '入职 90 天要做成什么', hint: '具体的产出或指标', why: '真活的交付物照这个定；职业空间的练习目标', weight: 3 },
  { key: 'want', label: '想要什么样的人', hint: '经验、性格、能力', why: '适配分析的打分依据', weight: 2 },
  { key: 'dealbreaker', label: '一票否决', hint: '什么情况坚决不要', why: '筛人时直接标红', weight: 2 },
  { key: 'reports_to', label: '汇报给谁', hint: '比如 供应链总监', why: '真活材料里的「交给谁」', weight: 1 },
  { key: 'tools', label: '这个岗位用的工具', hint: 'SAP / Python / CAD…', why: '选操作台', weight: 1 },
];

/** 科研院所（高校院系、研究院、国家实验室、新型研发机构）的一套：招博士后 / 研究员 / 教授，真活是研究技能 */
export const RESEARCH_PUBLIC: KnowItem[] = [
  { key: 'one_sentence', label: '一句话介绍', hint: '你们研究什么', why: '所有生成的第一句背景', weight: 2 },
  { key: 'research_area', label: '研究方向', hint: '主要方向与学科', why: '研究真活的题目从这些方向里出', weight: 3, long: true },
  { key: 'business_profile', label: '代表性成果与平台', hint: '重点实验室、大科学装置、代表论文 / 成果转化', why: '材料包里的真实平台和成果', weight: 2, long: true },
  { key: 'introduction', label: '机构简介', hint: '隶属、规模、位置', why: '候选人看到的机构背景', weight: 1, long: true },
  { key: 'industry', label: '学科领域', hint: '如 材料科学 / 生物医学工程', why: '挂学科规范和评审口径', weight: 2 },
  { key: 'official_website', label: '官网', hint: 'https://…', why: '机构编号、AI 查公开资料的入口', weight: 1 },
];
export const RESEARCH_PRIVATE: KnowItem[] = [
  { key: 'priorities', label: '眼下最想突破的研究问题', hint: '比如：固态电解质界面阻抗下不来、单细胞数据批次效应处理不好', why: '研究真活的问题直接从这里来', weight: 3 },
  { key: 'projects', label: '在研项目与基金', hint: '国自然 / 重点研发 / 横向课题，各在做什么', why: '真活材料里的项目背景、经费和节点', weight: 2 },
  { key: 'platform', label: '平台与设备', hint: '主要仪器、计算资源、样本库', why: '实验设计题能用什么、不能用什么', weight: 2 },
  { key: 'team', label: '课题组与 PI', hint: '几个组、谁带谁、学生和博后多少', why: '材料里的协作关系；适配分析看能不能融进组', weight: 1 },
  { key: 'level', label: '要引进的层次与条件', hint: '博士后 / 助理研究员 / 青年人才 / 领军人才；待遇、启动经费', why: '写招聘启事、判断候选人层次', weight: 2 },
  { key: 'assessment', label: '考核方式与期望产出', hint: '聘期、非升即走、论文 / 项目 / 转化要求', why: '真活的交付物和评分重点照这个定', weight: 2 },
];
export const RESEARCH_ROLE: KnowItem[] = [
  { key: 'direction', label: '具体研究方向', hint: '比如 锂金属负极界面', why: '真活就出在这个方向上', weight: 3 },
  { key: 'skills', label: '要的研究技能', hint: '实验 / 计算 / 理论；会哪些表征、算法、平台', why: '决定出实验设计、数据分析还是复现题', weight: 3 },
  { key: 'output', label: '代表性成果要求', hint: '论文、项目、专利的层次', why: '适配分析和人才检测的核对重点', weight: 2 },
  { key: 'first_year', label: '第一年要做成什么', hint: '具体的课题或产出', why: '真活的交付物照这个定', weight: 2 },
  { key: 'dealbreaker', label: '一票否决', hint: '比如 学术不端记录、方向完全不对口', why: '筛人时直接标红', weight: 2 },
];
export type OrgKindLike = 'company' | 'research' | undefined | null;
/** 按机构类型拿 know-how 清单 */
export const knowhow = (kind: OrgKindLike) => kind === 'research' ? { pub: RESEARCH_PUBLIC, priv: RESEARCH_PRIVATE, role: RESEARCH_ROLE } : { pub: PUBLIC_FIELDS, priv: PRIVATE_FIELDS, role: ROLE_NOTES };

const PROFILE_MODEL = process.env.WS_PROFILE_MODEL || 'qwen-plus';
const hostOf = (u: string) => { try { return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** 第一步：在平方企业库里新建一家（库里没有时） */
export async function createCompanyEntity(name: string, website: string | null, email: string): Promise<number> {
  const row: Record<string, any> = { name: name.trim(), source: [SOURCE], human_review_status: 'review' };   // companies.source 是数组（潜历二批 / ted …）
  if (website && hostOf(website)) row.official_website = /^https?:\/\//.test(website) ? website : `https://${website}`;
  const { data, error } = await db.from('companies').insert(row).select('id').single();
  if (error) {
    // 名字撞了（lower(name) 唯一）：就是库里那家
    const { data: ex } = await db.from('companies').select('id').ilike('name', name.trim()).limit(1);
    if (ex?.[0]) return ex[0].id;
    throw new Error(error.message);
  }
  await ensureCompanyFloraId(data.id).catch(() => {});
  await db.from('ws_contributions').insert({ entity_type: 'company', entity_id: String(data.id), field: '*', new_value: JSON.stringify(row), status: 'applied', created_by: email });
  return data.id;
}

/** AI 联网补全企业画像（只填空字段，审核已定论 / 锁住的字段不动） */
export async function enrichCompany(companyId: number): Promise<string[]> {
  const { data: c } = await db.from('companies').select('*').eq('id', companyId).single();
  if (!c) return [];
  if (['complete', 'rejected', 'hidden'].includes(c.human_review_status || '')) return [];
  const locked = new Set<string>(c.human_locked_fields || []);
  const profile: any = await withCost({ tool_name: 'workspace', task_name: '工作台 · 补全企业画像', stage: 'create' }, () => findCompanyProfile(c.name, c.name_en || '', c.country || '', PROFILE_MODEL));
  const up: Record<string, any> = {}; const filled: string[] = [];
  for (const f of PROFILE_FIELDS) { const v = profile[f]; if (v == null || v === '' || locked.has(f)) continue; if (c[f] == null || c[f] === '') { up[f] = v; filled.push(f); } }
  if (filled.length) {
    up.profile_source = { ...(c.profile_source || {}), ...(profile.sources || {}) }; up.profile_updated_at = new Date().toISOString(); up.updated_at = up.profile_updated_at;
    if (!c.human_review_status) up.human_review_status = 'review';
    await db.from('companies').update(up).eq('id', companyId);
  }
  return filled;
}

/** 第二步的数据：平方里的公开画像 + 工作台里的内部信息 */
/** 企业档案完成度：按 know-how 清单逐项看有没有、来源是哪（平方库 / 你确认 / 待审核） */
export async function checklist(org: WsOrg) {
  const K = knowhow(org.kind);
  const d = await loadSetup(org as any);
  const pend = new Set((d.contributions || []).filter((c: any) => c.status === 'pending').map((c: any) => c.field));
  const pub = K.pub.map(f => ({ ...f, layer: 'public', value: d.company?.[f.key] || '', source: pend.has(f.key) ? '待审核' : d.company?.[f.key] ? '平方企业库' : '' }));
  const priv = K.priv.map(f => ({ ...f, layer: 'private', value: d.context?.[f.key] || '', source: d.context?.[f.key] ? '你说的' : '' }));
  const roles = (d.roles || []).map((r: any) => ({ title: r.title, linked: !!r.job_id, occupation: !!r.occupation_id, notes: K.role.map(f => ({ key: f.key, label: f.label, value: r.notes?.[f.key] || '', weight: f.weight })) }));
  const items = [...pub, ...priv];
  const score = (xs: { value: string; weight: number }[]) => { const tot = xs.reduce((a, x) => a + x.weight, 0) || 1; return Math.round(xs.filter(x => x.value).reduce((a, x) => a + x.weight, 0) / tot * 100); };
  const roleItems = roles.flatMap((r: any) => r.notes);
  const missing = [...items.filter(i => !i.value).map(i => ({ key: i.key, label: i.label, layer: i.layer, why: i.why, weight: i.weight })),
    ...roles.flatMap((r: any) => r.notes.filter((n: any) => !n.value && n.weight >= 2).map((n: any) => ({ key: `${r.title}.${n.key}`, label: `${r.title}：${n.label}`, layer: 'role', why: K.role.find(f => f.key === n.key)!.why, weight: n.weight })))].sort((a, b) => b.weight - a.weight);
  return { kind: org.kind || 'company', company: d.company ? { id: d.company.id, name: d.company.name, completeness: d.company.completeness_score } : null, items, roles, library_jobs: (d.jobs || []).length, score: score([...items, ...(roleItems.length ? roleItems : [{ value: '', weight: 6 }])]), missing, setup_step: d.setup_step };
}

export async function loadSetup(org: WsOrg & { context?: any; website?: string | null; setup_step?: string }) {
  let company: any = null, jobs: any[] = [];
  if (org.company_id) {
    const { data } = await db.from('companies').select(['id', 'name', 'brief_name', 'city', 'completeness_score', 'source', 'human_review_status', ...new Set([...PUBLIC_FIELDS, ...RESEARCH_PUBLIC].map(f => f.key))].join(', ')).eq('id', org.company_id).maybeSingle();
    company = data;
    const { data: js } = await db.from('jobs').select('id, name, title_cn, job_function, city, responsibilities').eq('company_id', org.company_id).eq('if_delete', false).limit(300);
    const seen = new Set<string>();
    jobs = (js || []).filter(j => { const t = (j.title_cn || j.name || '').trim(); if (!t || seen.has(t)) return false; seen.add(t); return true; }).map(j => ({ id: j.id, title: j.title_cn || j.name, function: j.job_function, has_jd: !!j.responsibilities }));
  }
  const { data: roles } = await db.from('ws_roles').select('*').eq('org_id', org.id).order('created_at');
  const { data: contribs } = await db.from('ws_contributions').select('field, new_value, status, created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(50);
  return { company, jobs, roles: roles || [], contributions: contribs || [], context: org.context || {}, setup_step: org.setup_step || 'done' };
}

/** 第二步保存：公开字段回流平方（空的直接填，不一样的进待审核），内部字段只存工作台 */
export async function saveContext(org: WsOrg, email: string, pub: Record<string, string>, priv: Record<string, string>) {
  const applied: string[] = [], pending: string[] = [];
  if (org.company_id && pub && Object.keys(pub).length) {
    const keys = knowhow(org.kind).pub.map(f => f.key).filter(k => k in pub);
    const { data: c } = await db.from('companies').select(['human_locked_fields', ...keys].join(', ')).eq('id', org.company_id).single();
    const up: Record<string, any> = {};
    for (const k of keys) {
      const v = String(pub[k] ?? '').trim().slice(0, 4000); const cur = (c as any)?.[k];
      if (!v || v === String(cur ?? '').trim()) continue;
      if (cur == null || cur === '') { up[k] = v; applied.push(k); await db.from('ws_contributions').insert({ org_id: org.id, entity_type: 'company', entity_id: String(org.company_id), field: k, old_value: null, new_value: v, status: 'applied', created_by: email }); }
      else { pending.push(k); await db.from('ws_contributions').insert({ org_id: org.id, entity_type: 'company', entity_id: String(org.company_id), field: k, old_value: String(cur).slice(0, 4000), new_value: v, status: 'pending', created_by: email }); }
    }
    if (Object.keys(up).length) await db.from('companies').update({ ...up, updated_at: new Date().toISOString() }).eq('id', org.company_id);
  }
  const ctx: Record<string, string> = {};
  for (const f of knowhow(org.kind).priv) if (priv && f.key in priv) ctx[f.key] = String(priv[f.key] || '').trim().slice(0, 2000);
  const { data: o } = await db.from('ws_orgs').select('context').eq('id', org.id).single();
  await db.from('ws_orgs').update({ context: { ...(o?.context || {}), ...ctx } }).eq('id', org.id);
  return { applied, pending };
}

/** 第三步：加一个岗位。job_id = 平方岗位库里的；没有就用 jd_text 在平方岗位库新建（反哺） */
export async function addRole(org: WsOrg, email: string, input: { title: string; job_id?: number | null; jd_text?: string; city?: string; notes?: Record<string, string> }) {
  const title = String(input.title || '').trim().slice(0, 60); if (!title) throw new Error('岗位名不能为空');
  let jobId = input.job_id ? Number(input.job_id) : null; let created = false;
  const jd = String(input.jd_text || '').trim().slice(0, 12000);
  if (!jobId && jd.length >= 40 && org.company_id) {
    const { data: c } = await db.from('companies').select('name').eq('id', org.company_id).single();
    const { data: j, error } = await db.from('jobs').insert({ name: title, company_id: org.company_id, institute_or_company_name: c?.name || org.name, responsibilities: jd, source: SOURCE, human_review_status: 'review' }).select('id').single();
    if (error) throw new Error(`写回岗位库失败：${error.message}`);
    jobId = j.id; created = true;
    await db.from('ws_contributions').insert({ org_id: org.id, entity_type: 'job', entity_id: String(j.id), field: '*', new_value: JSON.stringify({ name: title, responsibilities: jd.slice(0, 2000) }), status: 'applied', created_by: email });
  }
  const occ: any = await findOccupation({ name: title }).catch(() => null);
  const notes: Record<string, string> = {}; for (const f of knowhow(org.kind).role) if (input.notes?.[f.key]) notes[f.key] = String(input.notes[f.key]).trim().slice(0, 1000);
  const { data, error } = await db.from('ws_roles').insert({ org_id: org.id, title, job_id: jobId, occupation_id: occ?.id ?? null, city: input.city || null, jd_text: jd || null, notes, created_by: email }).select('*').single();
  if (error) throw new Error(error.message);
  return { role: data, created_job: created, occupation: occ ? { id: occ.id, name: occ.name } : null };
}

/** 给 AI 用的企业 / 岗位内部上下文（拼进出题、找问题的提示里） */
export async function privateContext(orgId: string, roleTitle?: string): Promise<string> {
  let r: any = await db.from('ws_orgs').select('context, kind').eq('id', orgId).maybeSingle(); if (r.error) r = await db.from('ws_orgs').select('context').eq('id', orgId).maybeSingle();
  const o = r.data; const K = knowhow(o?.kind);
  const lines: string[] = [];
  for (const f of K.priv) { const v = o?.context?.[f.key]; if (v) lines.push(`${f.label}：${v}`); }
  if (roleTitle) {
    const { data: r } = await db.from('ws_roles').select('title, notes, jd_text').eq('org_id', orgId).ilike('title', `%${roleTitle}%`).limit(1);
    const role = r?.[0];
    if (role) { for (const f of K.role) { const v = role.notes?.[f.key]; if (v) lines.push(`岗位「${role.title}」${f.label}：${v}`); } if (role.jd_text) lines.push(`岗位「${role.title}」企业提供的 JD：${role.jd_text.slice(0, 1500)}`); }
  }
  return lines.length ? `${o?.kind === 'research' ? '本机构' : '企业'}自己填的内部情况（只在本工作台可见）：\n${lines.join('\n')}` : '';
}
