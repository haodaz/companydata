/**
 * 百业学院 · 专业与成绩单（2026-10-28）。
 * 专业 = 按职业方向把几门课串起来（先定在代码里，不建表）；同一专业里有 2 门课毕业考及格 = 修完这个专业。
 * 成绩单按学员（= 一个大模型）出：修过的课、学分（= 章节数）、入学 / 毕业成绩、等级、授课老师傅、各专业进度、平均绩点。只读、公开。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { MODEL_OPTIONS } from '@/lib/model-options';

export const MAJORS: { key: string; name: string; en: string; re: RegExp }[] = [
  { key: 'mfg', name: '智能制造与工程', en: 'Manufacturing & Engineering', re: /机械|电气|数控|成型|总装|炼钢|熔炼|铸|变电|摊铺|施工|混凝土|结构工程|芯片|半导体|建筑设计|装修|焊/ },
  { key: 'biz', name: '数据与商业分析', en: 'Data & Business Analysis', re: /数据分析|分析师|审计|产品经理|客服|直播|律师|测试工程师|投资/ },
  { key: 'health', name: '医疗与健康', en: 'Health & Care', re: /护士|医师|陪诊|康复|推拿|针灸|心理咨询|艺术治疗|月嫂/ },
  { key: 'safety', name: '公共安全与应急', en: 'Public Safety & Emergency', re: /应急|消防|保安|调度员/ },
  { key: 'service', name: '生活服务与文旅', en: 'Hospitality & Services', re: /厨|砧板|烘焙|调饮|咖啡|调酒|民宿|导游|乘务|婚礼|剧本杀|收纳|宠物|保洁|园艺|幼儿园|潜水|古籍/ },
  { key: 'research', name: '科学研究', en: 'Scientific Research', re: /博士后|研究员|科研员/ },
];
export const majorOf = (role: string, research?: boolean) => (research ? MAJORS.find(m => m.key === 'research')! : MAJORS.find(m => m.key !== 'research' && m.re.test(role))) || null;
const letter = (v: number | null) => (v == null ? '—' : v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : v >= 60 ? 'D' : 'F');
const gp = (v: number) => (v >= 90 ? 4 : v >= 80 ? 3 : v >= 70 ? 2 : v >= 60 ? 1 : 0);
const one = (v: any) => (Array.isArray(v) ? v[0] : v);

export type TranscriptCourse = { enrollment_id: string; role: string; company: string; major: string | null; credits: number; before: number | null; after: number | null; grade: string; status: string; teacher: string; graduated_at: string | null };
export type Transcript = { student: { id: string; name: string; model: string; provider: string }; courses: TranscriptCourse[]; credits: number; gpa: number | null; majors: { key: string; name: string; en: string; passed: number; taken: number; done: boolean }[] };

export async function buildTranscript(studentId: string): Promise<Transcript | null> {
  const { data: s } = await db.from('college_students').select('id, name, kind, model_id').eq('id', studentId).maybeSingle();
  if (!s || s.kind !== 'platform') return null;   // 只公开平台自己的模型；客户的不出成绩单
  const { data: ens } = await db.from('college_enrollments').select('id, space_id, status, entrance_score, final_score, graduated_at').eq('student_id', studentId).order('created_at');
  const ids = [...new Set((ens || []).map(e => e.space_id))];
  const [{ data: sps }, { data: chs }] = await Promise.all([
    ids.length ? db.from('skill_tasks').select('id, title, profile, jd_snapshot, skill:skills(name, source, expert_name, expert_location)').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from('lab_chapters').select('task_id').eq('status', 'published').in('task_id', ids) : Promise.resolve({ data: [] as any[] }),
  ]);
  const o = MODEL_OPTIONS.find(m => m.id === s.model_id);
  const courses: TranscriptCourse[] = (ens || []).map((e: any) => {
    const sp: any = (sps || []).find((x: any) => x.id === e.space_id) || {}; const p = sp.profile || {}, jd = sp.jd_snapshot || {}, sk: any = one(sp.skill);
    const role = p.role || jd.title || sp.title || '课程'; const research = jd.kind === 'research_post' || jd.kind === 'discipline';
    return {
      enrollment_id: e.id, role, company: jd.company || '', major: majorOf(role, research)?.name || null,
      credits: (chs || []).filter((c: any) => c.task_id === e.space_id).length, before: e.entrance_score, after: e.final_score, grade: letter(e.final_score),
      status: e.status, teacher: sk ? (sk.source !== 'jd-draft' ? `${sk.expert_name}${sk.expert_location ? `（${sk.expert_location}）` : ''}` : 'AI 草案（待老师傅校正）') : '—', graduated_at: e.graduated_at,
    };
  });
  const passed = courses.filter(c => (c.after ?? 0) >= 60);
  const majors = MAJORS.map(m => ({ key: m.key, name: m.name, en: m.en, taken: courses.filter(c => c.major === m.name).length, passed: passed.filter(c => c.major === m.name).length, done: passed.filter(c => c.major === m.name).length >= 2 })).filter(m => m.taken);
  const graded = courses.filter(c => c.after != null);
  const credW = graded.reduce((n, c) => n + Math.max(1, c.credits), 0);
  return {
    student: { id: s.id, name: s.name, model: o?.label || s.model_id, provider: (o as any)?.provider || '' },
    courses, credits: passed.reduce((n, c) => n + c.credits, 0),
    gpa: graded.length ? Math.round((graded.reduce((n, c) => n + gp(c.after as number) * Math.max(1, c.credits), 0) / credW) * 100) / 100 : null,
    majors,
  };
}
