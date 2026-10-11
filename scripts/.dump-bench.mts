import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const [task, slot, out] = process.argv.slice(2);
const { data: chs } = await db.from('lab_chapters').select('id, slot, title, sim, expert_trace').eq('task_id', task);
const c = (chs || []).find(x => x.slot === slot || (!slot && !x.slot))!;
fs.writeFileSync(out, JSON.stringify({ id: c.id, slot: c.slot, title: c.title, sim: c.sim, expert_trace: c.expert_trace }, null, 1));
console.log('wrote', out, c.id);
