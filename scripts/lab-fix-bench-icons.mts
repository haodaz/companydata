/**
 * 已有工位的轨迹层没写「手里拿什么」（icon）的，按工位名 / 控件名补上，别默认成拉花的奶缸（2026-10-11）。
 *   npx tsx scripts/lab-fix-bench-icons.mts [--apply]
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const APPLY = process.argv.includes('--apply');
const infer = (b: any) => {
  const text = `${b.name} ${b.brief || ''} ${(b.controls || []).map((c: any) => c.label).join(' ')}`;
  return /奶缸|拉花|咖啡|奶泡/.test(text) ? 'pitcher' : /挤注|裱花袋|挤花/.test(text) ? 'hand' : /切配|刀工|砧板/.test(text) ? 'scalpel' : /刷|笔|浆|胶|漆|裱/.test(text) ? 'brush' : /焊/.test(text) ? 'torch' : /缝合|持针/.test(text) ? 'needle' : /切开|手术刀/.test(text) ? 'scalpel' : 'hand';
};
const fix = (sim: any, where: string) => {
  let n = 0;
  for (const st of sim?.steps || []) for (const l of st.bench?.scene?.layers || []) {
    if (l.kind !== 'pour' || l.icon || l.iconBy) continue;
    l.icon = infer(st.bench); n++;
    console.log(`  ${where} · ${st.bench.name} → ${l.icon}`);
  }
  return n;
};
const { data: chs } = await db.from('lab_chapters').select('id, task_id, seq, sim');
for (const c of chs || []) if (fix(c.sim, `章 ${c.id.slice(0, 8)}`) && APPLY) {
  await db.from('lab_chapters').update({ sim: c.sim }).eq('id', c.id);
  if (c.seq === 1) await db.from('skill_tasks').update({ sim: c.sim }).eq('id', c.task_id);
}
console.log(APPLY ? '已写库' : '只出报告（加 --apply 写库）');
