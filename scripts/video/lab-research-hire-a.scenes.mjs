/**
 * 片二 · 上半：陈老师在科研版工作台说一句话，AI 从课题组自己卡着的问题里出一道研究真活。
 *   CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/lab-research-hire-a.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080
 * 要登录（.preview-token）。出题 / AI 基线真跑要几分钟：pause 掉，成片里直接跳过。录完日志里会打出新真活的参与链接（下半段苏晴用它做题）。
 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync('.preview-token', 'utf8').trim();

const H = `(() => {
  if (window.__wk) return window.__wk;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const btn = t => [...document.querySelectorAll('button, a')].filter(vis).find(b => (b.innerText || '').trim().includes(t));
  const click = async (el, wait = 700) => { if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(350); el.click(); await sleep(wait); return true; };
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  const setv = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, cps = 16) { el.focus(); let cur = el.value || ''; for (const ch of text) { cur += ch; setv(el, cur); await sleep(1000 / cps); } }
  // 还在等 AI 回答的追问选项（没答过、能点的）
  const asks = () => [...document.querySelectorAll('.ws-opt')].filter(b => vis(b) && !b.disabled);
  const problems = () => [...document.querySelectorAll('.ws-problem')].filter(b => vis(b) && !b.disabled);
  const busy = () => !!document.querySelector('.ws-send.stop');
  // 录屏里不出现真实账号：左下角邮箱换成角色名
  const mask = () => { for (const el of document.querySelectorAll('aside *')) if (el.children.length === 0 && /@/.test(el.textContent || '')) el.textContent = '陈老师 · 课题组长'; };
  return (window.__wk = { sleep, vis, btn, click, until, setv, type, asks, problems, busy, mask });
})()`;
const run = body => `async () => { const L = ${H}; ${body} }`;
const MASK = { eval: run(`L.mask(); setInterval(L.mask, 500); return 'masked';`) };

const ASK = '组里要招一位界面表征方向的博士后。简历都很漂亮，可我真正想知道的是：他接到我们组眼下真卡着的那个问题，会怎么想。帮我出一道研究真活。';

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true },
  { go: `${BASE}/research`, wait: 8000 },
  MASK,
  { resume: true },
  { note: 'ws_home' },
  { hold: 3 },
  { eval: run(`const ta = await L.until(() => document.querySelector('.ws-composer textarea')); await L.type(ta, ${JSON.stringify(ASK)}, 14); await L.sleep(700); await L.click(document.querySelector('.ws-send'), 1500); return 'sent';`), timeout: 60 },
  { note: 'ws_thinking' },
  { hold: 6 },
  // AI 去读课题组档案、找问题：等它给出候选的研究问题（或追问）
  { pause: true },
  { eval: run(`await L.until(() => L.problems().length || (!L.busy() && L.asks().length), 300000); return { problems: L.problems().length, asks: L.asks().map(b => b.innerText.slice(0, 30)) };`), timeout: 320 },
  { resume: true },
  { note: 'ws_problems' },
  { eval: run(`const ps = L.problems(); if (ps[0]) { ps[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); } await L.sleep(5500); return ps.length;`), timeout: 20 },
  { eval: run(`
      const ps = L.problems();
      const p = ps.find(b => /界面|阻抗/.test(b.innerText)) || ps[0];
      if (p) { p.style.outline = '3px solid #6a5cff'; await L.sleep(900); await L.click(p, 1500); return 'pick ' + p.innerText.slice(0, 40); }
      const a = L.asks(); const o = a.find(b => /界面|阻抗|出题|好|是/.test(b.innerText)) || a[0]; if (o) await L.click(o, 1500); return 'ask ' + (o ? o.innerText.slice(0, 30) : 'none');`), timeout: 30 },
  { hold: 3 },
  // 出题 + AI 基线：几分钟，不录；中途要是又追问（不是「发不发」），先挑第一个合理选项
  { pause: true },
  { eval: run(`
      const log = [];
      for (let k = 0; k < 12; k++) {
        await L.until(() => !L.busy() && (L.asks().length || L.problems().length), 600000);
        const a = L.asks();
        if (a.some(b => /现在发|发给/.test(b.innerText))) return log.concat('ready to send');
        const ps = L.problems(); const p = ps.find(b => /界面|阻抗/.test(b.innerText)) || ps[0];
        const o = p || a.find(b => /界面|阻抗|出题|好|是|先|直接/.test(b.innerText)) || a[0];
        if (!o) break; log.push(o.innerText.slice(0, 24)); o.click(); await L.sleep(3000);
      }
      return log;`), timeout: 2400 },
  { resume: true },
  { note: 'ws_task' },
  { hold: 2 },
  { eval: run(`const art = document.querySelector('.ws-art'); if (!art) { const chip = [...document.querySelectorAll('.ws-artchip')].pop(); if (chip) await L.click(chip, 2000); } return !!document.querySelector('.ws-art');`), timeout: 20 },
  { hold: 5 },
  { eval: run(`const tab = t => [...document.querySelectorAll('.ws-art .ant-tabs-tab')].find(x => x.innerText.includes(t)); for (const t of ['材料包', 'rubric']) { const x = tab(t); if (x) { x.click(); await L.sleep(4200); } } return 'tabs';`), timeout: 30 },
  { note: 'ws_baseline' },
  { eval: run(`const x = [...document.querySelectorAll('.ws-art .ant-tabs-tab')].find(x => x.innerText.includes('AI 基线')); if (x) { x.click(); await L.sleep(4500); } const y = [...document.querySelectorAll('.ws-art .ant-tabs-tab')].find(x => x.innerText.includes('问题与任务')); if (y) y.click(); await L.sleep(1200); return 'baseline';`), timeout: 20 },
  { note: 'ws_send' },
  { eval: run(`const o = L.asks().find(b => /现在发/.test(b.innerText)) || L.asks().find(b => /发/.test(b.innerText)); if (o) { o.style.outline = '3px solid #6a5cff'; await L.sleep(800); await L.click(o, 1500); } return o ? o.innerText : 'no send option';`), timeout: 20 },
  { pause: true },
  { eval: run(`await L.until(() => !L.busy(), 180000); await L.sleep(1500); return 'done';`), timeout: 200 },
  { resume: true },
  { hold: 5 },
  { eval: run(`const m = document.body.innerText.match(/\\/work\\/([A-Za-z0-9_-]{8,})/g) || []; return [...new Set(m)].join(' ');`), timeout: 10 },
  { note: 'ws_end' },
  { hold: 2 },
];
