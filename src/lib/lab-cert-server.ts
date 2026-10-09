/** AI 百业 · 证书与成绩单（服务端）：作答 → 证书数据（等级、维度、超过多少人、和老师傅一致度、分析） */
import { supabaseAdmin } from '@/lib/supabase';
import { chapterTask, loadSpace } from '@/lib/skill-lab-server';
import { band, bandLevel, certNo } from '@/lib/lab-cert';
import { generateCheap } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';

/** 这一行对社会的价值（证书画作页用）：每个空间第一次开证书时用便宜模型写一次，存进 profile.social_value */
async function socialValue(space: any): Promise<{ headline: string; lines: string[] } | null> {
  const cur = space.profile?.social_value;
  if (cur?.headline) return cur;
  try {
    const jd = space.jd_snapshot || {};
    const r = await generateCheap(`
职业：${space.profile?.role || jd.career?.profession || jd.title}（${jd.title || ''}）
岗位职责：${String(jd.responsibilities || '').slice(0, 600)}
写这个职业对社会的价值，用在职业体验证书的画作页上：
- headline：一句话，16 字以内，具体、有分量，不喊口号（例：「把每一台手术，做成病人能回家的那一台」）
- lines：3 条，每条 30 字以内，各讲一个具体的人群或场景（谁因为这一行而得到了什么）
- 不写任何数字、百分比、倍数和统计结论（这是给投资人和学生看的证书，编出来的数字是硬伤）
返回 JSON：{ "headline": "", "lines": ["", "", ""] }`, 'qwen-plus', { jsonMode: true });
    const p = parseJsonLoose(r.text);
    const v = { headline: String(p.headline || '').slice(0, 40), lines: (Array.isArray(p.lines) ? p.lines : []).map((x: any) => String(x).slice(0, 60)).filter(Boolean).slice(0, 3) };
    if (!v.headline) return null;
    await supabaseAdmin.from('skill_tasks').update({ profile: { ...(space.profile || {}), social_value: v } }).eq('id', space.id);
    return v;
  } catch { return null; }
}

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
  let q = supabaseAdmin.from('skill_submissions').select('score, grading, candidate_type').eq('task_id', sub.task_id).in('candidate_type', ['human', 'expert']);
  q = chapter?.id && idx > 0 ? q.eq('chapter_id', chapter.id) : chapter?.id ? q.or(`chapter_id.eq.${chapter.id},chapter_id.is.null`) : q;
  const { data: peers } = await q;
  const scores = (peers || []).map((p: any) => p.score ?? 0);
  const beat = scores.length > 1 ? Math.round((scores.filter(s => s < (sub.score ?? 0)).length / (scores.length - 1)) * 100) : null;
  const dims = (sub.grading?.dimensions || []).map((d: any) => {
    const r = (task.rubric || []).find((x: any) => x.key === d.key);
    return { key: d.key, name: r?.name || d.key, weight: r?.weight || 0, score: d.score, band: band(d.score, r?.weight || 0), comment: d.comment };
  }).filter((d: any) => d.weight);
  const overall = band(sub.score);
  // 图表页：同段体验者各维度平均、老师傅示范的各维度、分数分布
  const avgOf = (rows: any[]) => Object.fromEntries((task.rubric || []).map((r: any) => {
    const v = rows.map(p => (p.grading?.dimensions || []).find((d: any) => d.key === r.key)?.score).filter((x: any) => typeof x === 'number');
    return [r.key, v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : null];
  }));
  const humans = (peers || []).filter((p: any) => p.candidate_type === 'human');
  const experts = (peers || []).filter((p: any) => p.candidate_type === 'expert');
  // 画作页：这一段的场景图、一起工作的人
  const sim = chapter?.sim;
  const cast: any[] = space.cast || [];
  const steps: any[] = sim?.steps || [];
  const people = cast.filter(m => m.kind === 'person' && !m.is_self && m.image && steps.some(s => s.scene?.who === m.name)).slice(0, 5).map(m => ({ name: m.name, role: String(m.type_name || '').split('·')[0], image: m.image }));
  const place = cast.find(m => m.kind === 'place' && m.image && !m.name.startsWith('工位') && steps.some(s => s.place === m.id || sim?.art?.scenes?.[s.id] === m.image));
  const value = await socialValue(space);
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
    art: { scene: place?.image || sim?.art?.cover || '', place: place?.name || '', people, value },
    charts: { avg: avgOf(humans), expert: experts.length ? avgOf(experts.slice(-1)) : null, dist: scores },
    mine: (v: string[]) => !!sub.visitor_id && v.includes(sub.visitor_id),
    visitor_id: sub.visitor_id as string | null,
  };
}
