/** 方法课对照第二轮（2026-11-03）：方法卡按章节装（chapterMethods），同两份学籍、同 6 章各考两次，和第一轮的裸考 / 技能卡 / 整门装对比。 */
import fs from 'node:fs';
import { supabaseAdmin as db } from '../src/lib/supabase';
import { runChapterExam } from '../src/lib/college-train';
const R1 = JSON.parse(fs.readFileSync('docs/百业学院-方法课对照-2026-11-03.json', 'utf8'));
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const out: any[] = [];
for (const r of R1) {
  const { data: chs } = await db.from('lab_chapters').select('id, slot, title').eq('task_id', r.course.includes('电池') ? 'c8c986e6-6452-4834-bac4-1ce2a360c9cc' : 'e6f03835-67b4-43e0-9d2d-6e3da7e73f99');
  const ch = (chs || []).find(c => r.chapter.startsWith(c.slot))!;
  const runs: (number | null)[] = [];
  for (let i = 0; i < 2; i++) { try { const x = await runChapterExam(r.enrollment, ch.id, true); runs.push(x.score); console.log(`${r.course} ${r.chapter} 按章方法卡${i + 1}：${x.score}（装了：${(x as any).methods?.join('、') || '无'}）`); } catch (e: any) { runs.push(null); console.log('失败', String(e?.message).slice(0, 80)); } }
  out.push({ ...r, perChapter: runs });
  fs.writeFileSync('docs/百业学院-方法课对照-2026-11-03-第二轮.json', JSON.stringify(out, null, 1));
}
console.log('\n章节 | 裸考 | 技能卡 | 整门装 | 按章装');
for (const r of out) console.log(`${r.course} ${r.chapter} | ${r.bare} | ${avg(r.skill)} | ${avg(r.methods)} | ${avg(r.perChapter)}`);
