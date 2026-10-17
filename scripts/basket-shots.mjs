// 数据外采篮使用说明的操作截图（public/basket/step-*.png）
//   node scripts/basket-shots.mjs
// ① 扩展程序页：真实页面 + 中文标注；② 侧边栏三种状态：打开插件自己的 sidepanel.html，给 chrome.* 和平台接口装个替身；
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const puppeteer = createRequire(import.meta.url)('puppeteer-core');
const OUT = 'public/basket';
const EXT = path.resolve('extension/data-basket');
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--lang=zh-CN'] });

// ── ① 扩展程序页 ──
{
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 300, deviceScaleFactor: 2 });
  await p.goto('chrome://extensions', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 1000));
  await p.evaluate(() => { const t = document.querySelector('extensions-manager')?.shadowRoot?.querySelector('extensions-toolbar')?.shadowRoot?.querySelector('#devMode'); if (t && !t.checked) t.click(); });
  await new Promise(r => setTimeout(r, 800));
  const raw = await p.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 110 } });
  const W = 2560, H = 220;
  const box = (x, y, w, h, label, lx, ly) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="none" stroke="#dc2626" stroke-width="6"/><rect x="${lx - 12}" y="${ly - 44}" width="${label.length * 34 + 24}" height="58" rx="12" fill="#dc2626"/><text x="${lx}" y="${ly}" font-size="34" font-family="PingFang SC, sans-serif" font-weight="700" fill="#fff">${label}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 90}">${box(2240, 18, 312, 74, '① 打开「开发者模式」', 1880, 180)}${box(40, 126, 270, 84, '② 点「加载已解压的扩展程序」', 340, 190)}</svg>`;
  await sharp({ create: { width: W, height: H + 90, channels: 3, background: '#fff' } }).composite([{ input: raw, top: 0, left: 0 }, { input: Buffer.from(svg), top: 0, left: 0, blend: 'over' }]).png().toFile(`${OUT}/step-extensions.png`);
  console.log('✓ 扩展程序页');
}

// ── ② 侧边栏三种状态 ──
const RESULTS = [
  { ok: true, company: '百度公司', jobs: 10, saved: 10, title: '百度校园招聘 · 实习生招聘 第 21 页', time: '10:21:40' },
  { ok: true, company: '百度公司', jobs: 10, saved: 10, title: '百度校园招聘 · 实习生招聘 第 20 页', time: '10:21:12' },
  { ok: true, company: '百度公司', jobs: 1, saved: 1, kind: 'detail', title: 'Agent 评测算法实习生（J106616）', time: '10:20:31' },
  { ok: true, company: '百度公司', jobs: 10, saved: 10, title: '百度校园招聘 · 实习生招聘 第 19 页', time: '10:19:58' },
];
async function panel(name, store, after) {
  const p = await b.newPage(); await p.setViewport({ width: 380, height: 760, deviceScaleFactor: 2 });
  await p.evaluateOnNewDocument((store) => {
    const mem = { ...store };
    window.chrome = {
      storage: { local: { get: async () => mem, set: async (o) => Object.assign(mem, o) } },
      tabs: { query: async () => [{ id: 1, title: '百度校园招聘', url: 'https://talent.baidu.com/jobs/list?search=&recruitType=INTERN' }], onRemoved: { addListener() {} } },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      scripting: { executeScript: async () => [{ result: { url: 'https://talent.baidu.com/jobs/list', title: '百度校园招聘', text: 'x', links: [] } }] },
    };
    window.fetch = async (u) => new Response(JSON.stringify(String(u).includes('companies') ? { ok: true, data: [{ id: 1350, name: '百度公司', entry: 'https://talent.baidu.com/jobs/list?recruitType=GRADUATE' }] } : { ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }, store);
  await p.goto('file://' + path.join(EXT, 'sidepanel.html')); await new Promise(r => setTimeout(r, 600));
  if (after) await after(p);
  await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('✓', name);
}
await panel('step-connect', {}, async p => { await p.evaluate(() => { document.getElementById('settings').classList.remove('hidden'); document.getElementById('base').value = 'https://www.aidataoffice.com'; document.getElementById('token').value = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6Ij…（粘贴你的篮子口令）'; document.getElementById('settingsMsg').textContent = '✓ 连上了'; }); });
await panel('step-pick', { base: 'https://www.aidataoffice.com', token: 't' }, async p => { await p.type('#q', '百度'); await p.click('#search'); await new Promise(r => setTimeout(r, 400)); });
await panel('step-follow', { base: 'https://www.aidataoffice.com', token: 't', company: { id: 1350, name: '百度公司' }, pages: 4, jobs: 31, log: RESULTS }, async p => { await p.click('#startStop'); await p.evaluate(() => { window.__fakeSession = true; }); });

// （③ 生成口令的截图不要了：页面上真按钮就在「开始使用」里，放截图同事会当成按钮去点）
await b.close();
