import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessLabOwner } from '@/lib/lab-owner';
import { labError } from '@/lib/skill-lab-server';
import { loadStudio } from '@/lib/lab-studio-server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { recordEdit } from '@/lib/lab-edits';
import { cleanSpec, hasSpec } from '@/lib/lab-spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** 工作室读空间：所有章节（含草稿、含还没有步骤的）+ 校验结果。LAB_PUBLIC 下也要登录（见 proxy） */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    return NextResponse.json({ ok: true, ...(await loadStudio(id)) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

/**
 * 改这个空间的生成要求（11-06）：{ spec } → jd_snapshot.spec。只改要求，不动已生成的内容；
 * 之后排一天、写 / 重写每一章、出评分标准都按新的来（锁定的章节照旧不动）。
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    const b = await req.json().catch(() => ({}));
    const { data: t, error } = await supabaseAdmin.from('skill_tasks').select('jd_snapshot').eq('id', id).single();
    if (error) throw error;
    const before = (t?.jd_snapshot as any)?.spec || null;
    const spec = cleanSpec(b.spec || {});
    const jd = { ...((t?.jd_snapshot as any) || {}), spec: hasSpec(spec) ? spec : undefined };
    const { error: e2 } = await supabaseAdmin.from('skill_tasks').update({ jd_snapshot: jd }).eq('id', id);
    if (e2) throw e2;
    const me = await getSessionUser(req).catch(() => null);
    await recordEdit({ task_id: id, source: 'studio', actor: me?.email || null, before: { spec: before }, after: { spec: jd.spec || null } }).catch(() => {});
    return NextResponse.json({ ok: true, spec: jd.spec || null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
