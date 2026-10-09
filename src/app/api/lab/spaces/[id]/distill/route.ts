import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { buildSkillCard } from '@/lib/agents/skill-lab';
import { labError, loadSpace } from '@/lib/skill-lab-server';
import { INVITED, INVITED_BY } from '@/lib/lab-invite';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 专家蒸馏 · 生成技能卡：专家走一遍的作答 + 访谈 → 技能卡，挂到这个空间上（已有技能则更新，专业度叠加） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { turns, walkthrough, expert, model, createdBy, trace, chapterTraces } = await req.json();
    if (!Array.isArray(turns) || turns.filter((t: any) => t.role === 'expert').length < 2) {
      return NextResponse.json({ ok: false, error: '至少回答 2 个问题再生成技能卡' }, { status: 400 });
    }
    // 技能卡必须写清楚手艺来自谁、来自哪儿。以前缺了就退回草案的占位值，
    // 于是出现「这门手艺是 岗位 AI 自学草案（云端）教我的」，「云端」还被首页算成了一个手艺来处
    const who = String(expert?.name || '').trim(), where = String(expert?.location || '').trim();
    if (!who || !where) return NextResponse.json({ ok: false, error: '需要专家的姓名（或化名）和所在地' }, { status: 400 });
    const space = await loadSpace(id);
    const topic = `${space.jd_snapshot?.company || ''} ${space.jd_snapshot?.title || ''} —— ${space.title}`;

    // 已有技能时把历史访谈一起蒸馏，技能越用越厚
    const history = space.skill?.interview || [];
    const allTurns = [...history, ...turns];
    const built = await buildSkillCard(topic, allTurns, model || undefined, String(walkthrough || ''));

    const row = {
      name: built.name, domain: built.domain, kind: built.kind, summary: built.summary, card: built.card, interview: allTurns,
      expert_name: who, expert_title: String(expert?.title || '').trim(), expert_note: '',
      expert_location: where, tz_offset: typeof expert?.tz === 'number' ? expert.tz : space.skill?.tz_offset ?? null,
      ...(trace ? { expert_trace: trace } : {}),
      source: 'interview', assigned_agent: 'qa', distilled_at: new Date().toISOString(),
      // 受邀来教的：记成「谁发的邀请」，以后能追到这位老师傅是谁请来的
      created_by: req.headers.get(INVITED) === id ? `invite:${decodeURIComponent(req.headers.get(INVITED_BY) || '')}` : (createdBy || ''),
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
    // 一天里第 2 段以后的示范存回各段（第 1 段的示范跟着技能走，上面已经写进 expert_trace）
    if (chapterTraces && typeof chapterTraces === 'object') {
      const ids = new Set((space.chapters || []).filter((c: any) => c.id && c.seq !== 1).map((c: any) => c.id));
      for (const [cid, tr] of Object.entries(chapterTraces)) if (ids.has(cid) && tr && typeof tr === 'object') await supabaseAdmin.from('lab_chapters').update({ expert_trace: tr, updated_at: new Date().toISOString() }).eq('id', cid);
    }
    return NextResponse.json({ ok: true, skillId, skill: { id: skillId, ...row } });
  } catch (e: any) {
    console.error('[Lab/distill]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
