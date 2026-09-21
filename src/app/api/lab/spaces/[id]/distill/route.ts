import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildSkillCard } from '@/lib/agents/skill-lab';
import { labError, loadSpace } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 专家蒸馏 · 生成技能卡：专家走一遍的作答 + 访谈 → 技能卡，挂到这个空间上（已有技能则更新，专业度叠加） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { turns, walkthrough, expert, model, createdBy, trace } = await req.json();
    if (!Array.isArray(turns) || turns.filter((t: any) => t.role === 'expert').length < 2) {
      return NextResponse.json({ ok: false, error: '至少回答 2 个问题再生成技能卡' }, { status: 400 });
    }
    const space = await loadSpace(id);
    const topic = `${space.jd_snapshot?.company || ''} ${space.jd_snapshot?.title || ''} —— ${space.title}`;

    // 已有技能时把历史访谈一起蒸馏，技能越用越厚
    const history = space.skill?.interview || [];
    const allTurns = [...history, ...turns];
    const built = await buildSkillCard(topic, allTurns, model || undefined, String(walkthrough || ''));

    const row = {
      name: built.name, domain: built.domain, kind: built.kind, summary: built.summary, card: built.card, interview: allTurns,
      expert_name: expert?.name || space.skill?.expert_name || '', expert_title: expert?.title || space.skill?.expert_title || '',
      expert_location: expert?.location || space.skill?.expert_location || '', tz_offset: typeof expert?.tz === 'number' ? expert.tz : space.skill?.tz_offset ?? null,
      ...(trace ? { expert_trace: trace } : {}),
      source: 'interview', assigned_agent: 'qa', distilled_at: new Date().toISOString(), created_by: createdBy || '',
    };

    let skillId = space.skill_id as string | null;
    if (skillId) {
      const { error } = await supabaseAdmin.from('skills').update(row).eq('id', skillId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseAdmin.from('skills').insert(row).select('id').single();
      if (error) throw error;
      skillId = data.id;
      await supabaseAdmin.from('skill_tasks').update({ skill_id: skillId }).eq('id', id);
    }
    return NextResponse.json({ ok: true, skillId, skill: { id: skillId, ...row } });
  } catch (e: any) {
    console.error('[Lab/distill]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
