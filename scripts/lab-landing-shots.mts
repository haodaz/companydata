/**
 * 首页用的真实产品截图：npx tsx scripts/lab-landing-shots.mts
 * 原图在桌面，这里统一压到 1600 宽的 jpg 落进 public/lab-landing/shots/。
 * 手法镜那块是真人摄像头，原样保留——要的就是「看得出是人在操作」。
 */
import fs from 'node:fs';
import path from 'node:path';
import sharpLib from 'sharp';

const D = `${process.env.HOME}/Desktop`;
const OUT = path.join(process.cwd(), 'public', 'lab-landing', 'shots');
fs.mkdirSync(OUT, { recursive: true });

type Shot = { key: string; name: string; blur?: [number, number, number, number] };
// macOS 的截图文件名里 PM 前面是窄不换行空格（U+202F），写死匹配不上，按时间戳找
const SHOTS: Shot[] = [
  { key: '6.49.21', name: 'npc-rehab' },
  { key: '6.49.30', name: 'npc-fire' },
  { key: '6.49.42', name: 'npc-brand' },
  { key: '6.49.49', name: 'bench-latte' },
  { key: '6.49.04', name: 'bench-lap' },
];
const DESK = fs.readdirSync(D);

for (const s of SHOTS) {
  const hit = DESK.find(f => f.includes(s.key) && /\.(png|jpe?g)$/i.test(f));
  if (!hit) { console.log('缺素材', s.key); continue; }
  const file = path.join(D, hit);
  let img = sharpLib(file);
  const meta = await img.metadata();
  if (s.blur) {
    const [l, t, w, h] = s.blur;
    const left = Math.max(0, Math.min(l, (meta.width || 0) - 1));
    const top = Math.max(0, Math.min(t, (meta.height || 0) - 1));
    const width = Math.min(w, (meta.width || 0) - left);
    const height = Math.min(h, (meta.height || 0) - top);
    const patch = await sharpLib(file).extract({ left, top, width, height }).blur(26).toBuffer();
    img = sharpLib(await img.composite([{ input: patch, left, top }]).png().toBuffer());
  }
  const buf = await img.resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  fs.writeFileSync(path.join(OUT, `${s.name}.jpg`), buf);
  console.log('✅', s.name, `${meta.width}×${meta.height}`, '→', (buf.length / 1024).toFixed(0) + 'KB');
}
console.log('══ 截图完成 ══');
