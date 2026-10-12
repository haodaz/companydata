/**
 * 全库体检（2026-10-12）：所有空间的章节跑一遍工作室校验（含 docs/lab-playbook.md 的带编号规则），按规则汇总。
 *   npx tsx scripts/lab-check-all.mts            汇总
 *   npx tsx scripts/lab-check-all.mts --rule D3   只看某条规则命中的空间
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { checkAll } = await import('../src/lib/lab-studio');
const only = process.argv.includes('--rule') ? process.argv[process.argv.indexOf('--rule') + 1] : null;
const { data: spaces } = await db.from('skill_tasks').select('id, title').order('created_at');
const { data: chs } = await db.from('lab_chapters').select('id, task_id, seq, slot, title, kind, brief, sim, expert_trace, status, locked');
const by = new Map<string, any[]>();
for (const c of chs || []) by.set(c.task_id, [...(by.get(c.task_id) || []), c]);
const tally = new Map<string, Set<string>>();
for (const s of spaces || []) {
  const list = (by.get(s.id) || []).sort((a, b) => a.seq - b.seq);
  if (!list.length) continue;
  for (const i of checkAll(list as any)) {
    const k = i.rule || (i.level === 'error' ? '（结构 error）' : '（结构 warn）');
    if (!tally.has(k)) tally.set(k, new Set());
    tally.get(k)!.add(s.id);
    if (only && i.rule === only) console.log(s.id.slice(0, 8), s.title, '·', i.msg);
  }
}
if (!only) for (const [k, v] of [...tally].sort()) console.log(k.padEnd(12), v.size, '个空间');
console.log(`共 ${(spaces || []).length} 个空间`);
