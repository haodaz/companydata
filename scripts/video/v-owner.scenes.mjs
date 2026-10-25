/** 《真活 1.0 · 管理空间怎么用》：出题人空间从上到下——状态与数字、分享区（预览 / 发布 / 下架 / 重跑基线 / 对比）、按意见修订、各个标签页、做题情况与报告。
 *   OWNER_URL=<带密钥的空间链接> */
import fs from 'node:fs';
import { run, BASE, cover } from './_rec-helpers.mjs';
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const OWNER = process.env.OWNER_URL;
const tab = (re) => run(`const t = [...document.querySelectorAll('.ant-tabs-tab')].find(x => ${re}.test(x.textContent)); if (t) { await L.glide(L.top(t, 110), 1200); t.click(); } await L.sleep(800); return 1;`);
export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('真活 1.0 使用演示 · 四//|管理空间怎么用', '百业AI｜真活 · 平方智能', 92), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  { pause: true }, { go: OWNER, wait: 7000 }, { eval: run(`await L.until(() => document.body.innerText.includes('参与链接'), 30000); scrollTo(0, 0); await L.sleep(500); return 1;`), timeout: 40 }, { resume: true },
  { note: 'own_tour_1' }, { eval: run(`try { localStorage.removeItem('work-owner-tour-done'); } catch {} if (!document.body.innerText.includes('界面说明')) { const q = [...document.querySelectorAll('button')].find(b => b.title === '界面说明'); q && q.click(); } await L.sleep(7000); return 1;`), timeout: 30 },
  { note: 'own_tour_2' }, { eval: run(`L.btn(/^下一步$/).click(); await L.sleep(7000); return 1;`), timeout: 20 },
  { note: 'own_tour_3' }, { eval: run(`L.btn(/^下一步$/).click(); await L.sleep(6000); return 1;`), timeout: 20 },
  { note: 'own_tour_4' }, { eval: run(`L.btn(/^下一步$/).click(); await L.sleep(6500); L.btn(/^知道了$/).click(); await L.sleep(800); scrollTo({ top: 0, behavior: 'smooth' }); await L.sleep(800); return 1;`), timeout: 20 },
  { note: 'own_top' }, { hold: 6 },
  { note: 'own_share' }, { eval: run(`for (const re of [/预览做题台/, /复制参与链接|^发布$/, /下架|^发布$/, /重跑 AI 基线/, /对比通用模型/]) { const b = L.btn(re); if (b) await L.flash(b, 1100); await L.sleep(300); } await L.sleep(1500); return 1;`), timeout: 40 },
  { note: 'own_revise' }, { eval: run(`const ta = [...document.querySelectorAll('textarea')].find(t => /标准太宽|按你的意见改|比如/.test(t.placeholder)); await L.glide(L.top(ta, 200), 1200); await L.type(ta, '尽调清单改成最多 8 条，按优先级排；时间压到 75 分钟。', 60); await L.sleep(600); const b = L.btn(/按意见修订/); await L.flash(b, 800); b.click(); await L.sleep(3000); return 1;`), timeout: 60 },
  { pause: true }, { eval: run(`await L.until(() => document.body.innerText.includes('改好了') || document.body.innerText.includes('修订记录'), 300000); await L.sleep(1500); return 1;`), timeout: 320 }, { resume: true },
  { note: 'own_revised' }, { hold: 6 },
  { note: 'own_tab_problem' }, { eval: tab('/问题与任务/') }, { hold: 6 },
  { note: 'own_tab_steps' }, { eval: tab('/推进步骤/') }, { eval: run(`await L.glide(scrollY + 300, 1800); await L.sleep(3500); return 1;`), timeout: 20 },
  { note: 'own_tab_materials' }, { eval: tab('/材料包/') }, { eval: run(`await L.sleep(1500); const m = [...document.querySelectorAll('b, span, div')].find(e => /^m2 /.test(e.textContent || '') && (e.textContent || '').length < 60); if (m) { await L.flash(m, 800); m.click(); } await L.sleep(4000); return 1;`), timeout: 30 },
  { note: 'own_tab_rubric' }, { eval: tab('/rubric/i') }, { eval: run(`await L.sleep(1500); await L.glide(scrollY + 320, 2000); await L.sleep(3500); return 1;`), timeout: 20 },
  { note: 'own_tab_baseline' }, { eval: tab('/AI 基线/') }, { eval: run(`await L.sleep(1500); await L.glide(scrollY + 300, 2000); await L.sleep(3000); return 1;`), timeout: 20 },
  { note: 'own_tab_sessions' }, { eval: tab('/做题情况/') }, { hold: 5 },
  { note: 'own_report' }, { eval: run(`const b = L.btn(/^看报告$/); if (b) { await L.flash(b, 800); b.click(); } await L.sleep(3500); const dr = document.querySelector('.ant-drawer-body'); if (dr) { await L.glideEl(dr, 600, 2400); await L.sleep(3500); await L.glideEl(dr, 1500, 3000); await L.sleep(3000); } return 1;`), timeout: 40 },
  { note: 'own_report_link' }, { eval: run(`document.querySelector('.ant-drawer-close')?.click(); await L.sleep(800); const b = L.btn(/报告链接/); if (b) { await L.flash(b, 1200); } await L.sleep(3000); return 1;`), timeout: 20 },
  { pause: true }, { go: cover('题、人、报告//|都在一个空间里', '百业AI｜真活 · 平方智能', 92), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 5 },
];
