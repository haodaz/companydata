/**
 * 分镜：王晓明——以为潜导带教是「带薪度假」，随手点完没考过；回头一条条重做，才拿到证书。
 *   node scripts/video/drive.mjs <输出目录> scripts/video/lab-dive-wangxiaoming.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 访客编号单独一个（v:demo-wxm-dive2），不碰好大壮的示范数据。分段速度见 lab-dive-wangxiaoming.speed.json。
 */
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SPACE = '387fcc19-bd56-453e-a983-b3a1b4da5704';

const SLOPPY = '张同学、李女士、王先生照常下水，张同学说下海就清醒了，李女士多喝杯咖啡提提神。赵小姐晚上赶飞机，怕路上堵车，今天就不潜了。大家注意安全、玩得开心，按时发船！';
const REPORT = `【晨光号 08:35 行前准入简报】
一、准入结论：4 人中今日仅王先生可潜。
1. 张同学：昨晚饮酒、凌晨入睡，头痛口渴，属宿醉脱水，水下判断力下降、减压病风险升高。取消上午两潜，阴凉处补水休息，下午无症状再评估。已当面说明：不是不让玩，是今天身体不适合下水。
2. 李女士：早晨服用扑尔敏，有嗜睡镇静作用，水下会放大氮醉。今日禁潜，不靠咖啡硬撑，可改约。
3. 王先生：高血压，持近 3 个月医生准许证明、用药稳定，条件允许下水；下水前复测血压，安排有经验的潜伴，不超计划深度。
4. 赵小姐：19:30 航班，潜后仅 6.5 小时，远低于潜后飞行至少 18 小时的要求，机舱低压会诱发减压病。改为水面浮潜，退还深潜差价。
二、装备：气瓶已测氧浓度 21%，气阀缓开到底回拧半圈，主备二级头、BCD 充排气逐一试过。
三、下水后重点：盯王先生上升速度与安全停留；全员留意头痛、关节痛、麻木，有异常立即上报并供氧。`;

// 工位上的小工具：按控件名找到那张卡片，拧旋钮 / 拨开关 / 按按钮
const BENCH = `
  const card = lbl => { const sp = [...document.querySelectorAll('span')].find(s => s.innerText.trim() === lbl && s.getClientRects().length); return sp && sp.parentElement.parentElement; };
  const setRange = (input, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, String(v)); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
  const knob = (lbl, v) => setRange(card(lbl).querySelector('input[type=range]'), v);
  const sw = (lbl, on) => [...card(lbl).querySelectorAll('button')].find(b => b.innerText.trim() === (on ? '开' : '关')).click();
  const press = lbl => { const b = card(lbl).querySelector('button'); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.click(); };
  async function enterBench() { await L.dialogue(); await L.sleep(600); const s = L.btn('开始操作'); if (s) await L.click(s, 1500); await L.until(() => card('气瓶阀门开度'), 15000); await L.sleep(800); }
  async function finishBench() { const b = await L.until(() => { const x = L.btn('完成操作'); return x && !x.disabled && x; }, 60000); await L.click(b, 2000); return await L.nextBtn(); }
`;

// 一段：按给定答案走完判断题，工位那步交给 bench(...)，写一段那步留到下一个镜头
const steps = (pick, bench) => run(`${BENCH}
  let sp = null; for (let i = 0; i < 5 && !sp; i++) { try { sp = await fetch('/api/lab/spaces/${SPACE}').then(r => r.json()); } catch { await L.sleep(1500); } }
  const ch = sp.space.chapters[0]; const P = ${JSON.stringify(pick)}; const out = [];
  for (const st of ch.sim.steps) {
    if (st.type === 'text') { window.__textStep = st; break; }
    if (st.type === 'bench') { await enterBench(); ${bench} out.push('bench:' + await finishBench()); continue; }
    out.push(st.id + ':' + await L.answer(st, P[st.id]));
    await L.sleep(450);
  }
  return out;`);

