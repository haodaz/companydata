/** 给脚本 / 预览用的登录令牌（30 天）：npx tsx scripts/mint-preview-token.mts [email] → 写入 .preview-token */
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { supabaseAdmin } = await import('../src/lib/supabase');
const { signToken } = await import('../src/lib/jwt');
const email = process.argv[2] || 'haoz214@gmail.com';
const { data: user, error } = await supabaseAdmin.from('system_users').select('id, email, role').eq('email', email).single();
if (error || !user) { console.error('用户不存在', error?.message); process.exit(1); }
const token = await signToken({ id: user.id, email: user.email, role: user.role } as any);
fs.writeFileSync('.preview-token', token);
console.log(`✅ .preview-token 已更新（${user.email} · ${user.role}）`);
