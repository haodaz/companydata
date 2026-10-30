/** 《真活 1.1 · 看他怎么用 AI》更新说明小片：片头 → 三张图卡 → AI 使用标准页 → 报告里的 AI 使用能力 → 片尾。TASK_FILE={token,k} */
import fs from 'node:fs';
import { run, BASE, cover, chart } from './_rec-helpers.mjs';
const { token, k } = JSON.parse(fs.readFileSync(process.env.TASK_FILE, 'utf8'));
const OWN = `${BASE}/work/${token}/owner?k=${encodeURIComponent(k)}`;
const TAB = t => `[...document.querySelectorAll('.ant-tabs-tab')].find(x => x.textContent.includes('${t}'))`;
export default [
  { pause: true }, { go: cover('真活 1.1//|看他怎么用 AI', '本次更新 · AI 使用能力', 96), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  { pause: true }, { go: `${BASE}/video/chart-ai.html?id=why`, wait: 1500 }, { resume: true }, { note: 'ch_why' }, { hold: 8 },
  { pause: true }, { go: `${BASE}/video/chart-ai.html?id=parts`, wait: 1500 }, { resume: true }, { note: 'ch_parts' }, { hold: 7 },
  { pause: true }, { go: `${BASE}/video/chart-ai.html?id=vary`, wait: 1500 }, { resume: true }, { note: 'ch_vary' }, { hold: 10 },
  // AI 使用标准页
  { pause: true }, { go: OWN, wait: 3000 }, { eval: run(`localStorage.setItem('work-owner-tour-done', '1'); return 1;`), timeout: 10 }, { go: OWN, wait: 4500 },
  { eval: run(`const t = ${TAB('AI 使用标准')}; t?.click(); await L.sleep(1500); await L.glide(L.top(t, 90), 10); return 1;`), timeout: 20 },
  { resume: true }, { note: 'std' }, { hold: 3 },
  { eval: run(`const h = [...document.querySelectorAll('div')].find(x => x.textContent.trim() === '治理红线'); if (h) await L.glide(L.top(h, 300), 2600); return 1;`), timeout: 20 }, { hold: 3 },
  // 报告里的 AI 使用能力
  { pause: true }, { eval: run(`window.scrollTo(0, 0); const t = ${TAB('做题情况')}; t?.click(); await L.sleep(1500); const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes('林远')); [...(row?.querySelectorAll('button') || [])].find(x => x.textContent.includes('看报告'))?.click(); await L.sleep(2500); return 1;`), timeout: 20 },
  { resume: true }, { note: 'report' }, { hold: 3 },
  { eval: run(`const body = document.querySelector('.ant-drawer-body'); const el = [...body.querySelectorAll('div')].find(x => x.textContent.startsWith('AI 使用能力 · 怎么问')); if (el) await L.glideEl(body, el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 20, 2200); return 1;`), timeout: 20 }, { hold: 7 },
  { pause: true }, { go: cover('AI 使用能力//|已上线', '百业AI｜真活 · www.aidataoffice.com', 100), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 4 },
];
