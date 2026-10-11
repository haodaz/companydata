/**
 * 示范证书夹：用老师傅的操作把一个空间的每一章都「考」一遍，挂在示范访客 v:showcase（好大壮）名下——
 * 投资人打开「我的」就能看到完整的证书夹，不用自己做半天（2026-10-11 加了咖啡师、古籍修复师）。
 *   npx tsx scripts/lab-showcase-certs.mts <空间 id 前缀>... [--base http://localhost:3003]
 * 某章已有 ≥ 60 分的示范作答就跳过；没到 60 的重交一次。
 */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const argv = process.argv.slice(2);
const BASE = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'http://localhost:3003';
const VISITOR = 'v:showcase', WHO = { name: '好大壮', note: '协和医学院 · 临床医学', location: '北京' };

const { data: all } = await db.from('skill_tasks').select('id, profile, skill:skills(expert_trace)');
for (const pre of argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--base')) {
  const t: any = all!.find(x => x.id.startsWith(pre));
  const { data: chs } = await db.from('lab_chapters').select('id, seq, slot, title, sim, expert_trace').eq('task_id', t.id).eq('status', 'published').order('seq');
  const { data: subs } = await db.from('skill_submissions').select('chapter_id, score').eq('task_id', t.id).eq('visitor_id', VISITOR);
  console.log(`## ${t.profile?.role}：${chs?.length} 章`);
  for (const c of chs || []) {
    if ((subs || []).some(s => s.chapter_id === c.id && (s.score ?? 0) >= 60)) { console.log(`  ${c.slot} 已过，跳过`); continue; }
    const trace = (c.expert_trace && Object.keys(c.expert_trace).length ? c.expert_trace : null) || t.skill?.expert_trace || {};
    for (let k = 0; k < 2; k++) {
      const r = await fetch(`${BASE}/api/lab/spaces/${t.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'human', ...WHO, trace, visitor: VISITOR, chapterId: c.id, tz: 8 }) }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
      const score = r.submission?.score;
      console.log(`  ${c.slot} ${c.title}：${r.ok ? `${score} 分` : `失败 ${r.error}`}`);
      if (r.ok && score >= 60) break;
    }
  }
}
