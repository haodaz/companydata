/**
 * 教学短片（二）：候选人怎么做题、出题人在哪看评分——武岳峰示范题 /work/gsUIddK2zNw。
 *   打开链接看任务书 → 填名字开始 → 翻材料、问 AI、写交付文档 → 交卷 → 报告 → 出题人「做题情况与评分」
 *   CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/wyf-take.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 会建一条示范答卷（「示范 · 小林」），录完按日志里的编号删掉。评分要几分钟：pause 掉。
 */
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const T = 'gsUIddK2zNw', OWNER = 'CEQg_9UM6znMfU07';
const ASK = 'PPU 概率处理单元和 GPU 做 AI 推理，差别在哪？它算不算新的计算范式？';
const ANSWER = `## AI技术坐标系校准简报

### 一、三家在 AI 技术树上的位置
- 量巡科技（PPU 概率处理单元）：属于「AI 算力硬件」分支，不是新的模型范式。它押的是概率计算这条非主流路线，价值在于推理能效；能否成立取决于真实负载上的能效比数据，BP 里没有给出，标注为待验证。
- 日冕开物（具身智能世界模型）：处在「世界模型 + 具身」这条正在分叉的主干上，是三家里最接近范式级的一家；风险是数据与仿真到真实的迁移，目前只有白皮书叙述。
- 智子芯元（AI for Computing）：用 AI 做编译与算子自动优化，属于「AI 赋能基础软件」分支，确定性最高、天花板取决于国产算力生态。

### 二、与已投项目的协同
- 智子芯元 × 黑芝麻智能：自动化加速可直接服务车规芯片的算子适配，协同最实。
- 日冕开物 × 凯乐士：世界模型可用于物流场景仿真，属于中期协同。
- 量巡科技与现有组合协同弱，更像一笔独立的硬件期权。

### 三、结论与假设
1. 若只能押一家做长期托举：日冕开物（范式位置最靠主干）。
2. 若看先导区专项获批可能：智子芯元（国产算力自主可控叙事最清楚）。
3. 量巡科技需要补一份真实推理负载的能效测试，再决定是否加注。
假设：PPU 能效优势未经第三方测试；日冕开物的仿真到真实迁移效果未披露。以上均已在文中标注。`;

const H = `(() => {
  if (window.__tk) return window.__tk;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  const btn = t => [...document.querySelectorAll('button, a, [role=tab], .ant-tabs-tab')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const setv = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, cps = 18) { el.focus(); let cur = el.value || ''; for (const ch of text) { cur += ch; setv(el, cur); await sleep(1000 / cps); } }
  // 长文：一次敲一小段，看得见在写
  async function typeFast(el, text, chunk = 6, ms = 40) { el.focus(); let cur = ''; for (let i = 0; i < text.length; i += chunk) { cur += text.slice(i, i + chunk); setv(el, cur); el.scrollTop = el.scrollHeight; await sleep(ms); } }
  async function scrollBy(px, steps = 30, ms = 40) { const y0 = scrollY; for (let i = 1; i <= steps; i++) { scrollTo(0, y0 + px * i / steps); await sleep(ms); } }
  const hl = el => { if (el) { el.style.transition = 'box-shadow .3s'; el.style.boxShadow = '0 0 0 3px #f5a623'; } };
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  return (window.__tk = { sleep, vis, until, btn, setv, type, typeFast, scrollBy, hl, kill });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;

export default [
  // ── 候选人打开链接：任务书 ──
  { pause: true },
  { go: `${BASE}/work/${T}`, wait: 3000 },
  { eval: `() => { try { localStorage.removeItem('work:${T}'); } catch {} return 1; }` },
  { go: `${BASE}/work/${T}`, wait: 8000 },
  { eval: run(`await L.until(() => document.body.innerText.includes('任务书'), 20000); scrollTo(0, 0); await L.sleep(800); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'brief' },
  { eval: run(`await L.sleep(3000); await L.scrollBy(520, 40, 45); await L.sleep(3500); await L.scrollBy(600, 40, 45); await L.sleep(2500);
      const n = document.querySelector('input[placeholder="姓名 / 昵称"]'); n.scrollIntoView({ block: 'center', behavior: 'smooth' }); await L.sleep(900); await L.type(n, '示范 · 小林', 6); await L.sleep(700);
      const b = L.btn('开始做'); L.hl(b); await L.sleep(800); b.click(); await L.sleep(3500); return localStorage.getItem('work:${T}');`), timeout: 60 },
  // ── 做题界面：材料 / 交付文档 / AI 助手 ──
  { note: 'bench' },
  { eval: run(`await L.sleep(2500); const items = [...document.querySelectorAll('aside > div')].filter(d => /m\\d ·/.test(d.innerText)); for (const m of items.slice(0, 3)) { m.click(); await L.sleep(2400); } return items.length;`), timeout: 40 },
  { note: 'ask' },
  { eval: run(`const q = document.querySelector('textarea[placeholder^="问 AI"]'); await L.type(q, ${JSON.stringify(ASK)}, 16); await L.sleep(500); L.btn('问').click(); return 'asked';`), timeout: 40 },
  { pause: true },
  { eval: run(`await L.until(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('放进交付物')), 120000); await L.sleep(1000); return 'answered';`), timeout: 130 },
  { resume: true },
  { hold: 5 },
  { note: 'write' },
  { eval: run(`const ta = [...document.querySelectorAll('main textarea, textarea')].filter(L.vis).find(t => !/问 AI/.test(t.placeholder || '')); await L.typeFast(ta, ${JSON.stringify(ANSWER)}, 7, 35); await L.sleep(2500); return ta.value.length;`), timeout: 120 },
  { note: 'submit' },
  { eval: run(`const b = L.btn('交卷'); L.hl(b); await L.sleep(900); b.click(); await L.sleep(1500); const c = await L.until(() => L.btn('确认交卷'), 5000); if (c) { L.hl(c); await L.sleep(900); c.click(); } await L.sleep(2500); return 'submitted';`), timeout: 30 },
  // 评分：几分钟，不录
  { pause: true },
  { eval: run(`await L.until(() => document.body.innerText.includes('真活台 · 报告'), 480000); await L.sleep(2000); scrollTo(0, 0); return 'report';`), timeout: 500 },
  { resume: true },
  // ── 候选人的报告 ──
  { note: 'report' },
  { eval: run(`await L.sleep(4000); await L.scrollBy(650, 40, 50); await L.sleep(3500); await L.scrollBy(800, 40, 50); await L.sleep(3500); return 1;`), timeout: 40 },
  // ── 出题人：做题情况与评分 ──
  { pause: true },
  { go: `${BASE}/work/${T}/owner?k=${OWNER}`, wait: 9000 },
  { eval: run(`await L.until(() => L.btn('做题情况与评分'), 20000); scrollTo(0, 0); await L.sleep(800); return 1;`), timeout: 30 },
  { resume: true },
  { note: 'owner' },
  { eval: run(`await L.sleep(2000); const t = L.btn('做题情况与评分'); L.hl(t); await L.sleep(1000); t.click(); await L.sleep(1500); t.scrollIntoView({ block: 'start', behavior: 'smooth' }); await L.sleep(3500);
      const row = [...document.querySelectorAll('tr, .ant-collapse-header, a, button')].filter(L.vis).find(r => /示范 · 小林/.test(r.innerText) && r.innerText.length < 400); if (row) { L.hl(row); await L.sleep(1000); row.click(); await L.sleep(3500); }
      await L.scrollBy(500, 30, 45); await L.sleep(3500); return !!row;`), timeout: 50 },
];
