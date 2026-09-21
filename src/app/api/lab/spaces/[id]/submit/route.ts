import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { answerTask, gradeAnswer, operateSim } from '@/lib/agents/skill-lab';
import { sanitizeTrace, traceMatch, traceToText, type Sim, type SimTrace } from '@/lib/skill-sim';
import { labError, loadSpace, recordInvocation, skillRef } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 走一遍任务并评分。人和 AI 用同一套标准。
 * body: { mode: 'human' | 'expert' | 'ai', name?, note?, location?, tz?, answer?, withSkill?, model? }
 * 空间里已有专家技能时，评分会带上专家的判断规则，并在账本里记一笔。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const mode: 'human' | 'expert' | 'ai' = ['expert', 'ai'].includes(body.mode) ? body.mode : 'human';
    const model = body.model || undefined;

    const space = await loadSpace(id);
    const skill = skillRef(space.skill);
    const withSkill = mode === 'ai' && !!body.withSkill && !!skill;

    // 有模拟操作台就上台操作：轨迹的文字记录 + 最后一步的结论 = 交给评分的「作答」
    const sim: Sim | null = space.sim?.steps?.length ? space.sim : null;
    let trace: SimTrace | null = null;
    let answer = String(body.answer || '').trim();
    if (sim) {
      trace = mode === 'ai' ? await operateSim(space, sim, withSkill ? skill : null, model) : sanitizeTrace(sim, body.trace);
      answer = traceToText(sim, trace);
    } else if (mode === 'ai') answer = await answerTask(space, withSkill ? skill : null, model);
    if (answer.length < 20) return NextResponse.json({ ok: false, error: '作答太短了，至少写几句' }, { status: 400 });

    const { score, grading } = await gradeAnswer(space, answer, skill, model);

    const name = mode === 'ai' ? (withSkill ? 'AI + 专家技能' : 'AI 裸答') : String(body.name || '').trim() || (mode === 'expert' ? '专家' : '匿名新兵');
    const { data: sub, error } = await supabaseAdmin.from('skill_submissions').insert({
      task_id: id, candidate_name: name, candidate_type: mode,
      candidate_note: mode === 'ai' ? `${model || 'gemini-3.8-flash'}${withSkill ? ` · 装配「${skill!.name}」` : ' · 未装配技能'}` : String(body.note || ''),
      candidate_location: mode === 'ai' ? '云端' : String(body.location || ''),
      with_skill_id: withSkill ? space.skill_id : null,
      answer, score, grading, trace,
      match: sim && trace ? traceMatch(sim, trace, space.skill?.expert_trace) : null,
      graded_with_skill_id: skill ? space.skill_id : null,
      graded_by_model: model || 'gemini-3.8-flash',
    }).select().single();
    if (error) throw error;

    // 账本：技能被用来评分 / 作答，各记一笔
    if (skill) {
      const base = { skill_id: space.skill_id, task_id: id, submission_id: sub.id, tz_offset: typeof body.tz === 'number' ? body.tz : null };
      if (withSkill) await recordInvocation({ ...base, kind: 'answer', actor: 'AI · 装配技能作答', actor_location: '云端', context: '同一模型，装配技能后走一遍任务。', output_summary: `得分 ${score}。` });
      await recordInvocation({ ...base, kind: 'grade', actor: `${name}${mode === 'human' ? ' · 新兵检验' : mode === 'expert' ? ' · 专家走一遍' : ''}`, actor_location: mode === 'ai' ? '云端' : String(body.location || ''), context: '专家不在场，由技能按专家的判断规则评分。', output_summary: `${score} 分。${grading.summary}`.slice(0, 300) });
    }

    return NextResponse.json({ ok: true, submission: sub });
  } catch (e: any) {
    console.error('[Lab/submit]', e);
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
