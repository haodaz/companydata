/** AI 百业 · 证书与成绩单（服务端）：作答 → 证书数据（等级、维度、超过多少人、和老师傅一致度、分析） */
import { supabaseAdmin } from '@/lib/supabase';
import { chapterTask, loadSpace } from '@/lib/skill-lab-server';
import { band, bandLevel, certNo } from '@/lib/lab-cert';

export async function certData(sid: string) {
  const { data: sub, error } = await supabaseAdmin.from('skill_submissions').select('*').eq('id', sid).single();
  if (error || !sub) throw new Error('证书不存在');
  if (sub.candidate_type === 'ai') throw new Error('AI 的作答不发证书');
  const space = await loadSpace(sub.task_id);
  const chapters: any[] = space.chapters || [];
  const chapter = chapters.find(c => c.id && c.id === sub.chapter_id) || chapters[0] || null;
  const idx = chapter ? chapters.indexOf(chapter) : 0;
  const task = chapterTask(space, chapter);
  // 同一段的真人作答里排第几（第 1 章的老作答没记章节）
  let q = supabaseAdmin.from('skill_submissions').select('score').eq('task_id', sub.task_id).in('candidate_type', ['human', 'expert']);
  q = chapter?.id && idx > 0 ? q.eq('chapter_id', chapter.id) : chapter?.id ? q.or(`chapter_id.eq.${chapter.id},chapter_id.is.null`) : q;
  const { data: peers } = await q;
  const scores = (peers || []).map((p: any) => p.score ?? 0);
  const beat = scores.length > 1 ? Math.round((scores.filter(s => s < (sub.score ?? 0)).length / (scores.length - 1)) * 100) : null;
  const dims = (sub.grading?.dimensions || []).map((d: any) => {
    const r = (task.rubric || []).find((x: any) => x.key === d.key);
    return { key: d.key, name: r?.name || d.key, weight: r?.weight || 0, score: d.score, band: band(d.score, r?.weight || 0), comment: d.comment };
  }).filter((d: any) => d.weight);
  const overall = band(sub.score);
  const skill = space.skill;
  const jd = space.jd_snapshot || {};
  return {
    id: sub.id, no: certNo(sub.id),
    candidate: { name: sub.candidate_name, note: sub.candidate_note, location: sub.candidate_location, type: sub.candidate_type },
    date: sub.submitted_at, score: sub.score, overall, level: bandLevel(overall), match: sub.match, beat, peers: scores.length,
    dims,
    analysis: { summary: sub.grading?.summary || '', gaps: (sub.grading?.gaps || []).slice(0, 3), suggestions: (sub.grading?.suggestions || []).slice(0, 3) },
    space: {
      id: space.id, title: space.title, name: space.profile?.name || '', role: space.profile?.role || '', avatar: space.profile?.avatar || '',
      profession: jd.career?.profession || jd.title || space.title, company: jd.kind === 'career' ? '' : jd.company || '',
    },
    chapter: chapter ? { id: chapter.id, n: idx + 1, total: chapters.length, slot: chapter.slot || '', title: chapter.title, kind: chapter.kind } : null,
    skill: skill ? { expert: skill.source === 'jd-draft' ? '' : skill.expert_name || '', location: skill.expert_location || '', draft: skill.source === 'jd-draft' } : null,
    mine: (v: string[]) => !!sub.visitor_id && v.includes(sub.visitor_id),
    visitor_id: sub.visitor_id as string | null,
  };
}
