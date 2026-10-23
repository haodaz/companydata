/**
 * 演示用例补课（2026-10-23）：给两位学生把还没裸考过的章节都考一遍入学考（同一把学院尺子），每张章节卡才有「入学考 → 毕业考」两个数。
 *   npx tsx scripts/college-demo-entrance.mts
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { enrollmentDetail } = await import('../src/lib/college-admin');
const { runChapterExam } = await import('../src/lib/college-train');
const st = JSON.parse(fs.readFileSync('scripts/.college-demo.json', 'utf8'));
const log = (s: string) => console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${s}`);
for (const key of ['invest_enrollment_id', 'bio_enrollment_id']) {
  const d = await enrollmentDetail(st[key]);
  for (const c of d.chapters.filter((c: any) => c.before == null)) {
    try { const r = await runChapterExam(d.id, c.id, false); log(`${d.nova_name} 入学考 · ${c.title} → ${r.score} 分`); }
    catch (e: any) { log(`${d.nova_name} 入学考 · ${c.title} 失败：${e?.message}`); }
  }
  const f = await enrollmentDetail(d.id);
  log(`${d.nova_name} 入学考（各章）：${f.chapters.map((c: any) => `${c.slot || c.seq} ${c.before ?? '—'}→${c.after ?? '—'}`).join(' | ')} · 入学 ${f.entrance_score} 毕业 ${f.final_score} · ${f.status}`);
}
process.exit(0);
