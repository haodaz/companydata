/**
 * 《给课题组订一位科研 AI》（2026-11-03，约 2.5 分钟）：封面 → 通用模型会替你把空白补上（真实作答原话）→ 导师来订（/college/hire?for=research）
 *   → 三层课程 → 研究方法论：博士第一周（周四下午「两个离群点」走两步）→ 实验方法课一闪（证明有）→ 用论文出题（A/B/C）→ 三个模型的成绩
 *   → 人只做校正 / 公共课私域课 → 片尾。
 *   RESULTS='[{"name":"qwen-plus","A":..,"B":..,"C":..,"Cof":9},...]' ADMIN_TOKEN_FILE=… node scripts/video/drive.mjs out/v-research-ai scripts/video/v-research-ai.scenes.mjs --width=1600 --height=900 --dsf=2 --out=3200x1800
 */
import fs from 'node:fs';
import { run as labRun } from './lab-surgeon.scenes.mjs';
import { run, BASE, cover as cov } from './_rec-helpers.mjs';

const TOKEN = fs.readFileSync(process.env.ADMIN_TOKEN_FILE, 'utf8').trim().split('\n').pop();
const SPACE = 'd742fcf4-bea0-487e-bfb7-b3f7d0bf1a24';
const cover = (line, sub, size) => `${cov(line, sub, size)}&badge=0&brand=${encodeURIComponent('百业学院 · 一所 AI 学院')}`;
const chart = (id, extra = '') => `${BASE}/video/chart-research.html?id=${id}${extra}`;
const RESULTS = process.env.RESULTS || '[]';
const NOTE = process.env.RESULTS_NOTE || '';

const enter = slot => labRun(`
  window.__stepFrom = 0;
  const t = await L.until(() => [...document.querySelectorAll('.dayv-tl button')].find(b => b.innerText.includes('${slot}')));
  await L.click(t, 1500); window.scrollTo({ top: 0 });
  await L.click(await L.until(() => L.btn('进入操作台')), 2500);
  await L.click(await L.until(() => L.btn('开始这一段')), 1800); return 'start ${slot}';`);
const walk = (slot, n) => labRun(`
  const sp = await fetch('/api/lab/spaces/${SPACE}').then(r => r.json());
  const ch = sp.space.chapters.find(c => c.slot === '${slot}'); const tr = ch.expert_trace || {}; const out = [];
  await L.dialogue(); await L.sleep(800);
  for (const st of ch.sim.steps.slice(0, ${n})) { if (st.type === 'text' || st.type === 'bench') break; out.push(st.id + ':' + await L.answer(st, tr[st.id])); await L.sleep(1200); }
  return out;`);

export default [
  { cookie: { name: 'auth_token', value: TOKEN, url: BASE } },
  { pause: true }, { go: cover('给课题组//|订一位科研 AI', '研究所 · 课题组 · 导师 —— 百业学院的新专业方向', 92), wait: 2500 }, { resume: true }, { note: 'cover' }, { hold: 5 },
  { pause: true }, { go: chart('gap'), wait: 1500 }, { resume: true }, { note: 'ch_gap' }, { hold: 12 },
  // 导师来订
  { pause: true }, { go: `${BASE}/college/hire?for=research`, wait: 5000 }, { resume: true }, { note: 'hire' }, { hold: 4 },
  { eval: run(`const el = document.getElementById('methods'); await L.glide(L.top(el, 40), 3500); return 1;`), timeout: 20 }, { hold: 3 },
  { eval: run(`const el = document.getElementById('apply'); await L.glide(L.top(el, 20), 3000); return 1;`), timeout: 20 }, { note: 'hire_form' }, { hold: 3 },
  { pause: true }, { go: chart('layers'), wait: 1500 }, { resume: true }, { note: 'ch_layers' }, { hold: 12 },
  // 研究方法论：博士第一周
  { pause: true }, { go: `${BASE}/lab/${SPACE}?m=test`, wait: 6000 },
  { local: { 'lab:visitor': 'v:demo-research-ai-video', 'lab:rookie': { name: '小周', note: '环境科学 · 博一', location: '南京' }, 'lab:rookie:asked': '1' }, wait: 8000 },
  { resume: true }, { note: 'core_day' }, { hold: 3 }, { scroll: 650, over: 3.5 }, { scroll: 0, over: 1.5 },
  { eval: enter('周四下午'), timeout: 40 }, { note: 'core_ch' },
  { eval: walk('周四下午', 2), timeout: 150 }, { hold: 2 },
  // 实验方法课一闪
  { pause: true }, { go: `${BASE}/admin/db-method?id=1`, wait: 5000 }, { resume: true }, { note: 'methods' }, { hold: 3.5 },
  // 用论文出题 → 成绩
  { pause: true }, { go: chart('exams'), wait: 1500 }, { resume: true }, { note: 'ch_exams' }, { hold: 12 },
  { pause: true }, { go: chart('results', `&d=${encodeURIComponent(RESULTS)}&note=${encodeURIComponent(NOTE)}`), wait: 2500 }, { resume: true }, { note: 'ch_results' }, { hold: 12 },
  { pause: true }, { go: chart('human'), wait: 1500 }, { resume: true }, { note: 'ch_human' }, { hold: 11 },
  { pause: true }, { go: cover('先学会说「不知道」//|再学做研究', '百业学院 · 科研 AI · www.baiyecollege.com', 88), wait: 2500 }, { resume: true }, { note: 'end' }, { hold: 5 },
];
