import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const prefix = process.argv[2];
const { data: all } = await db.from('skill_tasks').select('id, title, profile');
const t = (all || []).find(x => x.id.startsWith(prefix))!;
console.log(t.id, (t as any).profile?.role, '|', t.title);
const { data: chs } = await db.from('lab_chapters').select('id, seq, slot, title, status, sim').eq('task_id', t.id).order('seq');
for (const c of chs || []) { const steps = (c.sim as any)?.steps || []; console.log('  ', c.slot, c.status, c.title, '| steps', steps.length, steps.filter((s: any) => s.type === 'bench').map((s: any) => 'bench:' + s.bench?.name).join(' ')); }
