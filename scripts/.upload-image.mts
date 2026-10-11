import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { saveLabAsset, toJpeg } = await import('../src/lib/lab-art');
const [file, name] = process.argv.slice(2);
console.log(await saveLabAsset(await toJpeg(fs.readFileSync(file), 86), name));
