import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const kws = process.argv.slice(2);
const { data: all } = await db.from('skill_tasks').select('id, title, profile');
for (const t of all || []) { const name = ((t as any).profile?.role || '') + ' | ' + t.title; if (kws.some(k => name.includes(k))) { const { count } = await db.from('lab_chapters').select('id', { count: 'exact', head: true }).eq('task_id', t.id); console.log(t.id, name, '| 章节', count); } }
