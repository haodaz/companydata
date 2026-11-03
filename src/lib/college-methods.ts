/**
 * 百业学院 · 方法课（2026-11-03）：科研学员的第 4 层「知识包」先接实验方法库（迁移 058）。
 * 一门课用到哪些实验方法：空间建时记的 method_key 优先，其余按方法名 / 别名在 JD 和章节里出现来对；
 * 学员「修方法课」= 把这些方法记进笔记本（notebook.methods），考试时把方法卡的标准步骤、常见坑、安全要点
 * 一起装进去（当成「方法卡」，和老师傅技能卡分开标注）。方法卡是 AI 按通用实验常识写的、待导师审核，所以评卷仍只对照老师傅原版。
 */
import { supabaseAdmin as db } from '@/lib/supabase';

export type MethodCard = { key: string; name: string; field: string | null; summary: string | null; steps: { title: string; detail: string }[]; pitfalls: { symptom: string; cause: string; check: string }[]; safety: string | null; generic_instruments: string[]; human_review_status: string | null };
const COLS = 'key, name, aliases, field, summary, steps, pitfalls, safety, generic_instruments, human_review_status';

/** 这门课（空间）用到的实验方法 */
export async function methodsForSpace(spaceId: string, max = 4): Promise<MethodCard[]> {
  const { data: sp } = await db.from('skill_tasks').select('title, jd_snapshot, profile').eq('id', spaceId).single();
  if (!sp) return [];
  const jd: any = sp.jd_snapshot || {};
  const { data: chs } = await db.from('lab_chapters').select('title, brief').eq('task_id', spaceId);
  const text = [sp.title, jd.title, jd.responsibilities, jd.qualifications, sp.profile?.role, ...(chs || []).flatMap(c => [c.title, c.brief])].filter(Boolean).join('\n');
  const { data: all } = await db.from('research_methods').select(COLS).eq('if_delete', false);
  const pinned = [jd.method_key, ...(jd.method_keys || [])].filter(Boolean);
  // 名字去掉括号里的英文缩写再对（「细胞培养」「高效液相色谱（HPLC）」→「高效液相色谱」「HPLC」都认）
  const names = (m: any) => [m.name, ...(m.aliases || []), ...String(m.name).split(/[（()）/]/)].map((x: string) => String(x).trim()).filter(x => x.length >= 3);
  const scored = (all || []).map((m: any) => ({ m, hits: pinned.includes(m.key) ? 99 : names(m).reduce((n: number, x: string) => n + (text.split(x).length - 1), 0) }))
    .filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits);
  return scored.slice(0, max).map(x => x.m as MethodCard);
}

export async function loadMethods(keys: string[]): Promise<MethodCard[]> {
  if (!keys.length) return [];
  const { data } = await db.from('research_methods').select(COLS).in('key', keys);
  return (keys.map(k => (data || []).find((m: any) => m.key === k)).filter(Boolean)) as MethodCard[];
}

/** 方法卡 → 装进技能卡的规则 / 做法 / 检查项（标明出处，和老师傅的分开） */
export function methodRules(ms: MethodCard[]) {
  return {
    rules: ms.flatMap(m => (m.pitfalls || []).slice(0, 7).map(p => `（方法卡·${m.name}·常见坑）看到「${p.symptom}」——常见原因：${p.cause}；怎么判断 / 处理：${p.check}`)),
    steps: ms.flatMap(m => (m.steps || []).slice(0, 10).map(s => ({ title: `［${m.name}］${s.title}`, detail: s.detail }))),
    checklist: ms.flatMap(m => m.safety ? [`（方法卡·${m.name}·安全）${String(m.safety).slice(0, 240)}`] : []),
  };
}

/** 按章节装（2026-11-03 对照实验：整门课的方法卡一股脑装上，做方案这类章节反而掉分——通用知识冲淡了这一章现场的事）：
 *  只留这一章正文里提到的方法；每个方法只带和这一章最相关的 4 个坑 + 安全要点，不带通用步骤。这一章没提到任何方法就不装。 */
export function chapterMethods(ms: MethodCard[], chapter: any): MethodCard[] {
  if (!chapter) return [];
  const text = [chapter.title, chapter.brief, JSON.stringify(chapter.sim || '')].filter(Boolean).join('\n');
  const grams = (x: string) => { const t = String(x).replace(/\s+/g, ''); const g = new Set<string>(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
  const tg = grams(text);
  const overlap = (x: string) => { let n = 0; for (const g of grams(x)) if (tg.has(g)) n++; return n; };
  const names = (m: any) => [m.name, ...(m.aliases || []), ...String(m.name).split(/[（()）/]/)].map((x: string) => String(x).trim()).filter((x: string) => x.length >= 3);
  return ms.filter(m => names(m).some(n => text.includes(n))).map(m => ({ ...m, steps: [],
    pitfalls: [...(m.pitfalls || [])].sort((a, b) => overlap(b.symptom + b.cause) - overlap(a.symptom + a.cause)).slice(0, 4) }));
}
