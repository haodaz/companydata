/**
 * 分镜：林小满（材料科学与工程 · 大一）跟博士后学姐 NOVA-75 过了一天——以为科研就是刷瓶子，走完一天报了大创。
 *   node scripts/video/drive.mjs <输出目录> scripts/video/lab-research-lxm.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 访客编号 v:demo-lxm-research（scripts/.prep-lxm.mts 事先把 7 段都走过，证书已解锁）；片子里重走 08:00 / 08:40 / 10:20 三段。
 * 3D 手套箱间那一小段效果还在调，以后可以单独补录（splice.py 按 note 换段）。分段速度见 lab-research-lxm.speed.json。
 */
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SPACE = 'c8c986e6-6452-4834-bac4-1ce2a360c9cc';

const REPLY = 'B3 先别删，也先别算进平均。它是 3/14 装的，那天 1# 箱水值 2.4 ppm、净化柱待再生——B3 阻抗高，可能是水汽污染，不一定是修饰不均。我先把 3/14 那批单列存疑，主对比只用水氧合格那几天的电池。上午我进 1# 箱，按规范装一块裸锂对照，读数都记下来；对照出来了，再判断 LiF 到底有没有用。';
const HANDOFF = '【组装记录】1 号箱，进箱前 H2O 0.06 ppm、O2 0.3 ppm。过渡舱抽洗三次后开内门。称 Li6PS5Cl 80 mg，375 MPa 保压 3 秒压片。压片后右手手套针孔漏气，水值升到 0.9 ppm：立即盖瓶、封手套口、开循环净化，水值回到 0.1 以下才贴锂，堆叠压力 5 MPa，封装送出。2 号箱水氧偏高，未使用。\n给小周：对照电池已送 EIS。你那批数据先别下结论，等对照出来、批次对清楚再说。';
const RECORD = '伪影：高频掉到实轴下面那几个点是线缆电感（空白短路片也有），拟合前剔除。电路用 R_b + (R_int‖CPE) + W。裸锂对照：静置那只 R_int 也在长，和 √t 成直线——化学分解在发生；0.5 mA/cm² 那只 100 h 后拐上去，加压到 10 MPa 复测回来大半——还叠加了接触失效。送样：先送 L1 和 B1 做 XPS 深度剖析。现在还不能说「LiF 解决了衰减」：只有 2 对样品，全电池也没验证。';

// 职业主页：鼠标在人物上晃一圈，景深跟着动（画一个指针）
const WIGGLE = (sel, n = 150) => run(`
  const box = await L.until(() => document.querySelector('${sel}')); const r = box.getBoundingClientRect();
  const cur = document.createElement('div');
  cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10-6.5 1.2L16 21l-3 1.3-3.4-7.6L4 19z" fill="#fff" stroke="#171a2e" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  Object.assign(cur.style, { position: 'fixed', zIndex: 99999, pointerEvents: 'none', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' });
  document.body.appendChild(cur);
  const at = (x, y) => { cur.style.left = x + 'px'; cur.style.top = y + 'px'; const e = new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }); box.dispatchEvent(e); window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y })); };
  for (let i = 0; i <= ${n}; i++) { const a = i / ${n} * Math.PI * 2.4; at(r.left + r.width * (0.5 + 0.4 * Math.sin(a)), r.top + r.height * (0.45 + 0.22 * Math.sin(a * 1.6))); await L.sleep(45); }
  for (let i = 0; i <= 16; i++) { at(r.left + r.width * 0.5, r.top + r.height * 0.45); await L.sleep(40); }
  cur.remove(); return 'wiggle';`);

// 进某一段：从一天页选时段 → 进入操作台 → 开始这一段
const enter = slot => run(`
  window.__stepFrom = 0; window.__textStep = null;
  const t = await L.until(() => [...document.querySelectorAll('.dayv-tl button')].find(b => b.innerText.includes('${slot}')));
  await L.click(t, 1500); window.scrollTo({ top: 0 });
  await L.click(await L.until(() => L.btn('进入操作台')), 2500);
  await L.click(await L.until(() => L.btn('开始这一段')), 1800); return 'start ${slot}';`);

