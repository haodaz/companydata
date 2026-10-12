// 把 .splat 传到 lab-art 桶，打印公开网址：npx tsx scripts/beta3d/upload.mts <文件> <存成的名字>
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { uploadLabAsset } = await import('../../src/lib/lab-art');
const [file, name] = process.argv.slice(2);
if (!file || !name) { console.error('用法：npx tsx scripts/beta3d/upload.mts <文件> <名字>'); process.exit(1); }
console.log(await uploadLabAsset(fs.readFileSync(file), name, 'application/octet-stream'));
