import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { data: all } = await db.from('skill_tasks').select('id, title, profile, sim');
const want = ['月嫂','拉花','数据','分析','开腹','外科','咖啡'];
for (const t of all || []) {
  const name = (t as any).profile?.role || t.title;
  if (!want.some(k => (name + t.title).includes(k))) continue;
  const { data: chs } = await db.from('lab_chapters').select('id, seq, slot, title, status, sim').eq('task_id', t.id).order('seq');
  console.log('==', t.id, name, '|', t.title, '| chapters', chs?.length, 'published', chs?.filter(c => c.status === 'published').length);
  for (const c of chs || []) {
    const steps = (c.sim as any)?.steps || [];
    const bench = steps.filter((s: any) => s.type === 'bench');
    console.log('   ', c.slot, c.status, c.title, '| steps', steps.length, bench.length ? '| bench: ' + bench.map((s: any) => s.bench?.name + ' [' + (s.bench?.scene?.layers || []).map((l: any) => l.kind).join(',') + '] ctl ' + (s.bench?.controls || []).map((x: any) => x.id + ':' + x.kind).join(',')).join(' ; ') : '');
  }
}
