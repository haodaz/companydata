/**
 * 工位规则回挂出处（闭环第 1 步，迁移 022 / 023）：每条工位规则 / 目标 → 标准条款 / 老师傅经验 / AI 推断，写 standard_links。
 *   npx tsx scripts/lab-link-standards.mts                  所有有工位、且库里有对应标准的空间
 *   npx tsx scripts/lab-link-standards.mts 71a6cbf5 640f…  只跑这几个（编号前缀）
 *   --dry                                                   只看结果不写库
 * 跑完打印每个空间的出处分布；校验器 [S1] / [S2] 按这里的结果查。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { linkSpace } = await import('../src/lib/lab-standards');
const dry = process.argv.includes('--dry');
const prefixes = process.argv.slice(2).filter(a => !a.startsWith('--'));

const { data: spaces } = await db.from('skill_tasks').select('id, title, profile');
let list = (spaces || []).filter(s => !prefixes.length || prefixes.some(p => s.id.startsWith(p)));
if (!prefixes.length) {
  // 只跑库里有为它检索过标准的空间（其余等标准打底跑到再说）
  const { data: sr } = await db.from('standard_searches').select('space_id').eq('status', 'success').not('space_id', 'is', null);
  const have = new Set((sr || []).map(r => r.space_id));
  list = list.filter(s => have.has(s.id));
}
const total: Record<string, number> = {};
for (const s of list) {
  try {
    const r = await linkSpace(s.id, { dryRun: dry });
    for (const [k, v] of Object.entries(r.byBasis)) total[k] = (total[k] || 0) + v;
    const pct = (k: string) => r.links ? Math.round(((r.byBasis as any)[k] || 0) / r.links * 100) : 0;
    console.log(`${s.id.slice(0, 8)} ${(s.profile?.role || s.title).padEnd(12)} 规则+目标 ${r.targets} · 标准 ${pct('standard')}% · 老师傅 ${pct('expert')}% · AI 推断 ${pct('ai')}% · 用了 ${r.standards} 条标准`);
    if (dry) for (const x of (r.rows || []).slice(0, 6)) console.log('   ', x.basis, '·', x.target, '←', x.evidence || x.note);
  } catch (e: any) { console.log(`✗ ${s.id.slice(0, 8)} ${e.message}`); }
}
const n = Object.values(total).reduce((a, b) => a + b, 0);
console.log(`\n共 ${list.length} 个空间 · ${n} 条规则 / 目标：` + Object.entries(total).map(([k, v]) => `${k} ${v}（${Math.round(v / (n || 1) * 100)}%）`).join(' · '));
process.exit(0);
