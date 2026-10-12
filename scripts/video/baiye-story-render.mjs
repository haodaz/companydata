// 百业长片：把 public/video/baiye-story.html 的每一页渲染成帧（card 逐帧；clip / full 每段一张画框图）。由 baiye-story.py 调用。
//   node scripts/video/baiye-story-render.mjs <工作目录> [fps] [只渲染的场景,逗号分隔]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const [W, FPS = 25, ONLY = ''] = process.argv.slice(2);
const only = ONLY ? new Set(ONLY.split(',')) : null;
const page_ = 'file://' + path.resolve('public/video/baiye-story.html') + '?render=1';
const b = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files'], timeout: 120000, protocolTimeout: 600000 });
const p = await b.newPage(); p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await p.goto(page_, { waitUntil: 'networkidle0' });
await p.evaluate(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 600)); });
const scenes = await p.evaluate(() => window.SCENES);
const cutsOf = await p.evaluate(() => Object.fromEntries(Object.entries((window.STORY || {}).scenes || {}).map(([k, v]) => [k, (v.cuts || []).length])));
for (const s of scenes) {
  if (only && !only.has(s.id)) continue;
  if (s.kind === 'card') {
    const dir = path.join(W, 'frames', s.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const N = Math.round(s.dur * FPS);
    for (let i = 0; i < N; i++) { await p.evaluate((id, t) => window.show(id, t), s.id, i / FPS); await p.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); }
    console.log('card', s.id, N, '帧');
  } else {
    const dir = path.join(W, 'chrome'); fs.mkdirSync(dir, { recursive: true });
    const n = Math.max(1, cutsOf[s.id] || 1);
    for (let k = 0; k < n; k++) {
      await p.evaluate((id, t) => window.show(id, t), s.id, (k + .5) * s.dur / n);
      await p.screenshot({ path: path.join(dir, `${s.id}-${k}.png`), type: 'png', omitBackground: s.kind === 'full' });
    }
    console.log(s.kind, s.id, n, '张');
  }
}
fs.writeFileSync(path.join(W, 'scenes.json'), JSON.stringify(scenes));
await b.close();
