/**
 * 截真实页面（照 drive.mjs 的 CDP 做法，不抓帧只出 PNG）：给宣传页 / 封面用。
 *   node scripts/video/shot.mjs scripts/video/work.shots.mjs [--width=1600] [--height=900] [--dsf=1.2]
 * 分镜文件 export default 数组：{ go, wait } / { eval: 'async () => {...}' } / { hold } / { transparent: true } / { shot: 'public/work/xxx.png' }
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = process.env.LAB_REC_PROFILE || path.join(process.env.TMPDIR || '/tmp', 'lab-rec-profile');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const [SCENE_FILE] = args.filter(a => !a.startsWith('--'));
const W = parseInt(flags.width || '1600'), H = parseInt(flags.height || '900'), DSF = Number(flags.dsf || 1.2);
const PORT = 9500 + Math.floor(Math.random() * 190);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scenes = (await import(path.resolve(SCENE_FILE))).default;

const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new', `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let page = null;
for (let i = 0; i < 40 && !page; i++) { await sleep(500); try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl); } catch {} }
if (!page) { console.error('连不上 Chrome'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}, timeoutMs = 60000) => new Promise(resolve => { const id = ++msgId; const timer = setTimeout(() => { pending.delete(id); resolve(null); }, timeoutMs); pending.set(id, r => { clearTimeout(timer); resolve(r); }); ws.send(JSON.stringify({ id, method, params })); });
await new Promise(r => { ws.onopen = r; });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
const evaluate = expression => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });

for (const sc of scenes) {
  if (sc.transparent) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });   // 透明底（校徽、图标）
  if (sc.cookie) await send('Network.setCookie', { name: sc.cookie.name, value: sc.cookie.value, url: sc.cookie.url, path: '/' });
  if (sc.go) { await send('Page.navigate', { url: sc.go }, 15000); await sleep(sc.wait ?? 4000); }
  // 原生输入（2026-10-27，画白板用：页面里合成的指针 / 键盘事件 Excalidraw 不认）：
  //   { key: 'r' } 按一个键；{ drag: { rel: '.excalidraw', from: [x, y], to: [x, y], steps } } 相对某元素左上角拖一笔；{ clickAt: { rel, at: [x, y] } }
  if (sc.key) { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: sc.key, text: type === 'keyDown' ? sc.key : undefined, code: 'Key' + sc.key.toUpperCase(), windowsVirtualKeyCode: sc.key.toUpperCase().charCodeAt(0) }); await sleep(250); }
  if (sc.drag || sc.clickAt) {
    const o = sc.drag || sc.clickAt; let ox = 0, oy = 0;
    if (o.rel) { const r = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(o.rel)}); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top]; })()`); [ox, oy] = r?.result?.value || [0, 0]; }
    const a = sc.drag ? o.from : o.at, b = sc.drag ? o.to : o.at, n = sc.drag ? (o.steps || 16) : 1;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ox + a[0], y: oy + a[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ox + a[0], y: oy + a[1], button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= n; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ox + a[0] + (b[0] - a[0]) * i / n, y: oy + a[1] + (b[1] - a[1]) * i / n, button: 'left', buttons: 1 }); await sleep(28); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ox + b[0], y: oy + b[1], button: 'left', buttons: 0, clickCount: 1 });
    await sleep(350);
  }
  if (sc.eval) { const r = await evaluate(`(${sc.eval})()`); console.log('  eval →', JSON.stringify(r?.result?.value ?? r?.result?.description ?? r).slice(0, 160)); }
  if (sc.hold) await sleep(sc.hold * 1000);
  if (sc.shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r?.data) { fs.mkdirSync(path.dirname(sc.shot), { recursive: true }); fs.writeFileSync(sc.shot, Buffer.from(r.data, 'base64')); console.log('📸', sc.shot); } else console.log('✗ 截图失败', sc.shot); }
}
ws.close(); chrome.kill(); process.exit(0);
