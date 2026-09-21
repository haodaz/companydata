import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { solveWithSkill } from '@/lib/agents/skill-lab';
import { labError, loadSpace, skillRef } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 解决问题：把一个真实问题丢给这个空间的技能 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { problem, actor, location, tz, context, model } = await req.json();
    if (!problem || String(problem).trim().length < 10) return NextResponse.json({ ok: false, error: '把问题说具体一点' }, { status: 400 });

    const space = await loadSpace(id);
    const skill = skillRef(space.skill);
    if (!skill) return NextResponse.json({ ok: false, error: '这个空间还没有蒸馏出技能。先到「专家蒸馏」让专家走一遍。' }, { status: 400 });

    const { output, summary } = await solveWithSkill(String(problem), skill, model || undefined);
    const { data, error } = await supabaseAdmin.from('skill_invocations').insert({
      skill_id: space.skill_id, task_id: id, kind: 'solve',
      actor: String(actor || '').trim() || '匿名', actor_location: String(location || ''), tz_offset: typeof tz === 'number' ? tz : null,
      context: String(context || ''), input: String(problem), output, output_summary: summary,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, invocation: data });
  } catch (e: any) {
    console.error('[Lab/solve]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
