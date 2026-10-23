import { NextRequest } from 'next/server';
import { guard, fail, ok } from '../../_guard';
import { enrollmentDetail, recomputeEnrollment } from '@/lib/college-admin';
import { advance, attendClass, ensureLessons, nextStep, pickableWorkTasks, reflect, regradeEnrollment, runChapterExam, runWorkExam } from '@/lib/college-train';
export const runtime = 'nodejs'; export const maxDuration = 300;

/** 一份学籍：GET 全部（章节成绩、真活、笔记、分配、下一步、可考的真活）
 *  POST { action } 基础功能，每个都能人工单独点：
 *    entrance { chapter_id? }      入学考（裸考）
 *    class    { chapter_id }       上课（教案 → 要点进笔记）
 *    exam     { chapter_id }       毕业考（技能卡 + 笔记）
 *    reflect  { submission_id }    考后反思（错题本）
 *    work     { work_task_id }     做一道真活
 *    lessons  {}                   给课程补教案
 *    advance  { steps? }           按学习路径连做几步
 *    regrade  {}                   按学院口径重评这份学籍已有的作答（同一份答案、同一把尺）
 *    recompute {}                  重算成绩和状态 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req); if (g.denied) return g.denied;
  try {
    const { id } = await params;
    const d = await enrollmentDetail(id);
    const [next, works] = await Promise.all([nextStep(id).catch(e => ({ kind: 'blocked', label: String(e?.message || e) })), pickableWorkTasks(d.space_id)]);
    return ok({ data: { ...d, next, work_options: works } });
  } catch (e) { return fail(e); }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req); if (g.denied) return g.denied;
  try {
    const { id } = await params; const b = await req.json();
    switch (b.action) {
      case 'entrance': return ok({ result: await runChapterExam(id, b.chapter_id || null, false) });
      case 'class': return ok({ result: await attendClass(id, String(b.chapter_id)) });
      case 'exam': return ok({ result: await runChapterExam(id, String(b.chapter_id), true) });
      case 'reflect': return ok({ result: await reflect(id, String(b.submission_id)) });
      case 'work': return ok({ result: await runWorkExam(id, String(b.work_task_id)) });
      case 'lessons': return ok({ result: await ensureLessons((await enrollmentDetail(id)).space_id, Number(b.max) || 6) });
      case 'advance': return ok({ result: await advance(id, Math.min(5, Number(b.steps) || 3)) });
      case 'regrade': return ok({ result: await regradeEnrollment(id) });   // 按学院口径重评已有作答
      case 'recompute': return ok({ result: await recomputeEnrollment(id) });
      default: return fail('不认识的操作', 400);
    }
  } catch (e) { return fail(e); }
}
