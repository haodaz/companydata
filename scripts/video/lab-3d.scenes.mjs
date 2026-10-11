/**
 * 分镜：3D 沉浸的一天（3D beta）——开腹医师的手术室、拉花师傅的咖啡吧台。
 *   node scripts/video/drive.mjs <输出目录> scripts/video/lab-3d.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080 --fps=15
 * 无头浏览器没有摄像头：用鼠标晃动演示视角变化（画一个指针），旁白说明打开摄像头是跟着头动。
 * 3D 场景截图每秒只能抓 5 帧左右：3D 那几段的晃动和停顿都按 3 倍真实时长录（SLOW），剪辑时同一段再加速 3 倍（lab-3d.speed.json），成片是顺的。
 * 跑的时候加 CHROME_GPU=1。
 */
const SLOW = 3;
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SURGEON = '681b5f1c-5115-4c32-82ea-69c085b21868', LATTE = '155db8f9-b0b3-4f08-a842-df1e94c381f4', GUJI = '61f1f7fb-9b56-4e32-8a13-dac7c66fdddf';

// 等 3D 场景加载完（有画布、加载条没了）
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); await L.sleep(3500); return '3d ready';`);
// 鼠标在画面上画一个横 8 字：视角跟着动，看得出前后层次
// sec = 成片里的秒数；cycles = 画几个 8 字
const SWEEP = (sec = 7, amp = 0.42, cycles = 1) => run(`
  const cur = document.getElementById('__cur') || Object.assign(document.createElement('div'), { id: '__cur', innerHTML: '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10-6.5 1.2L16 21l-3 1.3-3.4-7.6L4 19z" fill="#fff" stroke="#171a2e" stroke-width="1.4" stroke-linejoin="round"/></svg>' });
  Object.assign(cur.style, { position: 'fixed', zIndex: 99999, pointerEvents: 'none', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' });
  document.body.appendChild(cur);
  const W = window.innerWidth, H = window.innerHeight, N = Math.round(${sec} * ${SLOW} * 22);
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2 * ${cycles};
    const x = W * (0.5 + ${amp} * Math.sin(a)), y = H * (0.5 + ${amp} * 0.55 * Math.sin(a * 2));
    cur.style.left = x + 'px'; cur.style.top = y + 'px';
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
    await L.sleep(45);
  }
  cur.remove(); return 'sweep';`);
const CLICK_TEXT = (t, sel = 'a, button') => run(`const el = await L.until(() => [...document.querySelectorAll('${sel}')].find(x => x.innerText.includes(${JSON.stringify(t)}))); if (!el) throw new Error('没找到 ' + ${JSON.stringify(t)}); el.style.outline = '3px solid #fff'; await L.sleep(700); el.click(); return 'click';`);
// 进一天页里某个时段的操作台，走到第一题
const STAGE = slot => run(`
  await L.until(() => document.querySelector('.dayv-tl'));
  const b = [...document.querySelectorAll('.dayv-tl button')].find(x => x.innerText.includes('${slot}')); if (b) { b.click(); await L.sleep(1500); }
  await L.click(await L.until(() => L.btn('进入操作台')), 2500);
  await L.click(await L.until(() => L.btn('开始这一段')), 1500);
  await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000);
  return 'stage';`);
// 「我教你」：选这一段 → NOVA 走一遍，对话、前几步一翻而过，停在工位上
const TEACH_STAGE = slot => run(`
  await L.until(() => document.querySelector('.dayv-tl'));
  const b = [...document.querySelectorAll('.dayv-tl button')].find(x => x.innerText.includes('${slot}')); if (b) { b.click(); await L.sleep(1500); }
  await L.click(await L.until(() => [...document.querySelectorAll('button')].find(x => /走一遍/.test(x.innerText) && !x.disabled)), 2500);
  const go = L.btn('走这一段'); if (go) await L.click(go, 1500);
  await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000);
  return 'stage';`);
const TO_BENCH = run(`
  for (let i = 0; i < 14; i++) {
    if (document.body.innerText.includes('CAM 01')) return 'bench';
    const d = document.querySelector('.lab-game-dialogue'); if (d && d.getClientRects().length) { d.click(); await L.sleep(700); continue; }
    const r = await L.nextBtn(); if (!r) await L.sleep(600);
  }
  return 'no bench';`);
// 工位演示走完（「下一步」能点了），最多等 secs 秒
const BENCH_DONE = secs => run(`for (let k = 0; k < ${secs} * 2; k++) { const b = L.btn('下一步'); if (b && !b.disabled && !document.body.innerText.includes('CAM 01')) return 'done'; if (b && !b.disabled) return 'done'; await L.sleep(500); } return 'timeout';`);
const TO_QUESTION = run(`for (let i = 0; i < 5; i++) { const d = document.querySelector('.lab-game-dialogue'); if (!d) break; d.click(); await L.sleep(1000); } return 'q';`);
// 用老师傅的答案答当前这一步，进到下一步的对话
const ANSWER = (space, slot) => run(`
  const sp = await fetch('/api/lab/spaces/${space}').then(r => r.json());
  const ch = sp.space.chapters.find(c => c.slot === '${slot}'); const tr = ch.expert_trace || sp.space.skill?.expert_trace || {};
  const st = ch.sim.steps.find(s => document.body.innerText.includes(String(s.prompt).slice(0, 12)));
  if (st && tr[st.id] !== undefined) return await L.answer(st, tr[st.id]);
  return await L.nextBtn();`);

export default [
  { go: `${BASE}/lab/gallery`, wait: 6000 },
  { local: { 'lab:visitor': 'v:demo-3d', 'lab:rookie': { name: '体验者', note: '', location: '' }, 'lab:rookie:asked': '1' }, wait: 6000 },
  { note: 'gallery' },
  { hold: 3 },
  { scroll: 900, over: 5 },
  { scroll: 0, over: 2 },

  // ── 开腹医师：主页 → 走进手术室（看一眼就进操作） ──
  { go: `${BASE}/lab/${SURGEON}`, wait: 7000 },
  { note: 'hub_or' },
  { hold: 3 },
  { eval: CLICK_TEXT('走进手术室') },
  { pause: true }, { eval: WAIT3D, timeout: 90 }, { resume: true },
  { note: 'or3d' },
  { eval: SWEEP(7, 0.45), timeout: 60 },

  // ── 09:10 阑尾切除：周教授说着话，直接进开腹工位 ──
  { go: `${BASE}/lab/${SURGEON}?m=teach`, wait: 7000 },
  { pause: true }, { eval: TEACH_STAGE('09:10'), timeout: 120 }, { resume: true },
  { note: 'or_stage' },
  { hold: 2 * SLOW },
  { eval: TO_BENCH, timeout: 90 },
  { note: 'or_bench' },
  { eval: BENCH_DONE(110), timeout: 150 },
  { hold: 2 },

  // ── 拉花师傅：走进咖啡吧台 → 09:00 拉花操作台 ──
  { go: `${BASE}/lab/${LATTE}`, wait: 7000 },
  { note: 'hub_cafe' },
  { hold: 3 },
  { eval: CLICK_TEXT('走进咖啡吧台') },
  { pause: true }, { eval: WAIT3D, timeout: 90 }, { resume: true },
  { note: 'cafe3d' },
  { eval: SWEEP(5, 0.45), timeout: 60 },
  { go: `${BASE}/lab/${LATTE}?m=teach`, wait: 7000 },
  { pause: true }, { eval: TEACH_STAGE('09:00'), timeout: 120 }, { resume: true },
  { note: 'cafe_stage' },
  { hold: 2 * SLOW },
  { eval: TO_BENCH, timeout: 90 },
  { note: 'cafe_bench' },
  { eval: BENCH_DONE(120), timeout: 160 },
  { hold: 2 },
  // ── 古籍修复师：主页 → 一天 → 看 NOVA 拿毛刷刷浆（2D 工位，正常速度） ──
  { go: `${BASE}/lab/${GUJI}`, wait: 7000 },
  { note: 'guji_hub' },
  { eval: run(`const hub = await L.until(() => document.querySelector('section.hub')); const r = hub.getBoundingClientRect(); for (let i = 0; i <= 90; i++) { const a = i / 90 * Math.PI * 2; hub.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * (0.5 + 0.4 * Math.sin(a)), clientY: r.top + r.height * (0.45 + 0.25 * Math.sin(a * 1.6)), bubbles: true })); await L.sleep(45); } return 'w';`), timeout: 30 },
  { go: `${BASE}/lab/${GUJI}?m=teach`, wait: 7000 },
  { hold: 2 },
  { pause: true },
  { eval: run(`
      await L.until(() => document.querySelector('.dayv-tl'));
      const b = [...document.querySelectorAll('.dayv-tl button')].find(x => x.innerText.includes('含工位')); if (b) { b.click(); await L.sleep(1500); }
      await L.click(await L.until(() => L.btn('走一遍')), 2500);
      const go = L.btn('走这一段'); if (go) await L.click(go, 2000);
      for (let i = 0; i < 12; i++) {
        await L.dialogue(); await L.sleep(400);
        if (document.querySelector('.bench-hud, .bench-split') || document.body.innerText.includes('CAM 01')) return 'bench';
        const r = await L.nextBtn(); if (!r) await L.sleep(800);
      }
      return 'no bench';`), timeout: 120 },
  { resume: true },
  { note: 'guji_bench' },
  { hold: 11 },

  // ── 证书夹 ──
  { go: `${BASE}/lab/me`, wait: 7000 },
  { pause: true },
  { eval: run(`await L.click(await L.until(() => L.btn('打开证书')), 800); return 'folder';`) },
  { waitFor: '点击打开', timeout: 90 },
  { resume: true },
  { hold: 1 },
  { eval: run(`document.querySelector('.cover').click(); await L.sleep(1600); return 'opened';`) },
  { note: 'cert' },
  { hold: 8 },
  { note: 'end' },
  { hold: 7.5 },
];
