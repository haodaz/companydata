/**
 * 录「输入一个职业 → 自动生成探索空间 → 亲手体验」全程：puppeteer-core 驱动本机 Chrome（无头），CDP screencast 抓帧 + 时间戳 + 段落标记。
 *   先 cd scripts/video && npm i puppeteer-core（不入库），再：node record-career-demo.mjs <输出目录> <职业名>；然后 node encode-frames.mjs <输出目录> <输出.mp4>
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const [OUT, PROF = '咖啡师'] = process.argv.slice(2);
const BASE = 'http://localhost:3003';
const TOKEN = fs.readFileSync('/Users/aisandbox/Documents/companydata/.preview-token', 'utf8').trim();
const W = 1440, H = 900;
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frames = []; const marks = [];
const mark = (name) => { marks.push({ name, t: Date.now() }); console.log(`● ${name} @${((Date.now() - t0) / 1000).toFixed(1)}s`); };

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: process.env.HEADED ? false : true, protocolTimeout: 20 * 60 * 1000, args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await browser.setCookie({ name: 'auth_token', value: TOKEN, domain: 'localhost', path: '/' });
page.on('dialog', d => d.accept());
const cdp = await page.createCDPSession();
const t0 = Date.now();
cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
  const i = frames.length; frames.push({ i, t: Date.now() });
  fs.writeFileSync(path.join(OUT, 'frames', `f${String(i).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64'));
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

const click = async (sel, wait = 800) => { await page.waitForSelector(sel, { timeout: 30000 }); await page.click(sel); await sleep(wait); };
const clickText = async (text, wait = 800) => click(`::-p-text(${text})`, wait);
const clickCenter = async (wait = 800) => { await page.mouse.click(W / 2, H * 0.78); await sleep(wait); };
const scrollSlow = async (dir) => { const step = dir > 0 ? 220 : -220; for (let i = 0; i < 40; i++) { const done = await page.evaluate(s => { const b = window.scrollY; window.scrollBy(0, s); return window.scrollY === b; }, step); if (done) break; await sleep(160); } };

await page.evaluateOnNewDocument(() => { try { localStorage.setItem('cd_current_model', 'gpt-5.6-luna'); } catch {} Element.prototype.requestFullscreen = () => Promise.resolve(); });
await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(1200);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 78, maxWidth: W, maxHeight: H, everyNthFrame: 6 });
mark('start'); await sleep(2500);

await clickText('从岗位 JD 构建新空间', 1600);
const input = 'input[placeholder^="输入一个职业"]';
await page.waitForSelector(input); await page.click(input); await sleep(600);
await page.type(input, PROF, { delay: 170 }); await sleep(1200);
mark('build_start');
await clickText('生成探索空间', 500);
await page.waitForFunction(() => /^\/lab\/[0-9a-f-]{20,}/.test(location.pathname), { timeout: 15 * 60 * 1000, polling: 1500 });
mark('build_end');
await page.waitForSelector('::-p-text(亲手体验这个职业的一天)', { timeout: 60000 });
await sleep(3500);
await scrollSlow(1); await sleep(1800); await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(1600);

mark('try');
await clickText('亲手体验这个职业的一天', 1800);
await clickText('让新兵上操作台走一遍', 4500);
await clickCenter(900); await clickCenter(1800);                       // NPC 对话：跳过打字 → 继续
// 第一步：点两个选项（choose 只认一个，multi 认两个）
for (const letter of ['B', 'A']) { await page.evaluate(L => { const s = [...document.querySelectorAll('.lab-game-modal span.lab-mono')].find(x => x.textContent.trim() === L); s?.parentElement?.click(); }, letter); await sleep(900); }
await sleep(600);
await page.evaluate(() => { const b = [...document.querySelectorAll('.lab-game-modal button')].find(x => /下一步|确认操作/.test(x.textContent)); b?.click(); }); await sleep(1500);
await page.evaluate(() => { const b = [...document.querySelectorAll('.lab-game-modal button')].find(x => /下一步/.test(x.textContent) && !x.disabled); b?.click(); }); await sleep(3500);
await clickCenter(900); await clickCenter(2500);                       // 工位交接对话 → 开始操作
mark('bench');
// 操作：把前两个开关打开，第一个旋钮拉到 60%，看着事件流走一会儿
const sw = await page.$$('::-p-text(开)');
for (const b of sw.slice(0, 2)) { await b.click().catch(() => {}); await sleep(2200); }
await page.evaluate(() => { const r = document.querySelector('input[type=range]'); if (!r) return; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const max = Number(r.max || 100), min = Number(r.min || 0); setter.call(r, min + (max - min) * 0.6); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
await sleep(14000);
await page.evaluate(() => { const r = document.querySelector('input[type=range]'); if (!r) return; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const max = Number(r.max || 100), min = Number(r.min || 0); setter.call(r, min + (max - min) * 0.8); r.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(12000);
const btn = await page.$('::-p-text(完成操作)'); if (btn) { await btn.click().catch(() => {}); await sleep(4500); }
mark('end'); await sleep(800);
await cdp.send('Page.stopScreencast').catch(() => {});
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ t0, frames, marks, width: W, height: H, profession: PROF, url: page.url() }, null, 1));
console.log(`⏹ ${frames.length} 帧，${((Date.now() - t0) / 1000).toFixed(0)}s，空间 ${page.url()}`);
await browser.close();
