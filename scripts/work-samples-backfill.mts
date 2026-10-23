/**
 * 样本回填（2026-10-24，迁移 048 之后）：kind（case / takehome / practical）、round（r1 老王两份 / r2 批量收集）、tags（题型）、occupation（实操按工种名对职业库，案例按题型对不上就留空）。可重复跑。
 *   npx tsx scripts/work-samples-backfill.mts
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { data: rows } = await db.from('work_samples').select('id, title, source_name, skeleton, created_at, occupation_id');
const { data: occs } = await db.from('occupations').select('id, name, name_lang_cn, career_category').eq('if_delete', false).limit(5000);
const norm = (s: string) => String(s || '').replace(/[（(].*?[)）]/g, '').replace(/[\s·・\-—]/g, '').toLowerCase();
const findOcc = (name: string) => { const n = norm(name); if (!n) return null; let best: any = null; for (const o of occs || []) { const on = norm(o.name), cn = norm(o.name_lang_cn); if (!on) continue; if (n === on || n === cn) return o; if ((on.length >= 2 && n.includes(on)) || (cn.length >= 2 && n.includes(cn)) || on.includes(n)) { if (!best || on.length > norm(best.name).length) best = o; } } return best; };
let n = 0; const stat: Record<string, number> = {};
for (const r of rows || []) {
  const k = r.skeleton || {}; const fmt = String(k.format || '').toLowerCase();
  const kind = /practical|实操/.test(fmt) || /广东人社/.test(r.source_name || '') ? 'practical' : /take/.test(fmt) || /take-home/i.test(r.source_name || '') ? 'takehome' : 'case';
  const round = /McBurger|Space_Explorer|Space Explorer/.test(r.title) || /\.(pdf|docx)$/.test(r.source_name || '') ? 'r1' : 'r2';
  const tags = [k.problem_type, k.industry].filter(Boolean).flatMap((x: string) => x.split(/[\/／、,，·]/)).map((x: string) => x.trim()).filter((x: string) => x && x.length <= 20).slice(0, 6);
  let occ: any = null;
  if (kind === 'practical') occ = findOcc(r.title.split(' · ')[0]);
  else if (kind === 'takehome') occ = findOcc(k.problem_type || '') || findOcc('数据工程师');
  else occ = findOcc(/投资|估值|并购|收购/.test(k.problem_type || '') ? '投资分析师' : /咨询|战略|增长|市场进入|定价|盈利|运营|成本/.test(k.problem_type || '') ? '战略分析师' : '');
  const up: any = { kind, round, tags }; if (occ) { up.occupation_id = occ.id; up.occupation_name = occ.name; }
  const { error } = await db.from('work_samples').update(up).eq('id', r.id); if (error) { console.log('✗', r.title, error.message); continue; }
  n++; stat[`${kind}/${round}/${occ ? '挂上职业' : '没挂'}`] = (stat[`${kind}/${round}/${occ ? '挂上职业' : '没挂'}`] || 0) + 1;
}
console.log('回填', n, JSON.stringify(stat, null, 0));
const miss = (rows || []).filter(r => (/广东人社/.test(r.source_name || '')) && !findOcc(r.title.split(' · ')[0])).map(r => r.title.split(' · ')[0]);
console.log('实操没对上职业库的工种：', [...new Set(miss)].join('、') || '无');
process.exit(0);
