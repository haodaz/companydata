/**
 * 分镜：开腹医师的一天（体验全程 + 证书）。
 *   node scripts/video/drive.mjs work/video/raw scripts/video/lab-surgeon.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 需要本地 dev（3003，LAB_PUBLIC=1）。访客编号用示范的 v:showcase（好大壮），这样最后「我的」里就是他的证书夹。
 * note 是后期切片用的时间点（build.py 按它切、按段加速）。
 */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const SPACE = '681b5f1c-5115-4c32-82ea-69c085b21868';

// 页面里用的小工具：按文字找按钮 / 选项格子、点对话、拖滑块、慢慢打字、点「下一步」
export const H = `(() => {
  if (window.__lab) return window.__lab;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const byText = (sel, t) => [...document.querySelectorAll(sel)].filter(vis).find(e => (e.innerText || '').trim().includes(t));
  const click = async (el, wait = 700) => { if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(380); el.click(); await sleep(wait); return true; };
  const btn = t => [...document.querySelectorAll('button')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  // 等某个东西出现（页面还在加载 / 动画中），最多 ms 毫秒
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(300); } return null; }
  const root = () => document.querySelector('.lab-game-modal') || document.querySelector('.lab-stage-body');
  async function dialogue() { for (let i = 0; i < 4; i++) { const d = document.querySelector('.lab-game-dialogue'); if (!vis(d)) return; d.click(); await sleep(1100); } }
  const tileFor = label => [...root().querySelectorAll('div')].filter(vis).filter(d => getComputedStyle(d).cursor === 'pointer').find(d => (d.innerText || '').includes(label));
  const setRange = (input, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, String(v)); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
  async function type(el, text, cps = 26) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; let cur = ''; for (const ch of text) { cur += ch; set.call(el, cur); el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(1000 / cps); } }
  async function nextBtn() {
    for (const t of ['确认操作', '下一步', '操作完毕']) {
      const b = btn(t);
      if (b && !b.disabled) { await click(b, 1300); if (t === '确认操作') { await sleep(1400); const n = btn('下一步') || btn('操作完毕'); if (n) await click(n, 1300); } return t; }
    }
    return null;
  }
  async function answer(step, v) {
    await dialogue(); await sleep(700);
    if (step.type === 'choose') { const o = step.options.find(o => o.id === v); await click(tileFor(o.label), 1000); }
    else if (step.type === 'multi') { for (const id of v) { const o = step.options.find(o => o.id === id); await click(tileFor(o.label), 650); } }
    else if (step.type === 'classify') {
      for (const o of step.options) {
        const row = [...root().querySelectorAll('div')].filter(vis).find(d => d.children.length === 2 && (d.innerText || '').trim().startsWith(o.label));
        const lab = step.labels.find(l => l.id === v[o.id]);
        const sp = row && [...row.querySelectorAll('span')].find(s => s.innerText.trim() === lab.label);
        await click(sp, 550);
      }
    }
    else if (step.type === 'allocate') { const ins = [...root().querySelectorAll('input[type=range]')]; step.options.forEach((o, i) => setRange(ins[i], v[o.id] || 0)); await sleep(1300); }
    else if (step.type === 'slider') { setRange(root().querySelector('input[type=range]'), v); await sleep(900); }
    else if (step.type === 'text') { const ta = root().querySelector('textarea'); ta.scrollIntoView({ block: 'center' }); await type(ta, v); await sleep(700); }
    return await nextBtn();
  }
  return (window.__lab = { sleep, byText, click, btn, dialogue, answer, nextBtn, root, until });
})()`;
export const run = body => `async () => { const L = ${H}; ${body} }`;

const SBAR = 'S：周教授，王建国术后第 3 天，07:30 体温 38.6℃、心率 108，引流从 120 增到 260 ml，浑浊有异味，担心吻合口漏。B：右半结肠切除术后第 3 天。A：血压 116/70，右下腹局限压痛，切口干燥。已禁食补液，开了血常规、降钙素原、引流液培养和腹部增强 CT。R：请您来床旁看一下，定抗生素和要不要进一步控源。';