// 按示范答案走判断题；遇到工位交给 bench，遇到写一段停下（交给下一个镜头）
const walk = (slot, bench = '', skip = []) => run(`
  let sp = null; for (let i = 0; i < 5 && !sp; i++) { try { sp = await fetch('/api/lab/spaces/${SPACE}').then(r => r.json()); } catch { await L.sleep(1500); } }
  const ch = sp.space.chapters.find(c => c.slot === '${slot}'); const tr = ch.expert_trace || {}; const out = [];
  const startIdx = window.__stepFrom || 0; window.__stepFrom = 0;
  const steps = ch.sim.steps;
  for (let i = startIdx; i < steps.length; i++) {
    const st = steps[i];
    if (st.type === 'text') { window.__textStep = st; break; }
    if (st.type === 'bench') { window.__stepFrom = i + 1; ${bench} out.push('bench'); if (${JSON.stringify(skip)}.includes('after-bench')) break; continue; }
    out.push(st.id + ':' + await L.answer(st, tr[st.id]));
    await L.sleep(450);
  }
  return out;`);

// 手套箱：学姐先示范一遍（台面右下角「看我操作一遍」），走完点「完成操作」
const GLOVEBOX = `
  await L.dialogue(); await L.sleep(800);
  const demo = await L.until(() => L.btn('看我操作一遍'), 20000); await L.click(demo, 1000);
  await L.sleep(2500);
  await L.until(() => L.btn('看我操作一遍') && !L.btn('演示中'), 150000);
  await L.sleep(1500);
  const fin = await L.until(() => { const b = L.btn('完成操作') || L.btn('提交这段操作'); return b && !b.disabled && b; }, 20000); await L.click(fin, 2000);
  await L.nextBtn();`;

// 阻抗谱：林小满自己操作
const EIS = `
  await L.dialogue(); await L.sleep(1000);
  const q = t => [...document.querySelectorAll('button, label')].find(b => (b.innerText || '').replace(/\\s/g, '').includes(t.replace(/\\s/g, '')));
  const amp = await L.until(() => document.querySelector('input[type=range]'), 20000);
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  for (const v of [22, 18, 14, 11, 10]) { set.call(amp, String(v)); amp.dispatchEvent(new Event('input', { bubbles: true })); amp.dispatchEvent(new Event('change', { bubbles: true })); await L.sleep(250); }
  await L.sleep(600); await L.click(q('测量三只电池'), 3600);
  await L.click(q('放大高频区'), 2600); await L.click(q('看全谱'), 900);
  await L.click(q('剔除高频掉到实轴下面的点'), 1200);
  const circ = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes('R_b + (R_int‖CPE) + W'));
  await L.click(circ, 900); await L.click(q('拟合全部谱'), 3200);
  await L.click(q('电池堆叠压力加到 10 MPa'), 3400);
  await L.click(q('两种都有'), 1500); await L.click(q('发给 PI'), 1500);
  const fin = await L.until(() => { const b = L.btn('完成操作') || L.btn('提交这段操作'); return b && !b.disabled && b; }, 40000); await L.click(fin, 2000);
  await L.nextBtn();`;

// 台面结束后：结果卡上的「下一步」出得慢，循环点对话 / 下一步，直到写一段的输入框出现
const TO_TEXT = `for (let i = 0; i < 30; i++) { const ta = [...document.querySelectorAll('textarea')].find(t => t.getClientRects().length); if (ta) break; await L.dialogue(); await L.nextBtn(); await L.sleep(1000); }`;

const report = n => [
  { pause: true },
  { waitFor: 'COMPETENCY REPORT', timeout: 300 },
  { hold: 1.5 },
  { resume: true },
  { note: `${n}_report` },
  { hold: 4 },
  { eval: run(`const m = document.querySelector('.lab-game-modal'); if (m) { for (let i = 0; i < 40; i++) { m.scrollTop += 16; await L.sleep(60); } } await L.sleep(1500); if (m) m.scrollTop = 0; return 'scrolled';`) },
  { hold: 1 },
];
const backToDay = { eval: run(`const b = L.btn('退出操作台'); if (b) await L.click(b, 2000); return 'day';`) };

