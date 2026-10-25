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
  // 画布：低空经济产业链图
  { pause: true }, { go: `${BASE}/work/hG7dap57nB4`, wait: 6000 }, { eval: run(`await L.start(); const t = L.btn(/^d\\d 画布/); if (t) t.click(); await L.sleep(800); return 1;`), timeout: 60 }, { resume: true },
  { note: 'mod_canvas' }, { eval: run(`const texts = ['上游：芯片 / 传感器 / 电池', '中游：机载系统（庆为航空）', '整机：eVTOL / 通航', '下游：运营 / 空管服务']; for (const t of texts) { L.btn(/＋ 节点/).click(); await L.sleep(250); const inp = document.querySelector('svg foreignObject input'); if (inp) { await L.type(inp, t, 30); inp.blur(); } await L.sleep(300); }
    const ns = () => [...document.querySelectorAll('svg g[style*="grab"]')]; const click = async (g) => { g.dispatchEvent(new MouseEvent('click', { bubbles: true })); await L.sleep(200); };
    for (let i = 0; i < 3; i++) { await click(ns()[i]); L.btn(/连线/).click(); await L.sleep(200); await click(ns()[i + 1]); }
    await L.sleep(2500); return 1;`), timeout: 90 },
  // 参数草图：宁德时代 · 电池包吊梁设计
  { pause: true }, { go: `${BASE}/work/2ebPYYMKopQ`, wait: 6000 }, { eval: run(`await L.start(); const t = L.btn(/^d\\d 参数/); if (t) t.click(); await L.sleep(800); return 1;`), timeout: 60 }, { resume: true },
  { note: 'mod_design' }, { eval: run(`const ins = [...document.querySelectorAll('input')].filter(i => !i.placeholder.includes('姓名')); const vals = ['1200', '80', '12', '2.5', 'Q355B', '2']; for (let i = 0; i < Math.min(vals.length, ins.length); i++) { await L.type(ins[i], vals[i], 60); await L.sleep(200); } await L.sleep(2500); return 1;`), timeout: 60 },
  // 表格：LP 口径核对表
  { pause: true }, { go: `${BASE}/work/TpAh8i2f02Q`, wait: 6000 }, { eval: run(`await L.start(); const t = L.btn(/^d\\d 表格/); if (t) t.click(); await L.sleep(800); return 1;`), timeout: 60 }, { resume: true },
  { note: 'mod_sheet' }, { eval: run(`const vals = ['指标', '来源 A', '来源 B', '建议对外口径', '新一期基金目标规模', '最高 80 亿美元', '约 70 亿美元', '以募集文件为准', '2026 年投资家数', '112 家（创投）', '34 家（高瓴资本）', '口径不同，待确认']; for (let i = 0; i < vals.length; i++) { const c = document.querySelectorAll('table input')[i]; if (!c) break; c.focus(); await L.type(c, vals[i], 24); await L.sleep(80); } await L.sleep(2500); return 1;`), timeout: 90 },
];
