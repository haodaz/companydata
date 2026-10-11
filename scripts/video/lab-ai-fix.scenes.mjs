/**
 * 《平方智能》补录：要登录的页（工作室 / 素材库）、「选一份 JD → 构建」的真实 loading、数据分析师接别家公司的问题。
 * 段名与 lab-ai.scenes.mjs 一致，录完用 splice.py 按段名换进去：
 *   npx tsx scripts/.mint-token.mts <token 文件>
 *   LAB_TOKEN_FILE=<token 文件> CHROME_GPU=1 node scripts/video/drive.mjs <输出目录> scripts/video/lab-ai-fix.scenes.mjs --width=1600 --height=900 --dsf=1.2 --out=1920x1080 --fps=15
 */
import fs from 'fs';
import { run } from './lab-surgeon.scenes.mjs';

const BASE = process.env.LAB_BASE || 'http://localhost:3003';
const TOKEN = fs.readFileSync(process.env.LAB_TOKEN_FILE, 'utf8').trim();
const OR = '681b5f1c-5115-4c32-82ea-69c085b21868';
const NURSE = 'c9783880-561f-49fe-95ad-2a7b2de68d01';
const DESK = 'a35a662d-2be8-4cc1-a255-4c3f8ad29139';

const SCROLL = (px, secs) => run(`const y0 = window.scrollY, n = Math.round(${secs} * 20); for (let i = 0; i <= n; i++) { window.scrollTo(0, y0 + ${px} * i / n); await L.sleep(50); } return 'scrolled';`);
// 像人一样一个字一个字往受控输入框里打（React 要走原生 setter + input 事件）
const TYPER = `const typeIn = async (el, v, ms = 45) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const set = Object.getOwnPropertyDescriptor(proto, 'value').set; el.focus(); for (let i = 1; i <= v.length; i++) { set.call(el, v.slice(0, i)); el.dispatchEvent(new Event('input', { bubbles: true })); await L.sleep(ms); } };`;

// 空间列表 → 新岗位 · 从一份 JD 建 → 搜「数据分析」→ 点 费曼动力 的「构建空间」
const PICK_JD = run(`${TYPER}
  const nb = await L.until(() => L.btn('从一份 JD 建'), 15000); if (!nb) throw new Error('没有新岗位按钮');
  await L.sleep(1200); nb.style.outline = '3px solid #fff'; await L.sleep(600); nb.click();
  const inp = await L.until(() => document.querySelector('input[placeholder^="搜企业或岗位名"]'), 15000); if (!inp) throw new Error('没有搜索框');
  await L.sleep(1500); await typeIn(inp, '数据分析', 120);
  const card = await L.until(() => [...document.querySelectorAll('.lab-glass.hover')].find(x => x.innerText.includes('费曼动力') && x.innerText.includes('构建空间')), 20000); if (!card) throw new Error('没搜到费曼动力');
  await L.sleep(1800); card.style.outline = '3px solid #6a5cff'; await L.sleep(800);
  card.querySelector('button').click(); await L.sleep(500); return 'building';`);
// 等构建走到某个阶段（当前阶段行以 ▸ 开头）；构建页没了（失败或完成）也退出
const WAIT_PHASE = (t) => run(`
  await L.until(() => !document.body.innerText.includes('BUILDING SKILL SPACE') || [...document.querySelectorAll('.lab-mono')].some(x => x.innerText.trim().startsWith('▸') && x.innerText.includes(${JSON.stringify(t)})), 400000);
  return 'phase ' + ${JSON.stringify(t)};`);
const WAIT_DONE = run(`await L.until(() => L.btn('进入空间') || !document.body.innerText.includes('BUILDING SKILL SPACE'), 400000); await L.sleep(800); return L.btn('进入空间') ? 'done' : 'gone';`);

// 数据分析师：以一家连锁便利店运营经理的身份把问题交给他
const ASK = run(`${TYPER}
  const ins = await L.until(() => { const a = [...document.querySelectorAll('input.lab-input')]; return a.length >= 2 ? a : null; }, 15000); if (!ins) throw new Error('没有问题表单');
  await L.sleep(1200);
  await typeIn(ins[0], '某连锁便利店 · 门店运营经理', 70);
  await typeIn(ins[1], '杭州', 120);
  const ta = document.querySelector('textarea.lab-input');
  await typeIn(ta, '我们几百家门店的日销数据都有，但周报只会看总额涨跌。想把数据拆开，找出是哪些门店、哪些品类在拖后腿。该先看什么指标、怎么拆、怎么排优先级？', 38);
  await L.sleep(900); const b = L.btn('交给 AI 核心'); if (!b || b.disabled) throw new Error('按钮不可用'); b.style.outline = '3px solid #6a5cff'; await L.sleep(600); b.click(); await L.sleep(400); return 'asked';`);
const WAIT_ANSWER = run(`await L.until(() => !L.btn('解决中') && [...document.querySelectorAll('.lab-glass')].some(x => x.innerText.includes('问：') && x.innerText.includes('便利店')), 250000); await L.sleep(600); return 'answered';`);
// 答案在右栏打字机式出来：缓缓跟着往下看
const READ = (secs) => run(`const n = Math.round(${secs} * 10); for (let i = 0; i <= n; i++) { const card = [...document.querySelectorAll('.lab-glass')].find(x => x.innerText.includes('问：') && x.innerText.includes('便利店')); if (card) { const r = card.getBoundingClientRect(); if (r.bottom > window.innerHeight - 80) window.scrollBy(0, 6); } await L.sleep(100); } return 'read';`);

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  // a1_spaces：选一份 JD，看它被构建出来
  { go: `${BASE}/lab/spaces`, wait: 7000 }, { note: 'a1_spaces' }, { hold: 2 },
  { eval: PICK_JD, timeout: 90 }, { hold: 9 },
  { pause: true }, { eval: WAIT_PHASE('推断技能集'), timeout: 420 }, { resume: true }, { hold: 5 },
  { pause: true }, { eval: WAIT_PHASE('生成场景与立绘'), timeout: 420 }, { resume: true }, { hold: 5 },
  { pause: true }, { eval: WAIT_DONE, timeout: 420 }, { resume: true }, { hold: 7 },
  // a1_studio：数字职人长出来了（工作室）
  { go: `${BASE}/lab/studio/${NURSE}`, wait: 7000 }, { note: 'a1_studio' }, { eval: SCROLL(500, 8), timeout: 25 },
  // a1_solve：另一家公司的人来问数据分析师
  { go: `${BASE}/lab/${DESK}?m=solve`, wait: 6000 }, { note: 'a1_solve' }, { eval: ASK, timeout: 90 }, { hold: 4 },
  { pause: true }, { eval: WAIT_ANSWER, timeout: 260 }, { resume: true }, { eval: READ(16), timeout: 40 },
  // a2_version：谈话回写成规则（手术室工作室）
  { go: `${BASE}/lab/studio/${OR}`, wait: 7000 }, { note: 'a2_version' }, { eval: SCROLL(700, 8), timeout: 25 },
  // a3_assets：人 / 景 / 物
  { go: `${BASE}/lab/assets`, wait: 7000 }, { note: 'a3_assets' }, { eval: SCROLL(500, 6), timeout: 20 },
  { note: 'end_fix' }, { hold: 1 },
];