export default [
  // ── 一、体验馆：不止一个职业 ──
  { go: `${BASE}/lab/gallery`, wait: 6000 },
  { local: { 'lab:visitor': 'v:showcase', 'lab:rookie': { name: '好大壮', note: '协和医学院 · 临床医学', location: '北京' }, 'lab:rookie:asked': '1' }, wait: 7000 },
  { note: 'gallery' },
  { hold: 2 },
  { scroll: 1900, over: 7 },
  { hold: 1 },
  { scroll: 0, over: 2 },
  { eval: run(`const card = await L.until(() => [...document.querySelectorAll('.gal-card')].find(c => c.innerText.includes('开腹医师'))); if (!card) throw new Error('没找到开腹医师卡片'); card.scrollIntoView({ block: 'center', behavior: 'smooth' }); await L.sleep(1400); card.style.outline = '3px solid #6a5cff'; await L.sleep(900); card.click(); return 'open';`) },
  { pause: true }, { hold: 6 }, { resume: true },

  // ── 职业主页：这位数字职人是谁、学自谁、多少人考过 ──
  { note: 'hub' },
  { hold: 7 },
  { eval: run(`const p = await L.until(() => [...document.querySelectorAll('.hub-portal')].find(x => x.innerText.includes('考考你'))); if (!p) throw new Error('没找到考考你入口'); p.style.outline = '3px solid #fff'; await L.sleep(800); p.click(); return 'test';`) },
  { pause: true }, { hold: 5 }, { resume: true },

  // ── 二、一天页 ──
  { note: 'day' },
  { hold: 3 },
  { scroll: 900, over: 4 },
  { hold: 2 },
  { scroll: 0, over: 2 },
  { hold: 1 },

  // ── 三、07:30 晨查：细走一遍 ──
  { note: 'ch1_intro' },
  { eval: run(`const b = await L.until(() => L.btn('进入操作台')); if (!b) throw new Error('没进到一天页'); await L.click(b, 2500); return 'stage';`) },
  { hold: 4 },
  { eval: run(`await L.click(await L.until(() => L.btn('开始这一段')), 1800); return 'start';`) },
  { note: 'ch1_steps' },
  { eval: run(`
      let sp = null; for (let i = 0; i < 5 && !sp; i++) { try { sp = await fetch('/api/lab/spaces/${SPACE}').then(r => r.json()); } catch { await L.sleep(1500); } }
      const ch = sp.space.chapters.find(c => c.slot === '07:30');
      const tr = ch.expert_trace; const out = [];
      for (const st of ch.sim.steps) {
        if (st.type === 'text') { window.__textStep = st; break; }
        out.push(st.id + ':' + await L.answer(st, tr[st.id]));
        await L.sleep(500);
      }
      return out;`), timeout: 240 },
  { note: 'ch1_text' },
  { eval: run(`const st = window.__textStep; if (!st) throw new Error('没走到写一段那步'); await L.answer(st, ${JSON.stringify(SBAR)}); return 'submitted';`), timeout: 120 },
  // 评分要几十秒：不录，成片里直接跳到成绩
  { pause: true },
  { waitFor: 'COMPETENCY REPORT', timeout: 240 },
  { hold: 1.5 },
  { resume: true },
  { note: 'ch1_report' },
  { hold: 4 },
  { eval: run(`const m = document.querySelector('.lab-game-modal'); if (m) { for (let i = 0; i < 40; i++) { m.scrollTop += 18; await L.sleep(60); } } await L.sleep(1500); if (m) m.scrollTop = 0; return 'scrolled';`) },
  { hold: 1.5 },

  // ── 四、这一天的其他几段：快速 ──
  { note: 'ch2_intro' },
  { eval: run(`await L.click(await L.until(() => L.btn('进入下一段')), 2500); return 'next';`) },
  { hold: 3.5 },
  { eval: run(`await L.click(L.btn('退出操作台'), 1500); return 'exit';`) },
  { hold: 1 },
  // 我教你：NOVA-07 自己操作开腹工位
  { note: 'bench' },
  { eval: run(`await L.click([...document.querySelectorAll('.dayv-side button')].find(b => b.innerText.trim() === '我教你'), 1800); await L.click([...document.querySelectorAll('.dayv-tl button')].find(b => b.innerText.includes('09:10')), 1800); await L.click(L.btn('走一遍'), 2500); await L.click(L.btn('走这一段'), 1800); return 'demo';`) },
  { eval: run(`
      // 示范模式：每步已经填好老师傅的选择，点过对话、点下一步；到工位那步等它自己走完
      for (let i = 0; i < 12; i++) {
        await L.dialogue(); await L.sleep(500);
        const hasBench = !!document.querySelector('.bench-hud, .bench-split');
        if (hasBench) {
          for (let k = 0; k < 160; k++) { const b = L.btn('下一步'); if (b && !b.disabled) break; await L.sleep(500); }
          return 'bench done';
        }
        const r = await L.nextBtn(); if (!r) return 'stuck at ' + i;
        await L.sleep(400);
      }
      return 'no bench';`), timeout: 180 },
  { note: 'bench_done' },
  { hold: 2 },
  { eval: run(`await L.click(L.btn('退出操作台'), 1500); await L.click([...document.querySelectorAll('.dayv-side button')].find(b => b.innerText.trim() === '考考你'), 1500); return 'back';`) },
  { note: 'day_tour' },
  { eval: run(`for (const t of ['14:00', '16:00', '17:30']) { await L.click([...document.querySelectorAll('.dayv-tl button')].find(b => b.innerText.includes(t)), 600); window.scrollTo({ top: 0 }); await L.sleep(3200); } return 'tour';`), timeout: 60 },

  // ── 五、证书 ──
  { note: 'me' },
  { go: `${BASE}/lab/me`, wait: 7000 },
  { hold: 3 },
  { eval: run(`await L.click(await L.until(() => L.btn('打开证书')), 800); return 'folder';`) },
  { pause: true },
  { waitFor: '点击打开', timeout: 90 },
  { hold: 1 },
  { resume: true },
  { note: 'cover' },
  { hold: 3 },
  { eval: run(`document.querySelector('.cover').click(); await L.sleep(1600); return 'opened';`) },
  { note: 'cert' },
  { hold: 6 },
  { eval: run(`await L.click(L.btn('翻页'), 1400); return 'flip';`) },
  { note: 'scores' },
  { hold: 4 },
  { eval: run(`await L.click([...document.querySelectorAll('.folio-tabs button')].find(b => b.innerText.trim() === '全天'), 600); return 'day';`) },
  { note: 'dayscore' },
  { hold: 5 },
  { eval: run(`await L.click([...document.querySelectorAll('.folio-tabs button')].find(b => b.innerText.trim() === '证书'), 600); return 'cert';`) },
  { note: 'end' },
  { hold: 3 },
];
