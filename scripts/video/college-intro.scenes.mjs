/**
 * 百业大学介绍片《百业大学：培养 AI 数字职人，走进千行百业》第三版（2026-10-21）：
 * 用户要「按介绍一所大学讲故事」、格局大、少放静态页，把职人空间、3D、操作台、和职人聊、真活做题、报告、毕业证书都拿进来，约 4 分钟。
 * 主线跟一位毕业生走：数据分析师 NOVA-56（不用医生这类要具身的岗位，容易被质疑；也不讲客服——人人都说会训练客服）。
 *   空间 → 每一天（只露一个缩影）→ 3D 工位 → 操作台 → 对话 → 真活 → 报告 → 毕业证书（百业那套证书夹，名字叫 NOVA）→ 档案；
 *   再讲客户带来的四个问题（出海 / 车间数据 / 新公司 / 基金）、给 AI Native 组织供血、会自己长大的大学、人 · 求真 · 心智世界。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/college-intro.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 3D 刚加载出来的几秒会拉丝（高斯点还在长）：等 15 秒稳了再开录。3D 场景和操作台抓帧慢：按 SLOW 倍真实时长录，autospeed 按旁白自动加速回来。等 AI 回答的空档 pause 掉。
 * 不往库里写答卷；「和我聊」会真的问一句（记账照常）。职人主页上的平台统计数字录的时候遮掉（对外片子不放平台数字）。
 */
import { run as runLab } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const ANALYST = 'a35a662d-2be8-4cc1-a255-4c3f8ad29139';   // NOVA-56 数据分析师（3D：数据分析工位）
const WORK = 'T712yYY1swI', REPORT_SID = 'b9dca9f4-9a99-4649-aaa2-a752a186ed81';   // 真活：宁德时代德布勒森供需平衡；一份已有的报告
const SLOW = 3;

// 大学页面用的小工具（平滑滚动、打字、遮掉统计数字……）
const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  function glide(y, ms = 1800) {
    return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
      const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  const to = (sel, off = 80, ms = 1800) => glide(top(document.querySelector(sel), off), ms);
  const btn = t => [...document.querySelectorAll('button, a')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const setv = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, cps = 16) { el.focus(); let cur = ''; for (const ch of text) { cur += ch; setv(el, cur); await sleep(1000 / cps); } await sleep(250); }
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  // 职人主页上的平台统计数字（考过多少人、服务多少人次……）录的时候遮掉
  const hideStats = () => {
    const tile = [...document.querySelectorAll('div')].find(d => /^\\d+\\s*人次\\s*服务$/.test((d.innerText || '').replace(/\\s+/g, ' ').trim()));
    if (tile && tile.parentElement) tile.parentElement.style.visibility = 'hidden';
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length) continue; const t = el.textContent || '';
      if (/\\d+\\s*人考过/.test(t)) el.textContent = '换你上手';
      else if (/^解过\\s*\\d+\\s*次$/.test(t.trim())) el.textContent = '带着问题来';
      else if (/已吸收\\s*\\d+\\s*轮专家经验/.test(t)) el.textContent = '好老师的经验与判断规则';
    }
  };
  return (window.__ck = { sleep, vis, until, glide, top, to, btn, setv, type, kill, hideStats });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;

// ── 3D：等加载完；鼠标画横 8 字让视角动起来（按 SLOW 倍时长画） ──
const WAIT3D = run(`await L.until(() => document.querySelector('canvas') && !document.body.innerText.includes('LOADING 3D'), 60000); for (let i = 0; i < 2400; i++) { const a = i / 200 * Math.PI * 2; window.dispatchEvent(new PointerEvent('pointermove', { clientX: innerWidth * (0.5 + 0.3 * Math.sin(a)), clientY: innerHeight * 0.5, bubbles: true })); await L.sleep(45); } return '3d ready';`);
const SWEEP = (sec = 7, amp = 0.42) => run(`
  const cur = document.getElementById('__cur') || Object.assign(document.createElement('div'), { id: '__cur', innerHTML: '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10-6.5 1.2L16 21l-3 1.3-3.4-7.6L4 19z" fill="#fff" stroke="#171a2e" stroke-width="1.4" stroke-linejoin="round"/></svg>' });
  Object.assign(cur.style, { position: 'fixed', zIndex: 99999, pointerEvents: 'none', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))' });
  document.body.appendChild(cur);
  const W = innerWidth, Hh = innerHeight, N = Math.round(${sec} * ${SLOW} * 22);
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; const x = W * (0.5 + ${amp} * Math.sin(a)), y = Hh * (0.5 + ${amp} * 0.55 * Math.sin(a * 2));
    cur.style.left = x + 'px'; cur.style.top = y + 'px'; window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); await L.sleep(45); }
  cur.remove(); return 'sweep';`);
