/** 帧序列 → mp4（ffmpeg 二进制放 scripts/video/ffmpeg，已 gitignore，或设 FFMPEG_BIN）：正常段原速（最多 15fps），构建等待段快进。node encode.mjs <录制目录> <输出.mp4> [--speed=24] */
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const [DIR, OUTFILE] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const SPEED = Number((process.argv.find(a => a.startsWith('--speed=')) || '--speed=24').split('=')[1]);
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'meta.json'), 'utf8'));
const at = n => meta.marks.find(m => m.name === n)?.t ?? 0;
const bs = at('build_start') + 2500, be = at('build_end') - 800;   // 点下按钮后 2.5s 起快进，跳转前 0.8s 恢复
const lines = ['ffconcat version 1.0'];
let total = 0;
for (let i = 0; i < meta.frames.length; i++) {
  const f = meta.frames[i], next = meta.frames[i + 1];
  let d = ((next?.t ?? f.t + 66) - f.t) / 1000;
  if (f.t >= bs && f.t < be) d /= SPEED;
  d = Math.max(d, 1 / 30); total += d;
  lines.push(`file 'frames/f${String(f.i).padStart(6, '0')}.jpg'`, `duration ${d.toFixed(4)}`);
}
lines.push(`file 'frames/f${String(meta.frames.at(-1).i).padStart(6, '0')}.jpg'`);
fs.writeFileSync(path.join(DIR, 'list.txt'), lines.join('\n'));
const r = spawnSync(process.env.FFMPEG_BIN || path.join(path.dirname(new URL(import.meta.url).pathname), 'ffmpeg'), ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(DIR, 'list.txt'), '-vf', `fps=30,scale=${meta.width}:${meta.height}:force_original_aspect_ratio=decrease,pad=${meta.width}:${meta.height}:(ow-iw)/2:(oh-ih)/2:white`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', OUTFILE], { stdio: ['ignore', 'ignore', 'pipe'] });
if (r.status !== 0) { console.error(r.stderr.toString().slice(-1500)); process.exit(1); }
console.log(`✅ ${OUTFILE}  时长约 ${total.toFixed(0)}s（构建段 ${SPEED}x）`);
