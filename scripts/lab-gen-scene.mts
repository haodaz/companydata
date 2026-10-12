// 给台面出一张写实底图（通义万相）并传到 lab-art，打印 URL：npx tsx scripts/lab-gen-scene.mts <名字> "<提示词>"
// 台面上的 SVG 只做半透明叠层 / 热区，质感靠这张图（用户 2026-10-11：别全是 SVG，要像电焊、灭火那种有真实质感）。
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { makeSceneAsset } = await import('../src/lib/lab-art');
const [name, prompt] = process.argv.slice(2);
if (!name || !prompt) { console.error('用法：npx tsx scripts/lab-gen-scene.mts <名字> "<提示词>"'); process.exit(1); }
console.log(await makeSceneAsset(prompt, name));
