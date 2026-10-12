/**
 * AI 评审：给空间的一整天按 docs/lab-playbook.md 里标「评」的规则打分（src/lib/agents/lab-review.ts）。
 *   npx tsx scripts/lab-review.mts <空间 id 前缀>... [--model gemini-3.8-flash]
 * 结果追加到 docs/lab-reviews.jsonl（评审记录也是训练数据：分数 + 理由 + 之后人怎么改的）。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { reviewDay } = await import('../src/lib/agents/lab-review');
const { withCost } = await import('../src/lib/token-logger');
const args = process.argv.slice(2);
const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : undefined;
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--model');
const { data: spaces } = await db.from('skill_tasks').select('id, title, jd_snapshot');
for (const pre of ids) {
  const s = (spaces || []).find(x => x.id.startsWith(pre));
  if (!s) { console.log('找不到', pre); continue; }
  const { data: chs } = await db.from('lab_chapters').select('seq, slot, title, kind, brief, sim').eq('task_id', s.id).order('seq');
  const prof = s.jd_snapshot?.title || s.jd_snapshot?.profession || '';
  const r = await withCost({ space_id: s.id, stage: 'review', actor: 'lab-review' }, () => reviewDay({ title: s.title, profession: prof }, chs || [], model));
  console.log(`\n== ${s.id.slice(0, 8)} ${s.title}${prof ? `（${prof}）` : ''}`);
  for (const i of r.items) console.log(`  ${i.rule} ${i.label.padEnd(10)} ${'★'.repeat(i.score)}${'☆'.repeat(5 - i.score)}  ${i.reason}${i.fix ? `\n${' '.repeat(22)}→ ${i.fix}` : ''}`);
  console.log(`  总评：${r.summary}`);
  fs.appendFileSync('docs/lab-reviews.jsonl', JSON.stringify({ at: new Date().toISOString(), space: s.id, title: s.title, model: model || 'default', ...r }) + '\n');
}
