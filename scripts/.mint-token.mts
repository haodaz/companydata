// 录视频用：给无头 Chrome 一个登录态（studio / 素材库在 LAB_PUBLIC 下也要登录）。
// 给第一个管理员签一个 auth_token，写进文件，不打印：npx tsx scripts/.mint-token.mts <输出文件>
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const out = process.argv[2];
if (!out) { console.error('用法：npx tsx scripts/.mint-token.mts <输出文件>'); process.exit(1); }
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { signToken } = await import('../src/lib/jwt');
const { data } = await db.from('system_users').select('id, email, role').eq('role', 'admin').limit(1).maybeSingle();
if (!data) { console.error('没有管理员账号'); process.exit(1); }
fs.writeFileSync(out, await signToken({ id: data.id, email: data.email, role: data.role }), { mode: 0o600 });
console.log('已写入', out, '· 账号', data.email);
