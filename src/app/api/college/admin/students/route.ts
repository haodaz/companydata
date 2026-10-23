import { NextRequest } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { guard, fail, ok } from '../_guard';
import { backfillFromSubmissions, createStudent, ensurePlatformStudents, listStudents } from '@/lib/college-admin';
import { MODEL_OPTIONS } from '@/lib/model-options';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

/** 学员管理：GET 列表（平台模型自动建档）/ POST { ...学员 } 新建、{ action:'backfill' } 把已有 AI 作答归档成学籍 / PATCH { id, ... } */
export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try { await ensurePlatformStudents(); return ok({ data: await listStudents(), models: MODEL_OPTIONS.map(m => ({ id: m.id, label: m.label, provider: m.provider })) }); } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  try {
    const b = await req.json();
    if (b.action === 'backfill') return ok({ result: await backfillFromSubmissions(g.user.email) });
    return ok({ student: await createStudent(b, g.user.email) });
  } catch (e) { return fail(e); }
}
export async function PATCH(req: NextRequest) {
  const g = await guard(req); if (g.denied) return g.denied;
  const b = await req.json(); if (!b.id) return fail('缺 id', 400);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['name', 'api_style', 'endpoint', 'org', 'contact', 'phone', 'email', 'note']) if (typeof b[k] === 'string') patch[k] = b[k].slice(0, 500);
  if (b.model_id === null || (typeof b.model_id === 'string' && MODEL_OPTIONS.some(m => m.id === b.model_id))) patch.model_id = b.model_id;
  if (['active', 'suspended'].includes(b.status)) patch.status = b.status;
  const { error } = await db.from('college_students').update(patch).eq('id', b.id);
  return error ? fail(error) : ok({});
}
