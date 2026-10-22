// 打包「真活插件」：画图标 → 压成 zip → public/downloads/zhenhuo-plugin.zip（/work/plugin 页面的下载按钮指向它）
//   node scripts/build-zhenhuo.mjs
// 和「数据外采篮」完全是两个插件，各打各的包。改插件要改 manifest 版本号再打包。
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const DIR = 'extension/zhenhuo';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a6ff8"/><stop offset="1" stop-color="#3f35c4"/></linearGradient></defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  <rect x="26" y="30" width="76" height="56" rx="8" fill="none" stroke="#fff" stroke-width="7"/>
  <path d="M48 98 H80" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
  <path d="M44 58 L58 70 L84 46" fill="none" stroke="#7ee0c8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="98" cy="30" r="11" fill="#ff5b5b" stroke="#fff" stroke-width="4"/>
</svg>`;
fs.mkdirSync(`${DIR}/icons`, { recursive: true });
for (const s of [16, 48, 128]) await sharp(Buffer.from(svg)).resize(s, s).png().toFile(`${DIR}/icons/icon${s}.png`);
fs.writeFileSync('public/work/zhenhuo-icon.svg', svg);
fs.mkdirSync('public/downloads', { recursive: true });
const out = 'public/downloads/zhenhuo-plugin.zip';
if (fs.existsSync(out)) fs.unlinkSync(out);
execSync(`cd extension && zip -qr ../${out} zhenhuo -x "*.DS_Store"`);
const v = JSON.parse(fs.readFileSync(`${DIR}/manifest.json`, 'utf8')).version;
fs.writeFileSync('public/downloads/zhenhuo-plugin.json', JSON.stringify({ version: v, builtAt: new Date().toISOString() }));
console.log(`✓ ${out}（v${v}，${(fs.statSync(out).size / 1024).toFixed(0)} KB）`);
