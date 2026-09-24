/**
 * 绿幕抠图：把通义万相生成的「纯绿色背景立绘」变成带透明通道的 PNG（NPC 立绘用）。
 *   node scripts/chroma-key.mjs <输入> <输出.png> [--width=900]
 * 规则：绿色分量明显高于红蓝的像素 → 透明；边缘按「绿的程度」做半透明并去掉绿色溢出。
 */
import sharp from 'sharp';

const [inp, out] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
if (!inp || !out) { console.error('用法：node scripts/chroma-key.mjs <输入> <输出.png> [--width=900]'); process.exit(1); }

const img = sharp(inp).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
// 背景色从四角采样（生成的「纯绿」往往是偏暗的绿，不能按纯 #00FF00 抠）
const sample = (x0, y0) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 12; x++) { const o = (y * width + x) * channels; r += data[o]; g += data[o + 1]; b += data[o + 2]; n++; } return [r / n, g / n, b / n]; };
const corners = [sample(4, 4), sample(width - 16, 4), sample(4, height - 16), sample(width - 16, height - 16)];
const bg = corners.reduce((a, c) => [a[0] + c[0] / 4, a[1] + c[1] / 4, a[2] + c[2] / 4], [0, 0, 0]);
const HARD = Number(flags.hard) || 48, SOFT = Number(flags.soft) || 90;
let removed = 0;
for (let i = 0; i < width * height; i++) {
  const o = i * channels;
  const r = data[o], g = data[o + 1], b = data[o + 2];
  const d = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
  const greenish = g > r + 10 && g > b + 10;
  if (d < HARD && greenish) { data[o + 3] = 0; removed++; continue; }
  if (d < SOFT && greenish) {
    const a = (d - HARD) / (SOFT - HARD);
    data[o + 3] = Math.round(data[o + 3] * a);
    data[o + 1] = Math.round((g + Math.max(r, b)) / 2); // 压掉绿色溢出
  }
}
const w = Number(flags.width) || width;
await sharp(data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).resize({ width: w }).toFile(out);
console.log(`✅ ${out}  透明像素 ${(removed / (width * height) * 100).toFixed(1)}%`);
