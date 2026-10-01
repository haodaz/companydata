/**
 * AI 百业首页的概念图：npx tsx scripts/lab-landing-art.mts
 * 这几张不是截图，是把「人 / 空间 / 三个方向 / 从 JD 长出空间」画成一眼能懂的图。
 * 直接落到 public/lab-landing/，跟着代码走，不依赖运行时存储。
 */
import fs from 'node:fs';
import path from 'node:path';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const { genImage, toJpeg } = await import('../src/lib/lab-art');

const STYLE = '深色背景：近乎墨黑的深蓝底，画面低调沉静，大量留白，主体用会发光的淡紫与青色细线条勾勒，少量暖金点缀，光感克制不刺眼，杂志级质感，不要纯白背景、不要高亮底色，没有任何文字、字母、数字、水印或logo';

const SHOTS: [string, string][] = [
  ['concept-person', `一张从左到右讲一件事的概念插画：左侧是散乱漂浮的抽象碎片——半透明的表格、流程框、折线图、标签、细小符号，微微发着冷光、轻飘飘没有重量；它们向右逐渐汇聚、收紧、凝实，到画面右侧凝成一个人：穿工装、挽着袖子、手里握着工具、站得很稳。这个人用发光的淡紫与青色细线描绘，身形实、有重量感、落在地面上，面向观众。左边虚、右边实，对比明显。构图留白克制，像一张好的杂志跨页。${STYLE}`],
  ['concept-space', `一个人形光点站在中心，四周是层层展开的环形图谱：内环是一圈同行的小人剪影，中环是悬浮的企业建筑方块，外环是上下游的节点与连线，整体像一张活的产业星图在缓缓旋转。${STYLE}`],
  ['concept-three', `画面中央一个淡紫色发光的人形，三道柔和的淡彩色带从他身上分别流向下方、上方和水平两侧：向下的色带落在一群年轻学徒的冷色剪影上，向上的色带连向一位老师傅的剪影，水平的色带跨过一段冷色城市天际线连到远处另一个人。${STYLE}`],
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
