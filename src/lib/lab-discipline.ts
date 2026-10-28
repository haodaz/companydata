/**
 * 研究岗空间的「学科地图」（2026-10-28）：研究岗（某课题组的博后 / 研究员）挂在哪个学科、学科里在研究什么、这个岗位在学科里的位置、
 * 新人进组第一周怎么过。第一次打开时生成（千问），存进 skill_tasks.jd_snapshot.discipline_map，之后直接读。
 * 学科部分复用职业探索的 discipline 模式（structureCareer）；同名学科空间已经有的，顺手给链接。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { logTokenUsage } from '@/lib/token-logger';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { structureCareer, type CareerMap } from '@/lib/agents/career';

const MODEL = 'qwen-plus';

export type DisciplineMap = CareerMap & {
  discipline: string; subfield: string; position: string; first_week: { day: string; activity: string }[];
  space_id?: string | null; built_at: string;
};

export async function buildDisciplineMap(spaceId: string, opts: { force?: boolean } = {}): Promise<DisciplineMap> {
  const { data: sp, error } = await db.from('skill_tasks').select('id, title, profile, jd_snapshot').eq('id', spaceId).single();
  if (error || !sp) throw new Error('没有这个空间');
  const jd: any = sp.jd_snapshot || {};
  if (jd.discipline_map && !opts.force) return { ...jd.discipline_map, space_id: await findDisciplineSpace(jd.discipline_map.discipline) };
  if (jd.kind !== 'research_post') throw new Error('只有研究岗空间有学科地图');

  // 1) 这个研究岗属于哪个学科 / 方向、在学科里的位置、新人第一周
  const post = `岗位：${jd.title || sp.title}\n单位：${jd.company || ''}\n职责：\n${String(jd.responsibilities || '').slice(0, 1500)}\n要求：\n${String(jd.qualifications || '').slice(0, 800)}`;
  const r = await generateContent(`下面是一个科研岗位（课题组招博士后 / 研究员 / 研究助理）。请你以带过很多学生的 PI 的身份回答，只写公认的学科常识，不编具体人名和论文。全部中文。
${post}

返回 JSON：
{
  "discipline": "这个岗位所属的学科（用一级或二级学科名，如「材料科学与工程」「电化学」「计算生物学」，不带「方向」二字）",
  "subfield": "具体研究方向（如「固态电池界面」），≤12 字",
  "position": "这个方向在学科里的位置：它解决学科里的什么问题、上游接什么（理论 / 材料 / 方法）、下游给谁用（器件 / 产业 / 临床），120–180 字，讲给本科生听",
  "first_week": [ { "day": "第 1 天", "activity": "新人进这个课题组第一周每天在做什么，一句话，具体到仪器 / 文献 / 安全培训 / 组会" } ]
}
first_week 写 5 天。`, MODEL, { jsonMode: true });
  await logTokenUsage({ tool_name: 'skill-lab', task_name: 'Discipline · Map', institution: '', model_id: MODEL, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const p = parseJsonLoose(r.text) || {};
  const discipline = String(p.discipline || '').trim() || String(jd.title || sp.title);

  // 2) 学科本身：复用职业探索的学科模式
  const { career } = await structureCareer(discipline, MODEL, 'discipline');
  const map: DisciplineMap = {
    ...career, discipline, subfield: String(p.subfield || '').slice(0, 30), position: String(p.position || ''),
    first_week: (Array.isArray(p.first_week) ? p.first_week : []).filter((x: any) => x?.activity).slice(0, 7).map((x: any) => ({ day: String(x.day || ''), activity: String(x.activity) })),
    built_at: new Date().toISOString(),
  };
  // 重新读一次再写，别把这段时间里别人改的 jd_snapshot 盖掉
  const { data: cur } = await db.from('skill_tasks').select('jd_snapshot').eq('id', spaceId).single();
  await db.from('skill_tasks').update({ jd_snapshot: { ...(cur?.jd_snapshot || jd), discipline_map: map } }).eq('id', spaceId);
  return { ...map, space_id: await findDisciplineSpace(discipline) };
}

/** 同名学科空间（职业探索的学科模式生成过的） */
async function findDisciplineSpace(name: string): Promise<string | null> {
  if (!name) return null;
  const { data } = await db.from('skill_tasks').select('id, jd_snapshot').eq('jd_snapshot->>kind', 'discipline').limit(200);
  const hit = (data || []).find((s: any) => s.jd_snapshot?.career?.profession === name || s.jd_snapshot?.title === name);
  return hit?.id || null;
}
