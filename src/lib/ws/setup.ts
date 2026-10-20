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
/** 企业可以改、会回流平方的公开字段 */
export const PUBLIC_FIELDS: { key: string; label: string; hint: string; long?: boolean }[] = [
  { key: 'official_website', label: '官网', hint: 'https://…' },
  { key: 'industry', label: '行业', hint: '如 新能源 / 动力电池' },
  { key: 'one_sentence', label: '一句话介绍', hint: '你们是做什么的' },
  { key: 'introduction', label: '企业简介', hint: '主营业务、规模、位置', long: true },
  { key: 'business_profile', label: '业务与客户', hint: '业务线、主要客户、市场', long: true },
  { key: 'product_area', label: '产品与服务', hint: '主要产品', long: true },
];
/** 只留在工作台的内部信息（AI 出题、建空间时的上下文） */
export const PRIVATE_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'priorities', label: '眼下最想解决的事', hint: '比如：新厂爬坡供应跟不上、海外客户回款慢、新品上市要打通研产销' },
  { key: 'team', label: '团队情况', hint: '人数、几个部门、谁带谁' },
  { key: 'hiring', label: '用人偏好', hint: '看重什么、不要什么样的人' },
];
export const ROLE_NOTES: { key: string; label: string; hint: string }[] = [
  { key: 'reports_to', label: '汇报给谁', hint: '比如 供应链总监' },
  { key: 'hardest', label: '这个岗位最难的地方', hint: '真实工作里最容易出错 / 最考人的环节' },
  { key: 'want', label: '想要什么样的人', hint: '经验、性格、能力' },
];

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
export async function loadSetup(org: WsOrg & { context?: any; website?: string | null; setup_step?: string }) {
  let company: any = null, jobs: any[] = [];
  if (org.company_id) {
    const { data } = await db.from('companies').select(['id', 'name', 'brief_name', 'city', 'completeness_score', 'source', 'human_review_status', ...PUBLIC_FIELDS.map(f => f.key)].join(', ')).eq('id', org.company_id).maybeSingle();
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
    const keys = PUBLIC_FIELDS.map(f => f.key).filter(k => k in pub);
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
  for (const f of PRIVATE_FIELDS) if (priv && f.key in priv) ctx[f.key] = String(priv[f.key] || '').trim().slice(0, 2000);
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
  const notes: Record<string, string> = {}; for (const f of ROLE_NOTES) if (input.notes?.[f.key]) notes[f.key] = String(input.notes[f.key]).trim().slice(0, 1000);
  const { data, error } = await db.from('ws_roles').insert({ org_id: org.id, title, job_id: jobId, occupation_id: occ?.id ?? null, city: input.city || null, jd_text: jd || null, notes, created_by: email }).select('*').single();
  if (error) throw new Error(error.message);
  return { role: data, created_job: created, occupation: occ ? { id: occ.id, name: occ.name } : null };
}

/** 给 AI 用的企业 / 岗位内部上下文（拼进出题、找问题的提示里） */
export async function privateContext(orgId: string, roleTitle?: string): Promise<string> {
  const { data: o } = await db.from('ws_orgs').select('context').eq('id', orgId).maybeSingle();
  const lines: string[] = [];
  for (const f of PRIVATE_FIELDS) { const v = o?.context?.[f.key]; if (v) lines.push(`${f.label}：${v}`); }
  if (roleTitle) {
    const { data: r } = await db.from('ws_roles').select('title, notes, jd_text').eq('org_id', orgId).ilike('title', `%${roleTitle}%`).limit(1);
    const role = r?.[0];
    if (role) { for (const f of ROLE_NOTES) { const v = role.notes?.[f.key]; if (v) lines.push(`岗位「${role.title}」${f.label}：${v}`); } if (role.jd_text) lines.push(`岗位「${role.title}」企业提供的 JD：${role.jd_text.slice(0, 1500)}`); }
  }
  return lines.length ? `企业自己填的内部情况（只在本企业工作台可见）：\n${lines.join('\n')}` : '';
}
