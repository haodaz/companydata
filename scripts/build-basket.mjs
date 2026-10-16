// 打包「数据外采篮」插件：画图标 → 压成 zip → public/downloads/data-basket.zip（宣传页上的下载按钮指向它）
//   node scripts/build-basket.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const DIR = 'extension/data-basket';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  <path d="M36 56 C36 30, 92 30, 92 56" fill="none" stroke="#fff7ed" stroke-width="8" stroke-linecap="round"/>
  <path d="M22 56 H106 L96 100 Q94 106 88 106 H40 Q34 106 32 100 Z" fill="#fff7ed"/>
  <path d="M40 66 L46 98 M56 66 L58 98 M72 66 L70 98 M88 66 L82 98" stroke="#fdba74" stroke-width="5" stroke-linecap="round"/>
  <path d="M28 70 H100" stroke="#fdba74" stroke-width="5"/>
</svg>`;
fs.mkdirSync(`${DIR}/icons`, { recursive: true });
for (const s of [16, 48, 128]) await sharp(Buffer.from(svg)).resize(s, s).png().toFile(`${DIR}/icons/icon${s}.png`);
fs.writeFileSync('public/basket-icon.svg', svg);
fs.mkdirSync('public/downloads', { recursive: true });
const out = 'public/downloads/data-basket.zip';
if (fs.existsSync(out)) fs.unlinkSync(out);
execSync(`cd extension && zip -qr ../${out} data-basket -x "*.DS_Store"`);
const v = JSON.parse(fs.readFileSync(`${DIR}/manifest.json`, 'utf8')).version;
fs.writeFileSync('public/downloads/data-basket.json', JSON.stringify({ version: v, builtAt: new Date().toISOString() }));
console.log(`✓ ${out}（v${v}，${(fs.statSync(out).size / 1024).toFixed(0)} KB）`);
