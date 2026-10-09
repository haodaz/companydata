/**
 * 脚本化录制（拷自 datasquare/scripts/video/drive.mjs，加了 eval / pause / resume）：按分镜自动驱动页面，同时录屏。
 *   node scripts/video/drive.mjs out/lab-surgeon scripts/video/lab-surgeon.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 *
 * 额外的分镜动作：
 *   { eval: 'async () => {...}' }      在页面里跑一段脚本（按步骤作答、慢慢打字），跑的时候照常录
 *   { pause: true } / { resume: true } 暂停 / 继续抓帧（等评分这种空等不录，成片里直接跳过）
 *   { local: { key: value } }          写 localStorage（访客编号、称呼），写完刷新
 *
 * 原说明：
 * 不需要真人操作的片段用它；需要真人点的（比如片段二的真实运行）用 record-run.mjs。
 *
 *   node scripts/video/drive.mjs <输出目录> <分镜文件.mjs> [--width=900] [--height=1125] [--fps=15]
 *
 * 分镜文件 export default 一个数组，每项：
 *   { go: 'url' }                      跳转并等待
 *   { hold: 3 }                        停留 N 秒
 *   { scroll: 800, over: 2 }           在 N 秒内平滑滚动到某位置
 *   { click: 'text=提交材料' }          按文本点按钮
 *   { note: '说明' }                    只写进日志，便于对分镜
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// /lab 在 LAB_PUBLIC=1 下免登录，用一个干净的临时 profile 就行
const PROFILE = process.env.LAB_REC_PROFILE || path.join(process.env.TMPDIR || '/tmp', 'lab-rec-profile');
const FFMPEG = process.env.FFMPEG_BIN || path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const [OUT_DIR, SCENE_FILE] = args.filter(a => !a.startsWith('--'));
if (!OUT_DIR || !SCENE_FILE) { console.error('用法：node scripts/video/drive.mjs <输出目录> <分镜文件>'); process.exit(1); }

const W = parseInt(flags.width || '900');
const H = parseInt(flags.height || '1125');
const DSF = Number(flags.dsf || 2.4);
const FPS = parseInt(flags.fps || '15');
// 输出画布：竖幅片段用 1080x1350，宽版面片段（如三栏扫描报告）传 --out=1920x1080
const [OUT_W, OUT_H] = (flags.out || '1080x1350').split('x').map(Number);
const PORT = 9300 + Math.floor(Math.random() * 190);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const scenes = (await import(path.resolve(SCENE_FILE))).default;
fs.mkdirSync(path.join(OUT_DIR, 'frames'), { recursive: true });

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--headless=new', `--window-size=${W},${H}`, '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

let page = null;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  } catch { /* 等 */ }
}
if (!page) { console.error('连不上 Chrome'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0; const pending = new Map();
let frameCount = 0;

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
const send = (method, params = {}, timeoutMs = 8000) => new Promise((resolve) => {
  const id = ++msgId;
  const timer = setTimeout(() => { pending.delete(id); resolve(null); }, timeoutMs);
  pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
  ws.send(JSON.stringify({ id, method, params }));
});

await new Promise(r => { ws.onopen = r; });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });

const evaluate = (expression) => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });

console.log(`▶︎ 版面 ${W}×${H} @${DSF}x → 输出 ${OUT_W}×${OUT_H}，共 ${scenes.length} 个动作，抓帧 ${FPS}fps`);

// headless 下 screencast 只在重绘时推帧，静态页面几乎不出帧，
// 所以改成按固定节拍主动截图，保证时间轴均匀。
let capturing = true;
let paused = false;
let activeMs = 0;
// 每一帧在成片里的时间（毫秒）。页面忙的时候截图会变慢，按平均帧率铺开会让画面和时间点错位，所以按这个时间合成
const frameTimes = [];   // 真正在抓帧的时长（暂停的不算），成片帧率按它算，跳过的空等不会把视频拉长
const captureLoop = (async () => {
  const interval = 1000 / FPS;
  while (capturing) {
    const t0 = Date.now();
    if (paused) { await sleep(interval); continue; }
    try {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, 3000);
      if (r?.data) { frameTimes.push(activeMs + (Date.now() - t0)); fs.writeFileSync(path.join(OUT_DIR, 'frames', `f${String(frameCount++).padStart(6, '0')}.jpg`), Buffer.from(r.data, 'base64')); }
    } catch { /* 页面导航中，跳过这一帧 */ }
    const wait = interval - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    activeMs += Date.now() - t0;
  }
})();

const startedAt = Date.now();
const marks = [];

