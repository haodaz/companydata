/**
 * 百业学院 · 方法课值不值（2026-11-03）：同一学员、同一章，三种装备各考一遍，量方法卡（实验方法库）带来的差距。
 *   裸考（入学考）× 1 / 装技能卡 × 2 / 技能卡 + 方法卡 × 2（评卷有波动，后两种各考两次取平均）
 * 学员 qwen-plus（平台自有学员），评卷固定学院口径（Claude Sonnet）。新开学籍，不碰演示用例。结果 → docs/百业学院-方法课对照-<日期>.json
 *   npx tsx --env-file=.env.local scripts/college-method-ab.mts
 */
import fs from 'node:fs';
import { supabaseAdmin as db } from '../src/lib/supabase';
import { createEnrollment, ensurePlatformStudents } from '../src/lib/college-admin';
import { runChapterExam, studyMethods } from '../src/lib/college-train';
import { methodsForSpace } from '../src/lib/college-methods';

const STUDENT_MODEL = 'qwen-plus';
const COURSES = [
  { space: 'c8c986e6-6452-4834-bac4-1ce2a360c9cc', label: '电池材料博士后', slots: ['08:00', '10:20', '17:30'], methods: /电化学|XPS|实验设计/ },
  { space: 'e6f03835-67b4-43e0-9d2d-6e3da7e73f99', label: '细胞培养实验员', slots: ['09:15', '13:30', '15:00'], methods: /^细胞培养$/ },
];
await ensurePlatformStudents();
const { data: st } = await db.from('college_students').select('id').eq('model_id', STUDENT_MODEL).eq('kind', 'platform').single();
const out: any[] = [];
for (const c of COURSES) {
  const en: any = await createEnrollment(st!.id, c.space, 'method-ab');
  const enId = en.id || en.enrollment?.id;
  const ms = (await methodsForSpace(c.space, 8)).filter(m => c.methods.test(m.name));
  const studied = await studyMethods(enId, ms.map(m => m.key));
  console.log(`\n== ${c.label}（学籍 ${enId}）方法卡：${studied.methods.map(m => `${m.name} ${m.pitfalls} 坑`).join('、')}`);
  const { data: chs } = await db.from('lab_chapters').select('id, slot, title').eq('task_id', c.space).in('slot', c.slots);
  for (const ch of (chs || []).sort((a, b) => a.slot.localeCompare(b.slot))) {
    const run = async (label: string, f: () => Promise<any>) => { try { const r = await f(); console.log(`  ${ch.slot} ${label}：${r.score}`); return r.score as number; } catch (e: any) { console.log(`  ${ch.slot} ${label}：失败 ${String(e?.message).slice(0, 80)}`); return null; } };
    const bare = await run('裸考', () => runChapterExam(enId, ch.id, false));
    const skill = [await run('技能卡①', () => runChapterExam(enId, ch.id, true, { noMethods: true })), await run('技能卡②', () => runChapterExam(enId, ch.id, true, { noMethods: true }))];
    const meth = [await run('技能卡+方法卡①', () => runChapterExam(enId, ch.id, true)), await run('技能卡+方法卡②', () => runChapterExam(enId, ch.id, true))];
    out.push({ course: c.label, enrollment: enId, chapter: `${ch.slot} ${ch.title}`, bare, skill, methods: meth });
    fs.writeFileSync(`docs/百业学院-方法课对照-2026-11-03.json`, JSON.stringify(out, null, 1));
  }
}
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
console.log('\n章节 | 裸考 | 技能卡 | 技能卡+方法卡');
for (const r of out) console.log(`${r.course} ${r.chapter} | ${r.bare} | ${avg(r.skill)} | ${avg(r.methods)}`);
