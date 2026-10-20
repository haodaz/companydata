/**
 * 百业 ToB 工作台 · 企业（2026-10-20）。
 * 两层：平台运营（我们的百业工厂、真活出题，可以生成任何企业的内容）／企业工作台（一个企业用户绑定一家企业，AI 只能围绕自己企业生成）。
 * 一个账号先只认一家企业（ws_members 里第一条）；平台管理员可以 ?org= 切换。表在迁移 037。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import type { SessionUser } from '@/lib/session';

export interface WsOrg { id: string; name: string; company_id: number | null; company_name: string | null; role: string }

export async function getOrg(user: SessionUser, orgId?: string | null): Promise<WsOrg | null> {
  if (orgId && user.role === 'admin') {
    const { data } = await db.from('ws_orgs').select('id, name, company_id, company_name').eq('id', orgId).maybeSingle();
    return data ? { ...data, role: 'admin' } as WsOrg : null;
  }
  const { data: m, error } = await db.from('ws_members').select('org_id, role, created_at').eq('email', user.email).order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error(/relation|does not exist|Could not find the table/.test(error.message) ? '工作台的表还没建：请先跑迁移 037_workspace.sql' : error.message);
  if (!m?.length) return null;
  const { data: o } = await db.from('ws_orgs').select('id, name, company_id, company_name').eq('id', m[0].org_id).maybeSingle();
  return o ? { ...o, role: m[0].role } as WsOrg : null;
}

export async function createOrg(user: SessionUser, input: { name: string; company_id?: number | null; company_name?: string | null }): Promise<WsOrg> {
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw new Error('企业名称不能为空');
  const { data: o, error } = await db.from('ws_orgs').insert({ name, company_id: input.company_id ?? null, company_name: input.company_name || name, created_by: user.email }).select('id, name, company_id, company_name').single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await db.from('ws_members').insert({ org_id: o.id, email: user.email, role: 'owner' });
  if (e2) throw new Error(e2.message);
  return { ...o, role: 'owner' } as WsOrg;
}
