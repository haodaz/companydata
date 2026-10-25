/**
 * 《给高瓴出一道真活》分镜（2026-10-25）：封面 → 填表出题（实拍生成）→ 聊着出题（实拍对话）→ 候选人答题（新界面 + 首次引导）→ 交卷评分 → 出题人看报告。
 * 源片录 2 倍清晰度（--dsf=2 --out=3200x1800），讲局部时剪辑里按 _zoom 裁出来放大。
 *   TOKEN_FILE=<登录 token> node scripts/video/drive.mjs out/hillhouse-demo scripts/video/hillhouse-demo.scenes.mjs --width=1600 --height=900 --dsf=2 --out=3200x1800
 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const CAND = process.env.CAND_TOKEN || '66DMSEE7k7s';   // 候选人答题用的题（AI 基础设施初筛）
const OWNER = process.env.OWNER_URL || '';                 // 看报告用的空间链接（带密钥）

const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  function glide(y, ms = 1800) { return new Promise(res => { const y0 = scrollY, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(t)); if (t < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
  function glideEl(el, y, ms = 1800) { return new Promise(res => { const y0 = el.scrollTop, t0 = performance.now(); const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; const step = now => { const t = Math.min(1, (now - t0) / ms); el.scrollTop = y0 + (y - y0) * ease(t); if (t < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
  const top = (el, off = 80) => el.getBoundingClientRect().top + scrollY - off;
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  const flash = async (el, ms = 900) => { if (!el) return; const o = el.style.boxShadow; el.style.transition = 'box-shadow .3s'; el.style.boxShadow = '0 0 0 3px #6055f5'; await sleep(ms); el.style.boxShadow = o; };
  // React 受控输入：用原生 setter 再派发 input 事件；逐字打出来像人在敲
  const setVal = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, per = 55) { el.focus(); const base = el.value || ''; for (let i = 1; i <= text.length; i++) { setVal(el, base + text.slice(0, i)); await sleep(per); } }
  const btn = re => [...document.querySelectorAll('button')].find(b => re.test((b.textContent || '').trim()));
  const byText = (sel, re) => [...document.querySelectorAll(sel)].find(e => re.test((e.textContent || '').trim()));
  const chatIdle = () => !document.querySelector('.wc-send.stop');
  async function say(text) { const ta = document.querySelector('.wc-composer textarea'); await type(ta, text, 45); await sleep(500); document.querySelector('.wc-send').click(); }
  return (window.__ck = { sleep, until, glide, glideEl, top, kill, flash, setVal, type, btn, byText, chatIdle, say });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
const cover = (line, sub) => `${BASE}/video/cover-work.html?line=${encodeURIComponent(line)}&sub=${encodeURIComponent(sub)}`;

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('给高瓴出一道|真活', '出题 · 答题 · 看报告'), wait: 2500 }, { resume: true },
  { note: 'cover' }, { hold: 7 },

  // ── 一、填表出题 ──
  { pause: true }, { go: `${BASE}/work/new`, wait: 6000 }, { eval: run(`await L.until(() => document.querySelector('h1'), 20000); scrollTo(0, 0); await L.sleep(600); return 1;`), timeout: 30 }, { resume: true },
  { note: 'form_open' }, { hold: 6 },
  { note: 'form_company' }, { eval: run(`
    const inputs = document.querySelectorAll('.ant-select input'); const co = inputs[0]; await L.type(co, '高瓴', 120); await L.sleep(1800);
    const opt = await L.until(() => [...document.querySelectorAll('.ant-select-item-option')].find(o => /高瓴资本/.test(o.textContent)), 8000); if (opt) { await L.flash(opt, 700); opt.click(); } await L.sleep(1800); return 1;`), timeout: 40 },
  { note: 'form_role' }, { eval: run(`
    const inputs = document.querySelectorAll('.ant-select input'); const role = inputs[1]; await L.type(role, '我要一个能看懂 AI 基础设施、来做早期投资的人', 70); await L.sleep(1200); document.body.click(); await L.sleep(800); return 1;`), timeout: 40 },
  { note: 'form_focus' }, { eval: run(`
    const cur = [...document.querySelectorAll('.ant-select-selection-item')].find(e => /通义千问|Claude|GPT/.test(e.textContent)); const selEl = cur && cur.closest('.ant-select'); const trg = selEl && (selEl.querySelector('.ant-select-selector') || selEl); if (trg) { await L.glide(L.top(trg, 260), 1000); trg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); const o = await L.until(() => [...document.querySelectorAll('.ant-select-item-option')].find(x => /Claude Sonnet/.test(x.textContent)), 6000); if (o) { o.click(); } else { document.body.click(); } await L.sleep(900); }
    const ta = document.querySelector('textarea'); if (ta) { await L.glide(L.top(ta, 260), 1200); await L.type(ta, '围绕最近看的 AI 芯片设计智能体这类项目；给 1–3 年经验的人做；90 分钟', 60); } await L.sleep(1200); return 1;`), timeout: 60 },
  { note: 'form_go' }, { eval: run(`const b = L.btn(/出题/); await L.glide(L.top(b, 420), 1200); await L.flash(b, 900); b.click(); await L.sleep(7000); return 1;`), timeout: 40 },
  { pause: true }, { eval: run(`await L.until(() => location.pathname.includes('/owner') || /\\/work\\/[A-Za-z0-9_-]+$/.test(location.pathname) === false && document.body.innerText.includes('参与链接'), 420000); await L.sleep(2500); scrollTo(0, 0); return 1;`), timeout: 440 }, { resume: true },
  { note: 'space_top' }, { hold: 7 },
  { note: 'space_body' }, { eval: run(`const h = L.byText('div,span,b', /^问题与任务$/) || L.byText('*', /业务问题/); if (h) await L.glide(L.top(h, 120), 2200); await L.sleep(7000); const r = L.byText('*', /^评分标准|rubric（/i); await L.glide(scrollY + 520, 2400); await L.sleep(5000); return 1;`), timeout: 40 },

  // ── 二、聊着出题 ──
  { pause: true }, { go: `${BASE}/work/new/chat`, wait: 6000 }, { eval: run(`await L.until(() => document.querySelector('.wc-hero'), 20000); await L.sleep(500); return 1;`), timeout: 30 }, { resume: true },
  { note: 'chat_open' }, { eval: run(`await L.flash(document.querySelector('.wc-mode'), 1200); await L.sleep(4000); return 1;`), timeout: 20 },
  { note: 'chat_1' }, { eval: run(`await L.say('我要给高瓴资本找一个能做医疗健康控股型并购投后的人，出一道题。'); await L.sleep(1500); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.until(() => L.chatIdle(), 180000); await L.sleep(800); return 1;`), timeout: 200 }, { resume: true },
  { note: 'chat_1r' }, { eval: run(`const all = document.querySelectorAll('.wc-thread > *'); const last = all[all.length - 1]; if (last) last.scrollIntoView({ block: 'end', behavior: 'smooth' }); await L.sleep(7000); return 1;`), timeout: 30 },
  { note: 'chat_2' }, { eval: run(`await L.say('这次不用给素材，用你们库里的材料出。'); await L.sleep(1200); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.until(() => L.chatIdle(), 180000); await L.sleep(800); return 1;`), timeout: 200 }, { resume: true },
  { note: 'chat_2r' }, { eval: run(`const all = document.querySelectorAll('.wc-thread > *'); const last = all[all.length - 1]; if (last) last.scrollIntoView({ block: 'end', behavior: 'smooth' }); await L.sleep(6000); return 1;`), timeout: 30 },
  { note: 'chat_3' }, { eval: run(`await L.say('没有以前的题，直接出吧。'); await L.sleep(1200); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.until(() => L.chatIdle(), 180000); await L.sleep(800); return 1;`), timeout: 200 }, { resume: true },
  { note: 'chat_3r' }, { eval: run(`const all = document.querySelectorAll('.wc-thread > *'); const last = all[all.length - 1]; if (last) last.scrollIntoView({ block: 'end', behavior: 'smooth' }); await L.sleep(6000); return 1;`), timeout: 30 },
  { note: 'chat_4' }, { eval: run(`await L.say('对，出吧。'); await L.sleep(4000); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.until(() => document.querySelector('.wc-art') && L.chatIdle(), 480000); await L.sleep(1500); return 1;`), timeout: 500 }, { resume: true },
  { note: 'chat_done' }, { eval: run(`const all = document.querySelectorAll('.wc-thread > *'); const last = all[all.length - 1]; if (last) last.scrollIntoView({ block: 'end', behavior: 'smooth' }); await L.sleep(5000); await L.flash(document.querySelector('.wc-art'), 1500); await L.sleep(5000); return 1;`), timeout: 40 },

  // ── 三、候选人答题（新界面 + 首次引导） ──
  { pause: true }, { go: `${BASE}/work/${CAND}`, wait: 6000 }, { eval: run(`await L.until(() => document.querySelector('input[placeholder="姓名 / 昵称"]'), 20000); try { localStorage.removeItem('work-tour-done'); } catch {} scrollTo(0, 0); await L.sleep(500); return 1;`), timeout: 30 }, { resume: true },
  { note: 'cand_open' }, { eval: run(`await L.sleep(5000); await L.glide(L.top(L.byText('*', /^怎么做$/) || document.body, 120), 1800); await L.sleep(5000); return 1;`), timeout: 30 },
  { note: 'cand_start' }, { eval: run(`const inp = document.querySelector('input[placeholder="姓名 / 昵称"]'); await L.glide(L.top(inp, 300), 1200); await L.type(inp, '林一诺', 120); await L.sleep(600); const b = L.btn(/开始做/); await L.flash(b, 700); b.click(); await L.until(() => document.querySelector('[data-tour="tabs"]'), 20000); await L.sleep(2500); return 1;`), timeout: 40 },
  { note: 'tour_1' }, { hold: 7 },
  { note: 'tour_2' }, { eval: run(`L.btn(/^下一步$/).click(); await L.sleep(7000); return 1;`), timeout: 20 },
  { note: 'tour_3' }, { eval: run(`L.btn(/^下一步$/).click(); await L.sleep(7000); return 1;`), timeout: 20 },
  { note: 'tour_4' }, { eval: run(`L.btn(/^下一步$/).click(); await L.sleep(6500); return 1;`), timeout: 20 },
  { note: 'tour_5' }, { eval: run(`L.btn(/^下一步$/).click(); await L.sleep(6000); L.btn(/^开始做题$/).click(); await L.sleep(1200); return 1;`), timeout: 20 },
  { note: 'cand_mat' }, { eval: run(`const m = [...document.querySelectorAll('[data-tour="materials"] div')].filter(e => /芯析智能 BP 摘要/.test(e.textContent) && e.textContent.length < 80).pop(); await L.flash(m, 800); m.click(); await L.sleep(4500); const mx = [...document.querySelectorAll('button')].find(b => /最大化/.test(b.title)); if (mx) { mx.click(); await L.sleep(5000); } const sp = [...document.querySelectorAll('button')].find(b => /^分屏/.test(b.title)); if (sp) { sp.click(); await L.sleep(1500); } return 1;`), timeout: 40 },
  { note: 'cand_tabs' }, { eval: run(`const cl = [...document.querySelectorAll('button')].find(b => b.title === '关闭'); if (cl) cl.click(); await L.sleep(800); await L.flash(document.querySelector('[data-tour="tabs"]'), 1200); const t2 = L.btn(/^d2 表格/); t2.click(); await L.sleep(3500); const t1 = L.btn(/^d1 文档/); t1.click(); await L.sleep(1500); return 1;`), timeout: 30 },
  { note: 'cand_write' }, { eval: run(`const ta = document.querySelector('textarea'); await L.type(ta, '\\n\\n## 结论\\n\\n**暂缓**。芯析智能的 ARR 口径把 PoC 一次性收入算进去了，按订阅口径年化只有 160 万；创始人要求本月签意向书，但 4 家客户里 2 家来自前同事，付费可持续性没有证据。\\n\\n## 价值链定位\\n\\n- 观复芯：设计工具层（验证智能体）\\n- 朗矽：器件封装层\\n- 源归：上游材料层\\n', 38); await L.sleep(1500); return 1;`), timeout: 90 },
  { note: 'cand_ai' }, { eval: run(`const q = document.querySelector('textarea.wk-ta'); await L.type(q, '帮我核一下：按订阅口径，芯析智能的 ARR 应该怎么算？', 50); await L.sleep(500); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await L.sleep(2500); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.until(() => document.querySelector('[data-tour="ai"] .wk-md'), 120000); await L.sleep(800); return 1;`), timeout: 140 }, { resume: true },
  { note: 'cand_ai_r' }, { eval: run(`await L.sleep(7000); const ad = L.btn(/放进当前交付物/); if (ad) { await L.flash(ad, 800); ad.click(); } await L.sleep(3000); return 1;`), timeout: 30 },
  { note: 'cand_sheet' }, { eval: run(`L.btn(/^d2 表格/).click(); await L.sleep(1200); const cells = () => document.querySelectorAll('table input'); const vals = ['优先级', '问题', '向谁要证据', '什么答案会改判', 'P0', '订阅收入与 PoC 分开后的 ARR？', '创始人 / 财务', '订阅 ARR 低于 150 万则不做', 'P0', '3 家试点客户的续约条款？', '客户', '无续约承诺则暂缓', 'P1', 'EDA 厂商接口政策变化？', 'EDA 合作方', '接口关闭则不做']; const cs = cells(); for (let i = 0; i < vals.length && i < cs.length; i++) { const c = cells()[i]; c.focus(); await L.type(c, vals[i], 28); await L.sleep(120); } await L.sleep(2500); return 1;`), timeout: 90 },
  { note: 'cand_submit' }, { eval: run(`L.btn(/^d1 文档/).click(); await L.sleep(800); const b = L.btn(/^交卷/); await L.flash(b, 900); b.click(); await L.sleep(2500); L.btn(/确认交卷/).click(); await L.sleep(4000); return 1;`), timeout: 30 },
  { pause: true }, { eval: run(`await L.until(() => !document.body.innerText.includes('评卷中') && (document.body.innerText.includes('总分') || document.body.innerText.includes('报告') ), 400000); await L.sleep(2000); scrollTo(0, 0); return 1;`), timeout: 420 }, { resume: true },
  { note: 'cand_report' }, { eval: run(`await L.sleep(6000); await L.glide(560, 2400); await L.sleep(6000); return 1;`), timeout: 30 },

  // ── 四、出题人看报告 ──
  { pause: true }, { go: OWNER, wait: 7000 }, { eval: run(`await L.until(() => document.body.innerText.includes('做题情况'), 30000); await L.sleep(500); return 1;`), timeout: 40 }, { resume: true },
  { note: 'owner_tab' }, { eval: run(`const t = [...document.querySelectorAll('.ant-tabs-tab')].find(x => /做题情况/.test(x.textContent)); await L.glide(L.top(t, 120), 1600); t.click(); await L.sleep(4000); return 1;`), timeout: 30 },
  { note: 'owner_report' }, { eval: run(`const b = L.btn(/^看报告$/); await L.flash(b, 800); b.click(); await L.sleep(4000); const dr = document.querySelector('.ant-drawer-body'); if (dr) { await L.glideEl(dr, 700, 2600); await L.sleep(4000); await L.glideEl(dr, 1700, 3000); await L.sleep(4000); } return 1;`), timeout: 40 },

  { pause: true }, { go: cover('题是真的，|活也是真的', '百业AI｜真活 · 平方智能'), wait: 2500 }, { resume: true },
  { note: 'end' }, { hold: 7 },
];
