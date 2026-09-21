import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError, loadSpace } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const space = await loadSpace(id);
    const [subs, invs] = await Promise.all([
      supabaseAdmin.from('skill_submissions').select('*').eq('task_id', id).order('submitted_at', { ascending: true }),
      supabaseAdmin.from('skill_invocations').select('*').eq('task_id', id).order('occurred_at', { ascending: true }),
    ]);
    return NextResponse.json({ ok: true, space, submissions: subs.data || [], invocations: invs.data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

/** 删除技能空间（作答与账本级联删除；蒸馏出的技能一并删除） */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const space = await loadSpace(id);
    const { error } = await supabaseAdmin.from('skill_tasks').delete().eq('id', id);
    if (error) throw error;
    if (space.skill_id) await supabaseAdmin.from('skills').delete().eq('id', space.skill_id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
