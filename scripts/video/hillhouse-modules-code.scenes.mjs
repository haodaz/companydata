/** 《给高瓴出一道真活》插段：别的操作模组长什么样（代码台 / 画布 / 参数草图 / 表格），每段几秒，插在 cand_tabs 之后。 */
import fs from 'node:fs';
const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const H = `(() => {
  if (window.__ck) return window.__ck;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(400); } return null; }
  const kill = () => document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
  const setVal = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  async function type(el, text, per = 40) { el.focus(); const base = el.value || ''; for (let i = 1; i <= text.length; i++) { setVal(el, base + text.slice(0, i)); await sleep(per); } }
  const btn = re => [...document.querySelectorAll('button')].find(b => re.test((b.textContent || '').trim()));
  async function start() { try { localStorage.setItem('work-tour-done', '1'); } catch {} const inp = await until(() => document.querySelector('input[placeholder="姓名 / 昵称"]'), 20000); setVal(inp, '林一诺'); await sleep(300); btn(/开始做/).click(); await until(() => document.querySelector('[data-tour="tabs"]'), 20000); const cl = [...document.querySelectorAll('button')].find(b => b.title === '关闭'); if (cl) cl.click(); await sleep(900); }
  return (window.__ck = { sleep, until, kill, setVal, type, btn, start });
})()`;
const run = body => `async () => { const L = ${H}; L.kill(); ${body} }`;
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  // 代码台：宁德时代 · 单体电压采样保护判定函数
  { pause: true }, { go: `${BASE}/work/rjob47BbXrM`, wait: 6000 }, { eval: run(`await L.start(); const t = L.btn(/^d\\d 代码/); if (t) t.click(); await L.sleep(800); return 1;`), timeout: 60 }, { resume: true },
  { note: 'mod_code' }, { eval: run(`const ta = document.querySelector('textarea'); if (ta) await L.type(ta, '\\n\\nfunction judge(mv, limitHi = 3650, limitLo = 2800) {\\n  if (mv > limitHi) return "over";\\n  if (mv < limitLo) return "under";\\n  return "ok";\\n}\\n', 22); await L.sleep(1500); return 1;`), timeout: 60 },
];
