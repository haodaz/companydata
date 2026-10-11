import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const [task, slot] = process.argv.slice(2);
const { data: chs } = await db.from('lab_chapters').select('id, slot, status').eq('task_id', task);
const c = (chs || []).find(x => x.slot === slot)!;
const { error } = await db.from('lab_chapters').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', c.id);
console.log(error ? error.message : `已发布 ${slot} ${c.id}`);