// 职业主页：鼠标在人物上晃一圈，景深跟着动（画一个指针，看得出是鼠标在动）
const WIGGLE = run(`
  const hub = await L.until(() => document.querySelector('section.hub')); const r = hub.getBoundingClientRect();
  const cur = document.createElement('div');
  cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10-6.5 1.2L16 21l-3 1.3-3.4-7.6L4 19z" fill="#fff" stroke="#171a2e" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  Object.assign(cur.style, { position: 'fixed', zIndex: 99999, pointerEvents: 'none', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' });
  document.body.appendChild(cur);
  const at = (x, y) => { cur.style.left = x + 'px'; cur.style.top = y + 'px'; hub.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); };
  const N = 170;
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 3;
    at(r.left + r.width * (0.5 + 0.42 * Math.sin(a)), r.top + r.height * (0.45 + 0.28 * Math.sin(a * 1.6)));
    await L.sleep(45);
  }
  for (let i = 0; i <= 20; i++) { at(r.left + r.width * 0.5, r.top + r.height * 0.45); await L.sleep(40); }
  cur.remove(); return 'wiggle';`);

// 第一次：图省事——差不多都放行、开阀一把拧到底、备用气源不试
const CARELESS = { classify_guests: { A: 'allow', B: 'allow', C: 'allow', D: 'deny' }, danger_priority: 'opt4', compromise_action: ['sol_b', 'sol_a'] };
const CARELESS_BENCH = `
  await L.sleep(1200); knob('气瓶阀门开度', 3); await L.sleep(1500);
  press('主二级头排气/试吸'); await L.sleep(1200);
  press('BCD低压充气纽'); await L.sleep(1000);`;
// 第二次：一条条按规矩来
const CAREFUL = { classify_guests: { A: 'deny', B: 'deny', C: 'allow', D: 'deny' }, danger_priority: 'opt2', compromise_action: ['sol_a', 'sol_d'] };
const CAREFUL_BENCH = `
  await L.sleep(800); sw('气体纯度与氧分压检测仪', 1); await L.sleep(3200); sw('气体纯度与氧分压检测仪', 0); await L.sleep(1000);
  for (const v of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) { knob('气瓶阀门开度', v); await L.sleep(450); }
  await L.sleep(1200); knob('气瓶阀门开度', 2.75); await L.sleep(450); knob('气瓶阀门开度', 2.5); await L.sleep(2800);
  press('主二级头排气/试吸'); await L.sleep(1800); press('备用二级头(章鱼)试吸'); await L.sleep(1800);
  press('BCD低压充气纽'); await L.sleep(1500); press('BCD快速排气阀拉索'); await L.sleep(1500);`;

const report = (n) => [
  { pause: true },
  { waitFor: 'COMPETENCY REPORT', timeout: 240 },
  { hold: 1.5 },
  { resume: true },
  { note: `${n}_report` },
  { hold: 5 },
  { eval: run(`const m = document.querySelector('.lab-game-modal'); if (m) { for (let i = 0; i < 60; i++) { m.scrollTop += 16; await L.sleep(70); } } await L.sleep(2500); if (m) m.scrollTop = 0; return 'scrolled';`) },
  { hold: 1 },
];

