import fs from 'node:fs';
for (const l of fs.readFileSync('/Users/aisandbox/Documents/companydata/.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('/Users/aisandbox/Documents/companydata/src/lib/supabase');
const { uploadLabAsset } = await import('/Users/aisandbox/Documents/companydata/src/lib/lab-art');
const [file, name] = process.argv.slice(2);
if (file) console.log(await uploadLabAsset(fs.readFileSync(file), name, 'application/octet-stream'));
const { data } = await db.from('skill_tasks').select('id, profile');
console.log((data || []).find(t => t.id.startsWith('155db8f9'))?.id);
