import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { answerTask, gradeAnswer, operateSim } from '@/lib/agents/skill-lab';
import { sanitizeTrace, traceMatch, traceToText, type Sim, type SimTrace } from '@/lib/skill-sim';
import { chapterExpertTrace, chapterTask, labError, loadSpace, pickChapter, recordInvocation, skillRef } from '@/lib/skill-lab-server';
import { INVITED } from '@/lib/lab-invite';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 走一遍任务并评分。人和 AI 用同一套标准。
 * body: { mode: 'human' | 'expert' | 'ai', chapterId?, name?, note?, location?, tz?, answer?, withSkill?, model? }
 * chapterId：答的是哪一章（不给 = 第一章）；按那一章的故事线和示范轨迹评分
 * 空间里已有专家技能时，评分会带上专家的判断规则，并在账本里记一笔。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const mode: 'human' | 'expert' | 'ai' = ['expert', 'ai'].includes(body.mode) ? body.mode : 'human';
    // 受邀的老师傅只来教，不来考人、也不替 AI 作答
    if (req.headers.get(INVITED) === id && mode !== 'expert') return NextResponse.json({ ok: false, error: '邀请链接只能用来教' }, { status: 403 });
    const model = body.model || undefined;

    const space = await loadSpace(id);
    const skill = skillRef(space.skill);
    const withSkill = mode === 'ai' && !!body.withSkill && !!skill;

    // 有模拟操作台就上台操作：轨迹的文字记录 + 最后一步的结论 = 交给评分的「作答」
    const chapter = pickChapter(space, body.chapterId);
    const sim: Sim | null = chapter?.sim?.steps?.length ? chapter.sim : null;
    let trace: SimTrace | null = null;
    let answer = String(body.answer || '').trim();
    if (sim) {
      // AI 模式带了轨迹（「我教你」屏幕上演示的那一遍）就直接评它；没带才让模型自己上台操作
      const given = body.trace && typeof body.trace === 'object' ? sanitizeTrace(sim, body.trace) : null;
      trace = given && Object.keys(given).length ? given : mode === 'ai' ? await operateSim({ ...space, ...chapterTask(space, chapter) }, sim, withSkill ? skill : null, model) : sanitizeTrace(sim, body.trace);
      answer = traceToText(sim, trace);
    } else if (mode === 'ai') answer = await answerTask(space, withSkill ? skill : null, model);
    if (answer.length < 20) return NextResponse.json({ ok: false, error: '作答太短了，至少写几句' }, { status: 400 });

    // 按这一章自己的题面和评分标准评（第 1 章用空间的）
    const { score, grading } = await gradeAnswer(chapterTask(space, chapter), answer, skill, model);

    const name = mode === 'ai' ? (withSkill ? 'AI + 专家技能' : 'AI 裸答') : String(body.name || '').trim() || (mode === 'expert' ? '专家' : '匿名新兵');
    const row: Record<string, any> = {
      task_id: id, candidate_name: name, candidate_type: mode,
      candidate_note: mode === 'ai' ? `${model || 'gemini-3.8-flash'}${withSkill ? ` · 装配「${skill!.name}」` : ' · 未装配技能'}` : String(body.note || ''),
      candidate_location: mode === 'ai' ? '云端' : String(body.location || ''),
      with_skill_id: withSkill ? space.skill_id : null,
      answer, score, grading, trace,
      match: sim && trace ? traceMatch(sim, trace, chapterExpertTrace(chapter, space)) : null,
      graded_with_skill_id: skill ? space.skill_id : null,
      graded_by_model: model || 'gemini-3.8-flash',
      ...(chapter?.id ? { chapter_id: chapter.id } : {}),
      // 体验者的访客编号（浏览器生成；登录用户是 u:<账号>）：「我的历史 / 证书库」按它找（迁移 017）
      ...(mode === 'human' && body.visitor ? { visitor_id: String(body.visitor).slice(0, 80) } : {}),
    };
    let { data: sub, error } = await supabaseAdmin.from('skill_submissions').insert(row).select().single();
    // 迁移 015 还没跑时没有 chapter_id 列：去掉再写
    // 迁移 015 / 017 还没跑时少列：缺哪列去掉哪列再写
    for (const col of ['visitor_id', 'chapter_id']) {
      if (error && new RegExp(col).test(error.message || '')) { delete row[col]; ({ data: sub, error } = await supabaseAdmin.from('skill_submissions').insert(row).select().single()); }
    }
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