export default [
  // ── 开头：体验馆 → 潜导带教 ──
  { go: `${BASE}/lab/gallery`, wait: 6000 },
  { local: { 'lab:visitor': 'v:demo-wxm-dive2', 'lab:rookie': { name: '王晓明', note: '海洋大学 · 大三', location: '青岛' }, 'lab:rookie:asked': '1' }, wait: 7000 },
  { note: 'gallery' },
  { hold: 1.5 },
  { scroll: 1400, over: 5 },
  { scroll: 0, over: 1.5 },
  { eval: run(`const card = await L.until(() => [...document.querySelectorAll('.gal-card')].find(c => c.innerText.includes('潜导'))); if (!card) throw new Error('没找到潜导卡片'); card.scrollIntoView({ block: 'center', behavior: 'smooth' }); await L.sleep(1400); card.style.outline = '3px solid #6a5cff'; await L.sleep(800); card.click(); return 'open';`) },
  { pause: true }, { hold: 6 }, { resume: true },
  { note: 'hub' },
  { hold: 1.5 },
  { eval: WIGGLE, timeout: 30 },
  { hold: 1 },
  { eval: run(`const p = await L.until(() => [...document.querySelectorAll('.hub-portal')].find(x => x.innerText.includes('考考你'))); p.style.outline = '3px solid #fff'; await L.sleep(700); p.click(); return 'test';`) },
  { pause: true }, { hold: 5 }, { resume: true },
  { note: 'day' },
  { hold: 3 },

  // ── 第一次：随手点完 ──
  { note: 'a_intro' },
  { eval: run(`const b = await L.until(() => L.btn('进入操作台')); await L.click(b, 2500); return 'stage';`) },
  { hold: 3 },
  { eval: run(`await L.click(await L.until(() => L.btn('开始这一段')), 1800); return 'start';`) },
  { note: 'a_steps' },
  { eval: steps(CARELESS, CARELESS_BENCH), timeout: 240 },
  { note: 'a_text' },
  { eval: run(`const st = window.__textStep; await L.answer(st, ${JSON.stringify(SLOPPY)}); return 'submitted';`), timeout: 120 },
  ...report('a'),

  // ── 我的：红色成绩、证书待解锁、去重做 ──
  { note: 'a_me' },
  { go: `${BASE}/lab/me`, wait: 7000 },
  { hold: 3.5 },
  { eval: run(`const t = await L.until(() => document.querySelector('.me-part.fail')); if (!t) throw new Error('没有未通过的成绩卡'); t.style.outline = '3px solid #ef4444'; await L.sleep(900); t.click(); return 'folder';`) },
  { pause: true },
  { waitFor: '点击打开', timeout: 90 },
  { hold: 1 },
  { resume: true },
  { note: 'a_cover' },
  { hold: 3.5 },
  { eval: run(`document.querySelector('.cover').click(); await L.sleep(1600); return 'opened';`) },
  { note: 'a_record' },
  { hold: 6 },
  { eval: run(`window.scrollTo({ top: 0, behavior: 'smooth' }); await L.sleep(1500); return 'top';`) },
  { note: 'a_todo' },
  { hold: 3.5 },
  { eval: run(`const b = [...document.querySelectorAll('button, a')].find(x => x.innerText.includes('去重做')); if (!b) throw new Error('没有去重做'); b.style.outline = '3px solid #ef4444'; await L.sleep(1000); b.click(); return 'redo';`) },
  { pause: true }, { hold: 6 }, { resume: true },

  // ── 第二次：一条条按规矩来 ──
  { note: 'b_intro' },
  { hold: 2 },
  { eval: run(`const b = await L.until(() => L.btn('进入操作台')); await L.click(b, 2500); await L.click(await L.until(() => L.btn('开始这一段')), 1800); return 'start';`) },
  { note: 'b_steps' },
  { eval: steps(CAREFUL, CAREFUL_BENCH), timeout: 240 },
  { note: 'b_text' },
  { eval: run(`const st = window.__textStep; await L.answer(st, ${JSON.stringify(REPORT)}); return 'submitted';`), timeout: 180 },
  ...report('b'),

  // ── 证书 ──
  { note: 'b_me' },
  { go: `${BASE}/lab/me`, wait: 7000 },
  { hold: 3 },
  { eval: run(`const b = await L.until(() => [...document.querySelectorAll('.me-day')].find(b => { let e = b; for (let i = 0; i < 8 && e; i++) { e = e.parentElement; if (e && e.innerText.includes('潜导') && !e.innerText.includes('开腹')) return true; } return false; })); if (!b) throw new Error('没有潜导的证书'); await L.click(b, 800); return 'folder';`) },
  { pause: true },
  { waitFor: '点击打开', timeout: 90 },
  { hold: 1 },
  { resume: true },
  { note: 'b_cover' },
  { hold: 3 },
  { eval: run(`document.querySelector('.cover').click(); await L.sleep(1600); return 'opened';`) },
  { note: 'b_cert' },
  { hold: 7 },
  { eval: run(`const b = L.btn('翻页'); if (b) await L.click(b, 1400); return 'flip';`) },
  { note: 'b_scores' },
  { hold: 5 },
  { eval: run(`const b = [...document.querySelectorAll('.folio-tabs button')].find(b => b.innerText.trim() === '证书'); if (b) await L.click(b, 600); return 'cert';`) },
  { note: 'end' },
  { hold: 4 },
];