for (const [i, sc] of scenes.entries()) {
  const at = (Date.now() - startedAt) / 1000;
  // vt = 成片里的时间（只算在抓帧的时长），后期按它切
  if (sc.note) { const vt = activeMs / 1000; marks.push({ at, vt, note: sc.note }); console.log(`  ${at.toFixed(1)}s（成片 ${vt.toFixed(1)}s）· ${sc.note}`); }

  if (sc.go) {
    paused = true;                       // 导航中截图会挂起，先停抓
    await send('Page.navigate', { url: sc.go }, 15000);
    await sleep(sc.wait ?? 5000);
    paused = false;
  }
  if (sc.scroll !== undefined) {
    const over = (sc.over ?? 2) * 1000;
    // 后台布局里真正滚动的是内容区那个 div，不是 window，
    // 所以先找出页面上实际可滚动的容器再动它。
    await evaluate(`(async () => {
      function scroller() {
        const cands = [...document.querySelectorAll('div, main, section')]
          .filter(el => {
            const st = getComputedStyle(el);
            return (st.overflowY === 'auto' || st.overflowY === 'scroll')
              && el.scrollHeight - el.clientHeight > 40;
          })
          .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
        if (cands.length) return cands[0];
        return document.scrollingElement || document.documentElement;
      }
      const el = scroller();
      const max = el.scrollHeight - el.clientHeight;
      const target = Math.min(${sc.scroll}, max);
      const start = el.scrollTop;
      const t0 = performance.now();
      return new Promise(res => {
        function step(t) {
          const p = Math.min(1, (t - t0) / ${over});
          const e = p < .5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
          el.scrollTop = start + (target - start) * e;
          p < 1 ? requestAnimationFrame(step) : res({ from: start, to: el.scrollTop, max });
        }
        requestAnimationFrame(step);
      });
    })()`);
    await sleep(300);
  }

  if (sc.click) {
    const text = sc.click.replace(/^text=/, '');
    await evaluate(`(() => {
      const els = [...document.querySelectorAll('button, a, [role=button]')];
      const el = els.find(e => (e.innerText || '').trim().includes(${JSON.stringify(text)}));
      if (el) { el.scrollIntoView({block:'center'}); el.click(); return true; }
      return false;
    })()`);
    await sleep(sc.wait ?? 1500);
  }
  if (sc.setModel) {
    await evaluate(`(() => { try { localStorage.setItem('datasquare_model', ${JSON.stringify(sc.setModel)}); return true; } catch { return false; } })()`);
  }

  if (sc.setFile) {
    // 用 CDP 把文件塞进上传框（等价于真人选文件）
    await send('DOM.enable');
    const doc = await send('DOM.getDocument', { depth: -1 });
    const node = await send('DOM.querySelector', { nodeId: doc?.root?.nodeId, selector: 'input[type=file]' });
    if (node?.nodeId) {
      await send('DOM.setFileInputFiles', { files: [path.resolve(sc.setFile)], nodeId: node.nodeId });
      console.log(`     ↳ 已选文件 ${path.basename(sc.setFile)}`);
    } else {
      console.warn('     ↳ 没找到上传框');
    }
    await sleep(sc.wait ?? 1200);
  }

  if (sc.waitFor) {
    const limit = (sc.timeout ?? 420) * 1000;
    const t0 = Date.now();
    let hit = false;
    while (Date.now() - t0 < limit) {
      const r = await evaluate(`document.body.innerText.includes(${JSON.stringify(sc.waitFor)})`);
      if (r?.result?.value) { hit = true; break; }
      await sleep(2000);
    }
    console.log(`     ↳ ${hit ? '等到' : '超时未等到'}「${sc.waitFor}」（${((Date.now() - t0) / 1000).toFixed(0)}s）`);
  }

  if (sc.local) {
    await evaluate(`(() => { const o = ${JSON.stringify(sc.local)}; for (const k in o) localStorage.setItem(k, typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k])); location.reload(); return true; })()`);
    paused = true; await sleep(sc.wait ?? 5000); paused = false;
  }
  if (sc.eval) {
    const r = await send('Runtime.evaluate', { expression: `(${sc.eval})()`, returnByValue: true, awaitPromise: true }, (sc.timeout ?? 120) * 1000);
    if (r?.exceptionDetails) console.warn('     ↳ eval 出错', r.exceptionDetails?.exception?.description?.slice(0, 200));
    else if (r?.result?.value !== undefined) console.log('     ↳', JSON.stringify(r.result.value).slice(0, 160));
  }
  if (sc.pause) paused = true;
  if (sc.resume) paused = false;
  if (sc.hold) await sleep(sc.hold * 1000);
}

capturing = false;
await captureLoop;
const wall = (Date.now() - startedAt) / 1000;
const realFps = frameCount / Math.max(1, activeMs / 1000);

const out = path.join(OUT_DIR, 'clip.mp4');
fs.writeFileSync(path.join(OUT_DIR, 'frames', 'times.json'), JSON.stringify(frameTimes));
writeConcat(OUT_DIR, frameTimes, activeMs);
spawnSync(FFMPEG, [
  '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT_DIR, 'frames', 'list.txt'),
  '-vf', `fps=${FPS},scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease,pad=${OUT_W}:${OUT_H}:(ow-iw)/2:(oh-ih)/2:white`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out,
], { stdio: 'ignore' });

let timeline = null;
try {
  const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__zccTimeline || null)', returnByValue: true });
  timeline = r?.result?.value ? JSON.parse(r.result.value) : null;
} catch { /* 页面可能已跳走 */ }

fs.writeFileSync(path.join(OUT_DIR, 'marks.json'), JSON.stringify({ wall, frames: frameCount, marks, timeline }, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify({ wallSeconds: wall, frames: frameCount, fps: FPS, timeline }, null, 2));
if (timeline) console.log(`   事件时间轴：${timeline.events.length} 个事件`);
console.log(`\n✅ ${out}　${wall.toFixed(1)}s / ${frameCount} 帧（抓帧 ${realFps.toFixed(1)}fps）`);
chrome.kill();
process.exit(0);

/** concat 清单：每帧停到下一帧的时间点，最后一帧停到录制结束 */
function writeConcat(dir, times, endMs) {
  const lines = [];
  times.forEach((t, i) => {
    const next = i + 1 < times.length ? times[i + 1] : endMs;
    lines.push(`file 'f${String(i).padStart(6, '0')}.jpg'`, `duration ${Math.max(0.001, (next - t) / 1000).toFixed(4)}`);
  });
  if (times.length) lines.push(`file 'f${String(times.length - 1).padStart(6, '0')}.jpg'`);
  fs.writeFileSync(path.join(dir, 'frames', 'list.txt'), lines.join('\n') + '\n');
}
