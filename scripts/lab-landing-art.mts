/**
 * AI 百业首页的概念图：npx tsx scripts/lab-landing-art.mts
 * 这几张不是截图，是把「人 / 空间 / 三个方向 / 从 JD 长出空间」画成一眼能懂的图。
 * 直接落到 public/lab-landing/，跟着代码走，不依赖运行时存储。
 */
import fs from 'node:fs';
import path from 'node:path';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { genImage, toJpeg } = await import('../src/lib/lab-art');

const STYLE = '纯白到极浅灰的明亮背景，画面整体是高调的浅色，大量留白，只用淡紫与青色作点缀，细线条，干净通透，杂志级质感，绝对不要深色背景、不要黑色、不要夜景、不要霓虹发光，没有任何文字、字母、数字、水印或logo';

const SHOTS: [string, string][] = [
  ['concept-person', `一张杂志级的概念插画：画面正中是一个由无数极细的金色与紫色线条编织成的人形轮廓，像星图也像织物；仔细看，构成这个人形的不是线，而是成千上万个微小的工具、齿轮、针脚、火花、曲线图的符号，密密麻麻汇聚成人的形状；人形边缘有细微的光尘向外飘散。背景是柔和的米白与极浅灰，带一点点冷暖渐变，画面干净、克制、有呼吸感。${STYLE}`],
  ['concept-space', `一个人形光点站在中心，四周是层层展开的环形图谱：内环是一圈同行的小人剪影，中环是悬浮的企业建筑方块，外环是上下游的节点与连线，整体像一张活的产业星图在缓缓旋转。${STYLE}`],
  ['concept-three', `白色画面中央一个淡紫色的人形剪影，三道柔和的淡彩色带从他身上分别流向下方、上方和水平两侧：向下的色带落在一群年轻学徒的浅灰剪影上，向上的色带连向一位老师傅的剪影，水平的色带跨过一段浅灰色城市天际线连到远处另一个人。${STYLE}`],
  ['concept-create', `一张悬浮的纸质招聘启事，从纸面上向上生长出一座微缩的立体工作场景：工作台、设备、仪表盘、一个正在操作的小人，像纸上长出来的一座城。纸张边缘正在化成光粒子飞向场景。${STYLE}`],
];

const dir = path.join(process.cwd(), 'public', 'lab-landing');
fs.mkdirSync(dir, { recursive: true });
for (const [name, prompt] of SHOTS) {
  const out = path.join(dir, `${name}.jpg`);
  if (fs.existsSync(out)) { console.log('已有', name); continue; }
  try {
    const buf = await toJpeg(await genImage(prompt, '1440*810'), 86);
    fs.writeFileSync(out, buf);
    console.log('✅', name, (buf.length / 1024).toFixed(0) + 'KB');
  } catch (e: any) { console.log('❌', name, e.message); }
}
console.log('══ 概念图完成 ══');
