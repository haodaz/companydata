import { NextRequest } from 'next/server';
import { guard, fail, ok } from '../_guard';
import { supabaseAdmin as db } from '@/lib/supabase';
import { addMaterial, labLink, listMaterials, updateMaterial } from '@/lib/college-private';
export const runtime = 'nodejs';

/** 私域课材料（迁移 061）：GET ?org= 这家的材料 + 科研机构列表 + 这家的私域题；POST 加一份（{ action: 'lab_link', org_id } = 生成 / 取回实验室入口链接，迁移 062）；PATCH { id, title?, body?, kind? } 改（改过 source 变 lab）；DELETE ?id= 软删 */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try {
    const org = req.nextUrl.searchParams.get('org') || '';
    const { data: orgs } = await db.from('ws_orgs').select('id, name, kind').eq('kind', 'research').order('name');
    const materials = org ? await listMaterials(org) : [];
    const { data: exams } = org ? await db.from('college_research_exams').select('id, title, status, review_token').eq('org', org) : { data: [] as any[] };
    return ok({ orgs: orgs || [], materials, exams: exams || [] });
  } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { const b = await req.json(); if (b.action === 'lab_link') return ok({ token: await labLink(String(b.org_id), g.user?.email || 'admin') }); return ok({ id: await addMaterial({ org_id: String(b.org_id), kind: b.kind, title: String(b.title || ''), body: String(b.body || ''), source: 'lab', created_by: g.user?.email || null }) }); } catch (e) { return fail(e); }
}
export async function PATCH(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { const b = await req.json(); await updateMaterial(String(b.id), { ...(b.title ? { title: String(b.title) } : {}), ...(b.body ? { body: String(b.body) } : {}), ...(b.kind ? { kind: b.kind } : {}) }, g.user?.email || 'admin'); return ok({}); } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { await db.from('college_private_materials').update({ if_delete: true, updated_at: new Date().toISOString() }).eq('id', req.nextUrl.searchParams.get('id') || ''); return ok({}); } catch (e) { return fail(e); }
}