export default [
  // ── 开头：学姐是谁 ──
  { go: `${BASE}/lab/${SPACE}`, wait: 6000 },
  { local: { 'lab:visitor': 'v:demo-lxm-research', 'lab:rookie': { name: '林小满', note: '材料科学与工程 · 大一', location: '长沙' }, 'lab:rookie:asked': '1' }, wait: 8000 },
  { note: 'hub' },
  { hold: 1.5 },
  { eval: WIGGLE('section.hub'), timeout: 30 },
  { hold: 1 },

  // ── 3D 手套箱间（以后可补录）──
  { pause: true },
  { go: `${BASE}/lab/beta/3d/glovebox`, wait: 45000 },
  { resume: true },
  { note: 'room' },
  { eval: WIGGLE('body', 120), timeout: 30 },
  { eval: run(`const t = [...document.querySelectorAll('.splat-tag')].find(t => t.innerText.includes('惰性气体手套箱')); if (t) { t.click(); await L.sleep(4500); t.click(); } return 'tag';`), timeout: 20 },
  { hold: 1 },

  // ── 一天 ──
  { pause: true },
  { go: `${BASE}/lab/${SPACE}?m=test`, wait: 7000 },
  { resume: true },
  { note: 'day' },
  { hold: 2 },
  { scroll: 700, over: 3 },
  { scroll: 0, over: 1.5 },

  // ── 08:00 先查数据从哪来 ──
  { note: 'c1_intro' },
  { eval: enter('08:00'), timeout: 40 },
  { note: 'c1_steps' },
  { eval: walk('08:00'), timeout: 120 },
  { note: 'c1_text' },
  { eval: run(`await L.answer(window.__textStep, ${JSON.stringify(REPLY)}); return 'submitted';`), timeout: 120 },
  ...report('c1'),
  backToDay,

  // ── 08:40 手套箱 ──
  { note: 'c2_intro' },
  { eval: enter('08:40'), timeout: 40 },
  { note: 'c2_steps' },
  { eval: walk('08:40', '', ['after-bench']), timeout: 180 },
  { note: 'c2_bench' },
  { eval: run(GLOVEBOX + ` return 'glovebox';`), timeout: 220 },
  { note: 'c2_text' },
  { eval: run(TO_TEXT + `await L.answer(window.__textStep || (await (async () => { const sp = await fetch('/api/lab/spaces/${SPACE}').then(r => r.json()); return sp.space.chapters.find(c => c.slot === '08:40').sim.steps.find(s => s.type === 'text'); })()), ${JSON.stringify(HANDOFF)}); return 'submitted';`), timeout: 150 },
  ...report('c2'),
  backToDay,

  // ── 10:20 阻抗谱 ──
  { note: 'c3_intro' },
  { eval: enter('10:20'), timeout: 40 },
  { note: 'c3_steps' },
  { eval: walk('10:20', '', ['after-bench']), timeout: 120 },
  { note: 'c3_bench' },
  { eval: run(EIS + ` return 'eis';`), timeout: 160 },
  { note: 'c3_rest' },
  { eval: run(`for (let i = 0; i < 20; i++) { if (!document.querySelector('.bench-hud, .bench-split')) break; await L.nextBtn(); await L.sleep(1000); } return 'past bench';`), timeout: 40 },
  { eval: walk('10:20'), timeout: 160 },
  { note: 'c3_text' },
  { eval: run(TO_TEXT + `await L.answer(window.__textStep, ${JSON.stringify(RECORD)}); return 'submitted';`), timeout: 150 },
  ...report('c3'),
  backToDay,

  // ── 这一天后面几段：快速翻过 ──
  { note: 'tour' },
  { eval: run(`for (const t of ['12:00', '14:00', '17:30', '19:00']) { await L.click([...document.querySelectorAll('.dayv-tl button')].find(b => b.innerText.includes(t)), 600); window.scrollTo({ top: 0 }); await L.sleep(3000); } return 'tour';`), timeout: 60 },

  // ── 证书 ──
  { pause: true },
  { go: `${BASE}/lab/me`, wait: 7000 },
  { resume: true },
  { note: 'me' },
  { hold: 2.5 },
  { eval: run(`const b = await L.until(() => [...document.querySelectorAll('.me-day')].find(b => { let e = b; for (let i = 0; i < 8 && e; i++) { e = e.parentElement; if (e && e.innerText.includes('电池材料')) return true; } return false; })); if (!b) throw new Error('没有电池材料博士后的证书'); await L.click(b, 800); return 'folder';`) },
  { pause: true },
  { waitFor: '点击打开', timeout: 90 },
  { hold: 1 },
  { resume: true },
  { note: 'cover' },
  { hold: 3.5 },
  { eval: run(`document.querySelector('.cover').click(); await L.sleep(1800); const b = [...document.querySelectorAll('.folio-tabs button')].find(b => b.innerText.trim() === '证书'); if (b) await L.click(b, 1200); window.scrollTo({ top: 110, behavior: 'smooth' }); return 'cert';`) },
  { note: 'cert' },
  { hold: 7 },
  { eval: run(`const b = [...document.querySelectorAll('.folio-tabs button')].find(b => b.innerText.trim() === '全天'); if (b) await L.click(b, 1200); return 'day';`) },
  { note: 'scores' },
  { hold: 5 },
  { eval: run(`const b = [...document.querySelectorAll('.folio-tabs button')].find(b => b.innerText.trim() === '证书'); if (b) await L.click(b, 1000); return 'cert';`) },
  { note: 'end' },
  { hold: 5 },
];
