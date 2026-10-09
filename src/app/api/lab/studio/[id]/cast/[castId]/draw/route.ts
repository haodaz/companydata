import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { drawCastAsset } from '@/lib/lab-cast-server';
import { artAvailable } from '@/lib/lab-art';
import { familyOf } from '@/lib/career-family';
import type { CastMember } from '@/lib/lab-cast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string; castId: string }> };

/** 给角色现画一张（按外形 / 陈设描述），画完立刻归库并换上；约 20–60 秒 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const { id, castId } = await params;
    if (!artAvailable()) return NextResponse.json({ ok: false, error: '没有配置画图（DASHSCOPE_API_KEY）' }, { status: 400 });
    const [{ data: m, error }, { data: t }] = await Promise.all([
      supabaseAdmin.from('lab_cast').select('*').eq('id', castId).eq('task_id', id).single(),
      supabaseAdmin.from('skill_tasks').select('jd_snapshot').eq('id', id).single(),
    ]);
    if (error) throw error;
    if (m.is_self) return NextResponse.json({ ok: false, error: '数字职人本人的形象不在这里画' }, { status: 400 });
    const jd: any = (t as any)?.jd_snapshot || {};
    const a = await drawCastAsset(id, m as CastMember, familyOf(jd.career?.profession, jd.title));
    return NextResponse.json({ ok: true, asset: a });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
