/**
 * 01 那张「抽象碎片 → 具体的人」做成去背的透明 png：npx tsx scripts/lab-landing-cut.mts
 * 绿幕生成 + 复用 NPC 立绘那套抠图，人直接站在页面的深色里，不再是一张嵌在框里的插画。
 */
import fs from 'node:fs';
import path from 'node:path';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { genImage, chromaKey } = await import('../src/lib/lab-art');

const PROMPT = `纯正绿色平涂背景（RGB 0,255,0），背景没有任何阴影、渐变和地面。画面从左到右讲一件事：
左侧是散乱漂浮的抽象碎片——半透明的表格、流程框、折线图、标签、细小符号，用淡紫和白色勾勒，轻飘飘没有重量；
它们向右逐渐汇聚、收紧、凝实，到画面右侧凝成一个人：穿深灰工装、挽着袖子、双手握着一把扳手、站得很稳，
人物用清晰的线条和淡紫灰色块画出来，有重量感。整体是干净的扁平插画，
画面里除了绿色背景之外不要出现任何绿色，不要地板、不要影子、不要边框，没有任何文字、字母、数字、水印或logo。`;

const out = path.join(process.cwd(), 'public', 'lab-landing', 'concept-person.png');
const buf = await chromaKey(await genImage(PROMPT, '1440*810'), 1280);
fs.writeFileSync(out, buf);
console.log('✅ concept-person.png', (buf.length / 1024).toFixed(0) + 'KB');
