/** 《真活 1.0 · 填表出题》：封面 → 第一页（题目）→ 第二页（出题台）→ 出题 → 出题步骤图卡 → 待发布的空间 → 预览做题台 → 发布。
 *   TOKEN_FILE=… node scripts/video/drive.mjs out/v-form scripts/video/v-form.scenes.mjs --width=1600 --height=900 --dsf=2 --out=3200x1800 */
import fs from 'node:fs';
import { run, BASE, cover, chart } from './_rec-helpers.mjs';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('真活 1.0 使用演示 · 一//|填表出题', '百业AI｜真活 · 平方智能', 92), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  { pause: true }, { go: chart('two-ways'), wait: 1500 }, { resume: true }, { note: 'ch_two' }, { hold: 5 },
  { pause: true }, { go: `${BASE}/work/new`, wait: 6000 }, { eval: run(`await L.until(() => document.querySelector('h1'), 20000); scrollTo(0, 0); await L.sleep(600); return 1;`), timeout: 30 }, { resume: true },
  { note: 'form_open' }, { hold: 6 },
  { note: 'form_company' }, { eval: run(`const co = document.querySelector('.ant-select input'); await L.type(co, '高瓴', 120); await L.sleep(1800); const opt = await L.until(() => [...document.querySelectorAll('.ant-select-item-option')].find(o => /高瓴资本/.test(o.textContent)), 8000); if (opt) { await L.flash(opt, 700); opt.click(); } await L.sleep(1800); return 1;`), timeout: 40 },
  { note: 'form_role' }, { eval: run(`const role = document.querySelector('.ant-select textarea'); await L.type(role, '我要一个能看懂 AI 基础设施、来做早期投资的人', 70); await L.sleep(1200); document.body.click(); await L.sleep(800); return 1;`), timeout: 40 },
  { note: 'form_focus' }, { eval: run(`const tas = [...document.querySelectorAll('textarea')]; const ta = tas.find(t => /聚焦/.test(t.placeholder)); if (ta) { await L.glide(L.top(ta, 220), 1200); await L.type(ta, '围绕最近看的 AI 芯片设计智能体这类项目；给 1–3 年经验的人做；90 分钟', 60); } await L.sleep(800); const s3 = L.byText('span', /题里要给做题人什么素材/); if (s3) { await L.glide(L.top(s3, 160), 1600); } await L.sleep(3500); return 1;`), timeout: 60 },
  { note: 'form_next' }, { eval: run(`const b = L.btn(/下一步/); await L.glide(L.top(b, 420), 1000); await L.flash(b, 800); b.click(); await L.sleep(1200); scrollTo(0, 0); await L.sleep(5000); return 1;`), timeout: 40 },
  { note: 'form_go' }, { eval: run(`const b = L.btn(/^出题/); await L.flash(b, 900); b.click(); await L.sleep(6000); return 1;`), timeout: 40 },
  { pause: true }, { eval: run(`await L.until(() => location.pathname.includes('/owner'), 480000); await L.sleep(2500); scrollTo(0, 0); return 1;`), timeout: 500 }, { resume: true },
  { note: 'space_top' }, { hold: 6 },
  { note: 'space_body' }, { eval: run(`await L.glide(560, 2200); await L.sleep(5000); await L.glide(scrollY + 520, 2400); await L.sleep(4000); scrollTo({ top: 0, behavior: 'smooth' }); await L.sleep(1200); return 1;`), timeout: 40 },
  { note: 'space_preview' }, { eval: run(`const b = L.btn(/预览做题台/); await L.flash(b, 900); const u = location.pathname.replace('/owner', '') + location.search; location.href = u; await L.sleep(5000); await L.glide(500, 2000); await L.sleep(2500); history.back(); await L.until(() => location.pathname.includes('/owner'), 20000); await L.sleep(1500); return 1;`), timeout: 60 },
  { note: 'space_publish' }, { eval: run(`const b = L.btn(/^发布$/); await L.flash(b, 900); b.click(); await L.until(() => L.btn(/复制参与链接/), 20000); await L.sleep(1200); await L.flash(L.btn(/复制参与链接/), 1200); await L.sleep(3500); return 1;`), timeout: 60 },
  { pause: true }, { go: chart('pipeline'), wait: 1500 }, { resume: true }, { note: 'ch_pipe' }, { hold: 5 },
  { pause: true }, { go: cover('题出好了//|先预览，再发布', '百业AI｜真活 · 平方智能', 92), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 5 },
];