// 「我教你」：选某一段 → 走一遍，对话一翻而过，停在操作台上
const TEACH_STAGE = slot => runLab(`
  await L.until(() => document.querySelector('.dayv-tl'));
  const b = [...document.querySelectorAll('.dayv-tl button')].find(x => x.innerText.includes('${slot}')); if (b) { b.click(); await L.sleep(1500); }
  await L.click(await L.until(() => [...document.querySelectorAll('button, a')].find(x => /学这一段|走一遍/.test(x.innerText) && !x.disabled)), 2500);
  await L.click(await L.until(() => L.btn('开始跟着学') || L.btn('走这一段')), 2500);
  await L.sleep(45000);   // 背景是 3D：等高斯点长稳、加载时的拉丝散掉再开录（数据工位的 3D 大，15 秒不够）
  return 'stage';`);
// 进到第一道题：对话点过去，必要时点「下一步」，直到出现「看看老手怎么做」
const TO_BENCH = runLab(`
  for (let i = 0; i < 16; i++) {
    if (L.btn('看看老手怎么做')) return 'question';
    const d = document.querySelector('.lab-game-dialogue'); if (d && d.getClientRects().length) { d.click(); await L.sleep(900); continue; }
    const r = await L.nextBtn(); if (!r) await L.sleep(800);
  }
  return 'no question';`);

// 操作台上这一题：停一会儿（像在读题）→ 按老手的标准答案作答（从接口读 expert_trace）→「看看老手怎么做」→ 看讲解。停顿都按 SLOW 倍录
const BENCH = runLab(`
  await L.sleep(${3 * SLOW} * 1000);
  const sp = await fetch('/api/lab/spaces/${ANALYST}').then(r => r.json());
  const ch = sp.space.chapters.find(c => c.slot === '09:20'); const tr = ch.expert_trace || sp.space.skill?.expert_trace || {};
  const st = ch.sim.steps.find(s => document.body.innerText.includes(String(s.prompt || '').slice(0, 12)));
  let r = 'no step';
  if (st && tr[st.id] !== undefined) r = await L.answer(st, tr[st.id]);
  await L.sleep(${2 * SLOW} * 1000);
  const see = L.btn('看看老手怎么做'); if (see && !see.disabled) see.click();
  await L.sleep(${6 * SLOW} * 1000);
  return 'answer: ' + r;`);

const LAB_LOCAL = { 'lab:visitor': 'v:demo-college', 'lab:rookie': { name: '体验者', note: '', location: '' }, 'lab:rookie:asked': '1' };
const ASK = '大促当天成交额突然掉了三成，你第一步查什么？';

