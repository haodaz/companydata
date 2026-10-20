/**
 * 百业 ToB 工作台 · 企业（2026-10-20）。
 * 两层：平台运营（我们的百业工厂、真活出题，可以生成任何企业的内容）／企业工作台（一个企业用户绑定一家企业，AI 只能围绕自己企业生成）。
 * 一个账号先只认一家企业（ws_members 里第一条）；平台管理员可以 ?org= 切换。表在迁移 037。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import type { SessionUser } from '@/lib/session';

export type OrgKind = 'company' | 'research';
export interface WsOrg { id: string; name: string; company_id: number | null; company_name: string | null; role: string; website?: string | null; context?: Record<string, string>; setup_step?: string; kind?: OrgKind }
const COLS = 'id, name, company_id, company_name, website, context, setup_step, kind';
const COLS1 = 'id, name, company_id, company_name, website, context, setup_step';   // 迁移 040 没跑时
const COLS0 = 'id, name, company_id, company_name';   // 迁移 038 没跑时
async function readOrg(id: string) { let r: any = await db.from('ws_orgs').select(COLS).eq('id', id).maybeSingle(); if (r.error) r = await db.from('ws_orgs').select(COLS1).eq('id', id).maybeSingle(); if (r.error) r = await db.from('ws_orgs').select(COLS0).eq('id', id).maybeSingle(); return r.data ? { kind: 'company', ...r.data } : null; }

export async function getOrg(user: SessionUser, orgId?: string | null): Promise<WsOrg | null> {
  if (orgId && user.role === 'admin') {
    const data = await readOrg(orgId);
    return data ? { ...data, role: 'admin' } as WsOrg : null;
  }
  const { data: m, error } = await db.from('ws_members').select('org_id, role, created_at').eq('email', user.email).order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error(/relation|does not exist|Could not find the table/.test(error.message) ? '工作台的表还没建：请先跑迁移 037_workspace.sql' : error.message);
  if (!m?.length) return null;
  const o = await readOrg(m[0].org_id);
  return o ? { ...o, role: m[0].role } as WsOrg : null;
}

export async function createOrg(user: SessionUser, input: { name: string; company_id?: number | null; company_name?: string | null; website?: string | null; kind?: OrgKind }): Promise<WsOrg> {
  const kind: OrgKind = input.kind === 'research' ? 'research' : 'company';
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw new Error('企业名称不能为空');
  // 平方企业库里没有这家：当场在库里新建（来源「企业工作台」、待审核），之后 AI 联网补画像——企业从注册这一刻就落到平方的实体上
  let companyId = input.company_id ?? null;
  if (!companyId) { const { createCompanyEntity } = await import('@/lib/ws/setup'); companyId = await createCompanyEntity(input.company_name || name, input.website || null, user.email); }
  const base = { name, company_id: companyId, company_name: input.company_name || name, created_by: user.email };
  let r: any = await db.from('ws_orgs').insert({ ...base, website: input.website || null, setup_step: 'context', kind }).select(COLS).single();
  if (r.error) r = await db.from('ws_orgs').insert({ ...base, website: input.website || null, setup_step: 'context' }).select(COLS1).single();
  if (r.error) r = await db.from('ws_orgs').insert(base).select(COLS0).single();
  if (r.error) throw new Error(r.error.message);
  const { error: e2 } = await db.from('ws_members').insert({ org_id: r.data.id, email: user.email, role: 'owner' });
  if (e2) throw new Error(e2.message);
  return { kind, ...r.data, role: 'owner' } as WsOrg;
}
