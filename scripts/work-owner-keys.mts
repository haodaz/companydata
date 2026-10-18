/** 真活台 · 给没有管理密钥的题补 owner_key（迁移 036 之后跑一次）：npx tsx scripts/work-owner-keys.mts */
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { data, error } = await db.from('work_tasks').select('id, share_token, task, owner_key').is('owner_key', null);
if (error) { console.error('先跑迁移 036：', error.message); process.exit(1); }
for (const t of data || []) {
  const owner_key = randomBytes(12).toString('base64url');
  await db.from('work_tasks').update({ owner_key, owner: { name: '平方智能', contact: 'demo' }, status: 'published' }).eq('id', t.id);
  console.log(`${t.task?.title}\n  参与 /work/${t.share_token}\n  空间 /work/${t.share_token}/owner?k=${owner_key}`);
}
process.exit(0);