export default [
  // ══ 一所 AI 的大学 ══
  { pause: true },
  { go: `${BASE}/college`, wait: 9000 },
  { eval: run(`await L.until(() => document.querySelectorAll('.cu-one').length > 10, 30000); scrollTo(0, 0); await L.sleep(1500); return 'ready';`), timeout: 40 },
  { resume: true },
  { note: 'hero' },
  { hold: 14 },
  { note: 'about' },
  { eval: run(`await L.to('#about', 40, 2600); await L.sleep(8000); return 1;`), timeout: 20 },
  { note: 'become' },
  { eval: run(`await L.to('.cu-become', 70, 2400); await L.sleep(5500); return 1;`), timeout: 20 },

  // ══ 一位毕业生：数据分析师 NOVA-56 ══
  { pause: true },
  { go: `${BASE}/lab/gallery`, wait: 5000 },
  { local: LAB_LOCAL, wait: 4000 },
  { go: `${BASE}/lab/${ANALYST}`, wait: 8000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('数据分析师'), 20000); L.hideStats(); await L.sleep(800); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'hub' },
  { eval: run(`L.hideStats(); await L.sleep(6000); return 1;`), timeout: 15 },
  // 每一天：一天的时间轴（只露一个缩影）
  { pause: true },
  { go: `${BASE}/lab/${ANALYST}?m=teach`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('.dayv-tl'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'day' },
  { eval: run(`const bs = [...document.querySelectorAll('.dayv-tl button')]; for (const b of bs.slice(0, 8)) { b.style.transition = 'background .3s'; b.style.background = 'rgba(176,141,87,.22)'; await L.sleep(800); b.style.background = ''; } await L.sleep(4000); return bs.length;`), timeout: 30 },
  // 3D 工位
  { pause: true },
  { go: `${BASE}/lab/${ANALYST}`, wait: 7000 },
  { eval: run(`const a = await L.until(() => [...document.querySelectorAll('a, button')].find(x => /3D/.test(x.innerText) && /走进/.test(x.innerText))); a.click(); return a.innerText;`), timeout: 30 },
  { eval: WAIT3D, timeout: 90 },
  { resume: true },
  { note: 'room3d' },
  { eval: SWEEP(7, 0.4), timeout: 80 },
  // 操作台：09:20 黑色星期六数据破案台
  { pause: true },
  { go: `${BASE}/lab/${ANALYST}?m=teach`, wait: 7000 },
  { eval: TEACH_STAGE('09:20'), timeout: 120 },
  { eval: TO_BENCH, timeout: 60 },
  { resume: true },
  { note: 'bench' },
  { eval: BENCH, timeout: 120 },
  // 和它聊
  { pause: true },
  { go: `${BASE}/lab/${ANALYST}/chat`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('textarea, input[placeholder^="问问"]'), 20000); await L.sleep(800); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'chat' },
  { eval: run(`const ta = document.querySelector('textarea') || document.querySelector('input[placeholder^="问问"]'); await L.type(ta, ${JSON.stringify(ASK)}, 12); await L.sleep(500); const send = L.btn('发送'); send && send.click(); await L.sleep(1500); return 'asked';`), timeout: 30 },
  { pause: true },
  { eval: run(`const n0 = document.body.innerText.length; await L.until(() => { const s = L.btn('发送'); return document.body.innerText.length > n0 + 120 && s && !s.disabled; }, 180000); await L.sleep(1500); return 'answered';`), timeout: 200 },
  { resume: true },
  { hold: 7 },

  // ══ 真活、报告、毕业证书 ══
  { pause: true },
  { eval: `() => { try { localStorage.removeItem('work:${WORK}'); } catch {} return 1; }` },
  { go: `${BASE}/work/${WORK}`, wait: 8000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('任务书'), 20000); scrollTo(0, 0); await L.sleep(800); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'work' },
  { eval: run(`await L.sleep(2500); await L.glide(520, 3500); await L.sleep(3500); return 1;`), timeout: 20 },
  { pause: true },
  { go: `${BASE}/work/${WORK}?s=${REPORT_SID}`, wait: 9000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('真活台 · 报告'), 30000); scrollTo(0, 0); await L.sleep(800); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'report' },
  { eval: run(`await L.sleep(2500);
      const th = [...document.querySelectorAll('th')].find(x => (x.innerText || '').replace(/\\s/g, '') === 'AI基线');
      await L.glide(480, 2500); await L.sleep(1000);
      if (th) { const tbl = th.closest('table'); const idx = th.cellIndex; if (tbl && idx >= 0) for (const r of tbl.rows) { const c = r.cells[idx]; if (c) { c.style.background = 'rgba(176,141,87,.22)'; c.style.fontWeight = '800'; } } }
      await L.sleep(4500); return 1;`), timeout: 25 },
  // 毕业证书：百业那套证书夹（封皮 → 翻开证书 → 成绩）
  { pause: true },
  { go: `${BASE}/college/g/${ANALYST}/diploma`, wait: 12000 },
  { eval: run(`await L.until(() => document.querySelector('.folio-wrap'), 40000); scrollTo(0, L.top(document.querySelector('.folio-wrap'), 110)); await L.sleep(1500); return 1;`), timeout: 60 },
  { resume: true },
  { note: 'diploma' },
  { eval: run(`await L.sleep(2500); const c = [...document.querySelectorAll('.folio-wrap *')].find(x => (x.innerText || '').trim() === '点击打开') || document.querySelector('.folio-wrap > div'); c && c.click(); await L.sleep(3500);
      await L.glide(L.top(document.querySelector('.folio-wrap'), 90), 1500); await L.sleep(4500);
      const nx = [...document.querySelectorAll('.folio-nav button')].pop(); if (nx && !nx.disabled) { nx.click(); await L.sleep(3500); } return 1;`), timeout: 40 },

  // ══ 毕业生：直接输送给企业 ══
  { pause: true },
  { go: `${BASE}/college/graduates`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelectorAll('.cg-card').length > 10, 30000);
      const chip = [...document.querySelectorAll('.ch-fams button')].find(b => b.innerText.includes('互联网与科技')); chip && chip.click(); await L.sleep(1200);
      scrollTo(0, L.top(document.querySelector('#graduates'), 60)); await L.sleep(1200); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'graduates' },
  { eval: run(`const g = document.querySelector('.cg-grid'); const y0 = L.top(g, 120); await L.glide(y0, 1500); await L.glide(y0 + 900, 4000); await L.sleep(1000); return 1;`), timeout: 20 },
  { pause: true },
  { go: `${BASE}/college/g/${ANALYST}`, wait: 9000 },
  { eval: run(`await L.until(() => document.querySelector('.gp-hero h1') && document.querySelector('.gp-grid'), 30000); scrollTo(0, 0); await L.sleep(1000); return 1;`), timeout: 40 },
  { resume: true },
  { note: 'profile' },
  { eval: run(`await L.sleep(2000); await L.to('.gp-grid', 90, 2000); await L.sleep(3500); const j = document.querySelector('.gp-wide'); if (j) { await L.glide(L.top(j, 120), 2200); await L.sleep(3500); } return 1;`), timeout: 30 },

  // ══ 客户带着问题来：四个例子 ══
  { pause: true },
  { go: `${BASE}/college/cases`, wait: 8000 },
  { eval: run(`scrollTo(0, 0); await L.sleep(1200); return 1;`), timeout: 10 },
  { resume: true },
  { note: 'clients' },
  { hold: 4 },
  ...['overseas', 'workshop', 'startup', 'fund'].flatMap((id, i) => [
    { note: `case${i + 1}` },
    { eval: run(`const s = document.getElementById('${id}'); await L.glide(L.top(s, 40), 2000); await L.sleep(1200);
        [...s.querySelectorAll('.cs-tags span')].forEach((t, k) => setTimeout(() => { t.style.transition = 'all .4s'; t.style.background = '#b08d57'; t.style.color = '#fff'; }, 500 + k * 900));
        await L.glide(L.top(s.querySelector('.cs-team'), 220), 2200); await L.sleep(2600); return 1;`), timeout: 30 },
  ]),

  // ══ 供血、会自己长大、我们相信、收尾 ══
  { pause: true },
  { go: `${BASE}/college`, wait: 8000 },
  { eval: run(`await L.until(() => document.querySelector('.cu-supply'), 20000); scrollTo(0, L.top(document.querySelector('.cu-supply'), 300)); await L.sleep(1500); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'supply' },
  { eval: run(`await L.glide(L.top(document.querySelector('.cu-supply'), 160), 2000); await L.sleep(6000); return 1;`), timeout: 15 },
  { note: 'flywheel' },
  { eval: run(`await L.glide(L.top(document.querySelector('.cu-mosaic'), 140), 2600); await L.sleep(4000); await L.glide(L.top(document.querySelector('.cu-become'), 70), 3500); await L.sleep(3500); return 1;`), timeout: 25 },
  { note: 'beliefs' },
  { eval: run(`await L.glide(L.top(document.querySelector('.cu-beliefs'), 260), 3000); await L.sleep(7000); return 1;`), timeout: 20 },
  { pause: true },
  { eval: run(`scrollTo(0, 0); await L.sleep(1500); return 1;`), timeout: 10 },
  { resume: true },
  { note: 'end' },
  { hold: 10 },
];
